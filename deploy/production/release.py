"""App-only release transaction. Linux host; never owns ingress or network lifecycle.

The operator pre-provisions private application/lock directories. A deploy or
rollback invocation requires separate owner authorization; no automatic rollback
can decide whether restoring a database and losing later writes is acceptable.
"""

import argparse
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

CONFIG = json.loads((Path(__file__).parent / "app.json").read_text(encoding="utf-8"))
if CONFIG["contract_version"] != 1:
    raise ValueError("Unsupported release contract version")
APP = CONFIG["app"]
BACKEND = CONFIG["services"]["backend"]
FRONTEND = CONFIG["services"]["frontend"]
SERVICES = (BACKEND, FRONTEND)
DOMAIN = CONFIG["domain"]
ORIGIN = "https://" + DOMAIN
EGRESS = CONFIG["egress"]
DB_FILE = CONFIG["database"]["filename"]
DB_TARGET = CONFIG["database"]["target"]
LOCK_DIR = Path("/var/lib/jude-deploy-locks")
PAYLOAD = {"compose.yml", ".backend.env", "release.py", "release.json", "app.json"}
RUN_ID = re.compile(r"[0-9a-f]{40}-[0-9]+-[0-9]+")
DIGEST = re.compile(
    r"ghcr\.io/[a-z0-9-]+/" + APP + r"-(backend|frontend)@sha256:[0-9a-f]{64}"
)


class ReleaseError(RuntimeError):
    pass


def run(args, timeout=300):
    # Never echo captured output: Compose, inspect and Django may include secrets.
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        raise ReleaseError("Command timed out: " + args[0]) from error
    if result.returncode:
        raise ReleaseError(
            "Command failed: " + args[0] + " (output withheld; inspect privately)"
        )
    return result.stdout


def docker(*args, timeout=300):
    return run(["docker", *map(str, args)], timeout=timeout)


def private_dir(path):
    if path.is_symlink() or not path.is_dir():
        raise ReleaseError("Expected a pre-provisioned private directory")
    info = path.stat()
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ReleaseError(
            "Directory must be owned by the deploy identity with mode 0700"
        )
    return path


def regular(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_nlink != 1:
        raise ReleaseError("Expected a regular non-symlink file")
    return path


def write_private(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(value)
    path.chmod(0o600)


def atomic_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    if temporary.exists() or temporary.is_symlink():
        raise ReleaseError("Unexpected state temporary file")
    write_private(temporary, json.dumps(value, indent=2) + "\n")
    os.replace(temporary, path)


@contextmanager
def held_lock(path, kind):
    import fcntl

    regular(path)
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if info.st_uid != os.geteuid() or info.st_mode & 0o077 or info.st_nlink != 1:
            raise ReleaseError("Unsafe lock ownership/mode")
        try:
            fcntl.flock(fd, kind | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ReleaseError(
                "Maintenance or app release already in progress"
            ) from error
        yield
    finally:
        os.close(fd)


@contextmanager
def locks(directory=LOCK_DIR):
    import fcntl

    private_dir(directory)
    with held_lock(directory / "maintenance.lock", fcntl.LOCK_SH):
        with held_lock(directory / (APP + ".lock"), fcntl.LOCK_EX):
            yield


def validate_bundle(bundle):
    private_dir(bundle)
    if not RUN_ID.fullmatch(bundle.name):
        raise ReleaseError("Invalid unique release identity")
    manifest = json.loads(regular(bundle / "manifest.json").read_text())
    if set(manifest) != PAYLOAD or {p.name for p in bundle.iterdir()} != PAYLOAD | {
        "manifest.json"
    }:
        raise ReleaseError("Unexpected or missing bundle files")
    for name, digest in manifest.items():
        path = regular(bundle / name)
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ReleaseError("Bundle checksum mismatch")
        if path.stat().st_mode & 0o077:
            raise ReleaseError("Bundle files must have mode 0600")
    release = json.loads((bundle / "release.json").read_text())
    if release["app"] != APP or release["id"] != bundle.name:
        raise ReleaseError("Bundle identity mismatch")
    if release["revision"] != bundle.name.split("-")[0]:
        raise ReleaseError("Bundle revision mismatch")
    for service in ("backend", "frontend"):
        if (
            not DIGEST.fullmatch(release[service])
            or f"/{APP}-{service}@" not in release[service]
        ):
            raise ReleaseError(
                "Both image references must be app-specific immutable digests"
            )
    return release


def compose(directory, *args, timeout=300):
    return docker(
        "compose",
        "--project-directory",
        directory,
        "-p",
        APP,
        "--env-file",
        directory / ".release.env",
        "-f",
        (directory / "activation.json")
        if (directory / "activation.json").exists()
        else (directory / "compose.yml"),
        *args,
        timeout=timeout,
    )


def inspect(name):
    return json.loads(docker("inspect", name))[0]


def preflight(root):
    private_dir(root)
    regular(root / DB_FILE)
    if not (root / DB_FILE).stat().st_size:
        raise ReleaseError(
            "Existing nonempty SQLite database is required; bootstrap is separate"
        )
    if (root / "FAILED.json").exists():
        raise ReleaseError(
            "Resolve the failed release before trying another deployment"
        )
    gateway_config = CONFIG["gateway"]
    expected = gateway_config["networks"]
    gateway = inspect(gateway_config["container"])
    if (
        not gateway["State"]["Running"]
        or gateway["Config"]["Labels"].get("com.docker.compose.project")
        != gateway_config["project"]
    ):
        raise ReleaseError("Approved host ingress must already be active")
    if set(gateway["NetworkSettings"]["Networks"]) != set(expected):
        raise ReleaseError("Ingress network boundary changed")
    for network, address in gateway_config["addresses"].items():
        if gateway["NetworkSettings"]["Networks"][network]["IPAddress"] != address:
            raise ReleaseError("Ingress trusted peer changed")
    for name, policy in expected.items():
        network = json.loads(docker("network", "inspect", name))[0]
        actual = {c["Name"] for c in network["Containers"].values()}
        # Allowed and required membership are distinct contract fields. A companion
        # outage must not block independent recovery; own app/gateway stay mandatory.
        if (
            network["Internal"] != policy["internal"]
            or [p["Subnet"] for p in network["IPAM"]["Config"]] != [policy["subnet"]]
            or not actual <= set(policy["allowed"])
            or not set(policy["required"]) <= actual
        ):
            raise ReleaseError("Route network invariant failed")
    backend = inspect(CONFIG["containers"]["backend"])
    frontend = inspect(CONFIG["containers"]["frontend"])
    if set(backend["NetworkSettings"]["Networks"]) != set(
        CONFIG["backend_networks"]
    ) or set(frontend["NetworkSettings"]["Networks"]) != set(
        CONFIG["frontend_networks"]
    ):
        raise ReleaseError("App network isolation changed")
    for network, address in CONFIG["backend_addresses"].items():
        if backend["NetworkSettings"]["Networks"][network]["IPAddress"] != address:
            raise ReleaseError("Backend address invariant changed")
    if not set(CONFIG["backend_required_env"]) <= set(backend["Config"]["Env"]):
        raise ReleaseError("Backend trust invariant changed")
    if backend["HostConfig"]["PortBindings"]:
        raise ReleaseError("Backend unexpectedly publishes a port")
    ports = {
        (port, binding["HostIp"], binding["HostPort"])
        for port, bindings in (frontend["HostConfig"]["PortBindings"] or {}).items()
        for binding in (bindings or [])
    }
    allowed = [
        {tuple(binding) for binding in form}
        for form in CONFIG["frontend_port_bindings"]
    ]
    if ports not in allowed:
        raise ReleaseError("Frontend published-port boundary changed")
    mounts = [m for m in backend["Mounts"] if m["Destination"] == DB_TARGET]
    if len(mounts) != 1 or Path(mounts[0]["Source"]) != root / DB_FILE:
        raise ReleaseError("Existing database bind source differs")
    # Policy floors are configurable only by separately reviewed code/operator policy.
    disk = shutil.disk_usage(root)
    reserve = 8 * (root / DB_FILE).stat().st_size + 64 * 1024 * 1024
    if (disk.free - reserve) / disk.total < 0.20:
        raise ReleaseError("Insufficient disk for recovery plus 20 percent headroom")
    mem = dict(
        line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines()
    )
    if int(mem["MemAvailable"].split()[0]) < 512 * 1024:
        raise ReleaseError("Less than 512 MiB available memory")
    return gateway


def snapshot(source, destination):
    regular(source)
    deadline = time.monotonic() + 60

    def progress(status, remaining, total):
        if time.monotonic() >= deadline:
            raise ReleaseError("SQLite snapshot/restore exceeded 60 seconds")

    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as db:
        with closing(sqlite3.connect(destination)) as backup:
            db.backup(backup, pages=256, progress=progress, sleep=0.1)
            backup.execute("PRAGMA journal_mode=DELETE")
            if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ReleaseError("SQLite backup integrity failed")
    destination.chmod(0o600)
    # Prove a restore into an isolated file, not just backup existence.
    restored = destination.with_suffix(".restore-check")
    try:
        with (
            closing(sqlite3.connect(destination)) as backup,
            closing(sqlite3.connect(restored)) as copy,
        ):
            backup.backup(copy, pages=256, progress=progress, sleep=0.1)
            if copy.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ReleaseError("SQLite restore verification failed")
    finally:
        restored.unlink(missing_ok=True)


def container_ids(*filters):
    args = ["ps", "-aq"]
    for value in filters:
        args.extend(["--filter", "label=" + value])
    identities = docker(*args).splitlines()
    if any(not re.fullmatch(r"[0-9a-f]{12,64}", identity) for identity in identities):
        raise ReleaseError("Unexpected writer container identity")
    return identities


def management_containers():
    return container_ids("org.jude.release.app=" + APP)


def app_writers():
    identities = set(management_containers()) | set(
        container_ids(
            "com.docker.compose.project=" + APP, "com.docker.compose.service=" + BACKEND
        )
    )
    return [inspect(identity) for identity in sorted(identities)]


def stop_writers():
    # Compose replacement names are temporary; discover by project/service labels.
    for writer in app_writers():
        docker("stop", "--time", "10", writer["Id"], timeout=30)
        if inspect(writer["Id"])["State"]["Running"]:
            raise ReleaseError("App writer did not stop")


def begin_data_state(root):
    backend = inspect(CONFIG["containers"]["backend"])
    atomic_json(
        root / "data-state.json",
        {
            "writer": {"id": backend["Id"]},
            "checkpoint": None,
            "retired": [w["Id"] for w in app_writers() if w["Id"] != backend["Id"]],
        },
    )


def data_state(root):
    return json.loads(regular(root / "data-state.json").read_text())


def checkpoint_data(root, source):
    # Retire every consumed journal BEFORE changing the main database inode.
    # A crash after this marker uses the complete, immutable checkpoint below.
    regular(source)
    atomic_json(
        root / "data-state.json",
        {
            "writer": None,
            "checkpoint": str(source),
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "retired": [w["Id"] for w in app_writers()],
        },
    )


def arm_writer(root):
    state = data_state(root)
    generation = uuid.uuid4().hex
    state["writer"] = {"generation": generation}
    atomic_json(root / "data-state.json", state)
    return generation


def prepare_backend(root, directory):
    model = json.loads(
        compose(directory, "config", "--format", "json", "--no-env-resolution")
    )
    generation = arm_writer(root)
    model["services"][BACKEND].setdefault("labels", {})["org.jude.db.generation"] = (
        generation
    )
    atomic_json(directory / "activation.json", model)


def snapshot_writer(root, destination):
    state = data_state(root)
    writers = app_writers()
    if any(writer["State"]["Running"] for writer in writers):
        raise ReleaseError("All app and management writers must stop before snapshot")
    selected = []
    provenance = state["writer"]
    for writer in writers:
        if writer["Id"] in state["retired"]:
            continue  # old sidecars must NEVER be paired with a replacement DB inode
        labels = writer["Config"]["Labels"]
        matches = provenance and (
            writer["Id"] == provenance.get("id")
            or labels.get("org.jude.db.generation") == provenance.get("generation")
            and provenance.get("generation") is not None
        )
        if not matches:
            raise ReleaseError("Untracked database writer requires operator review")
        if writer["State"]["StartedAt"] != "0001-01-01T00:00:00Z":
            selected.append(writer)
    if len(selected) > 1:
        raise ReleaseError("Multiple writers for one database generation")
    if not selected:
        # Covers a failure before replacement creation/rename/start. The captured
        # data remains authoritative even when no canonical backend name exists.
        checkpoint = Path(state["checkpoint"] or "")
        if not checkpoint.is_relative_to(root) or not checkpoint.is_file():
            raise ReleaseError("No complete database generation is available")
        regular(checkpoint)
        if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != state["sha256"]:
            raise ReleaseError("Database checkpoint checksum mismatch")
        snapshot(checkpoint, destination)
        return
    writer = selected[0]
    mounts = [m for m in writer["Mounts"] if m["Destination"] == DB_TARGET]
    if len(mounts) != 1 or Path(mounts[0]["Source"]) != root / DB_FILE:
        raise ReleaseError("Recovery writer has an unexpected database bind")
    with tempfile.TemporaryDirectory(
        prefix="sqlite-capture-", dir=destination.parent
    ) as directory:
        source = Path(directory) / "db.sqlite3"
        for suffix in ("", "-wal", "-journal"):
            target = Path(str(source) + suffix)
            remote = writer["Id"] + ":" + DB_TARGET + suffix
            result = subprocess.run(
                ["docker", "cp", remote, str(target)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode:
                if suffix and "Could not find the file" in result.stderr:
                    continue
                raise ReleaseError("Could not capture stopped writer database/journal")
            target.chmod(0o600)
        # Opening this isolated copy can replay a hot journal, without modifying
        # the original mount or retained container. Never copy SHM bookkeeping.
        with closing(sqlite3.connect(source)) as database:
            if database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ReleaseError("Stopped writer database integrity failed")
        snapshot(source, destination)


def capture_recovery(root, candidate, recovery):
    recovery.mkdir(mode=0o700)
    state = {}
    model = json.loads(
        compose(candidate, "config", "--format", "json", "--no-env-resolution")
    )
    for key, suffix in ((BACKEND, "backend"), (FRONTEND, "frontend")):
        container = inspect(CONFIG["containers"][suffix])
        if container["Config"]["Labels"].get("com.docker.compose.project") != APP:
            raise ReleaseError("App container project mismatch")
        state[suffix] = container
        service = model["services"][key]
        service["image"] = container["Image"]  # captured local content ID; never pull
        service["command"] = container["Config"]["Cmd"]
        service["entrypoint"] = container["Config"]["Entrypoint"]
        service["user"] = container["Config"]["User"]
        service.pop("environment", None)
        env_name = "." + suffix + ".env"
        values = container["Config"]["Env"]
        if any("\n" in value or "\r" in value for value in values):
            raise ReleaseError("Multiline runtime env needs explicit recovery handling")
        write_private(recovery / env_name, "\n".join(values) + "\n")
        service["env_file"] = [{"path": str(recovery / env_name), "format": "raw"}]
        service["ports"] = [
            {
                "target": int(port.split("/")[0]),
                "published": bind["HostPort"],
                "host_ip": bind["HostIp"],
                "protocol": port.split("/")[1],
            }
            for port, bindings in (
                container["HostConfig"]["PortBindings"] or {}
            ).items()
            for bind in (bindings or [])
        ]
        if suffix == "frontend" and container["Mounts"]:
            raise ReleaseError(
                "Unexpected frontend mounts require explicit recovery review"
            )
        if suffix == "backend" and len(container["Mounts"]) != 1:
            raise ReleaseError(
                "Unexpected backend mounts require explicit recovery review"
            )
    # Escape interpolation in runtime commands; raw env files preserve credentials.
    text = json.dumps(model).replace("$", "$$")
    write_private(recovery / "compose.yml", text)
    write_private(recovery / ".release.env", "")
    write_private(recovery / "runtime.json", json.dumps(state))  # private, contains Env
    current = root / "current.json"
    write_private(
        recovery / "previous.json", current.read_text() if current.exists() else "{}"
    )
    # Preserve original artifacts as evidence, NEVER execute old proxy-owning scripts.
    evidence = recovery / "legacy-evidence"
    evidence.mkdir(mode=0o700)
    for name in (
        "docker-compose.yml",
        "docker-compose.override.yml",
        "docker-compose.shared.yml",
        "deploy-production.sh",
        ".env",
        ".backend.env",
        "nginx-proxy.conf",
        "nginx-shared.conf",
    ):
        path = root / name
        if path.exists():
            regular(path)
            shutil.copyfile(path, evidence / name)
            (evidence / name).chmod(0o600)
    if current.exists():
        old_dir = Path(json.loads(current.read_text())["directory"])
        if not old_dir.is_relative_to(root) or old_dir.is_symlink():
            raise ReleaseError("Invalid previous release directory")
        previous = recovery / "previous-release"
        previous.mkdir(mode=0o700)
        for name in (
            "compose.yml",
            ".release.env",
            ".backend.env",
            ".frontend.env",
            "release.py",
            "app.json",
            "release.json",
            "manifest.json",
        ):
            if (old_dir / name).exists():
                regular(old_dir / name)
                shutil.copyfile(old_dir / name, previous / name)
                (previous / name).chmod(0o600)


def check_response(path, status, predicate):
    request = urllib.request.Request(
        ORIGIN + path,
        headers={"Cache-Control": "no-cache", "User-Agent": "JudeAppRelease/1.0"},
    )
    try:
        response = urllib.request.urlopen(request, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(256 * 1024)
        if response.status != status or not predicate(response.headers, body):
            raise ReleaseError("Readiness response did not match " + path)


def response_matches(rule, headers, body):
    """Evaluate declarative app probes without app-specific branches."""
    if "content_type" in rule and rule["content_type"] not in headers.get(
        "Content-Type", ""
    ):
        return False
    if "body_contains" in rule:
        value = body.lower() if rule.get("ignore_case") else body
        if rule["body_contains"].encode() not in value:
            return False
    if "json_equals" in rule:
        value = json.loads(body)
        if not isinstance(value, dict):
            return False
        if any(
            value.get(key) != expected for key, expected in rule["json_equals"].items()
        ):
            return False
    return all(
        value in headers.get(key, "")
        for key, value in rule.get("header_contains", {}).items()
    )


def readiness(directory):
    # Direct backend test prevents a cached frontend/edge response masking a dead app.
    policy = CONFIG["readiness"]
    check = (
        "import urllib.request,urllib.error; "
        "q=urllib.request.Request("
        + repr(policy["direct_url"])
        + ",headers={'Host':"
        + repr(DOMAIN)
        + "}); "
        "\ntry: urllib.request.urlopen(q,timeout=5); raise SystemExit(1)"
        "\nexcept urllib.error.HTTPError as e: raise SystemExit(0 if e.code == "
        + str(policy["direct_status"])
        + " else 1)"
    )
    deadline = time.monotonic() + 90
    while True:
        try:
            compose(directory, "exec", "-T", BACKEND, "python", "-c", check, timeout=10)
            for rule in policy["public"]:
                check_response(
                    rule["path"],
                    rule["status"],
                    lambda headers, body, rule=rule: response_matches(
                        rule, headers, body
                    ),
                )
            return
        except (ReleaseError, OSError, ValueError, KeyError, urllib.error.URLError):
            if time.monotonic() >= deadline:
                raise ReleaseError(
                    "Readiness failed within the bounded retry window"
                ) from None
            time.sleep(2)


def stop_management():
    # A killed Docker CLI does not stop its container. Retain stopped one-offs:
    # they can contain WAL/journal evidence needed by snapshot_writer.
    for identity in management_containers():
        docker("stop", "--time", "10", identity, timeout=30)
        if inspect(identity)["State"]["Running"]:
            raise ReleaseError("Management writer did not stop")


def manage(directory, image, *args):
    # Management uses egress only, never the backend's reserved .3 address.
    metadata = json.loads((directory / "release.json").read_text())
    root = Path(metadata["database"]).parent
    generation = arm_writer(root)
    try:
        return docker(
            "run",
            "--name",
            APP + "-release-" + metadata["id"] + "-" + args[0],
            "--label",
            "org.jude.release.app=" + APP,
            "--label",
            "org.jude.release.id=" + metadata["id"],
            "--label",
            "org.jude.db.generation=" + generation,
            "--network",
            EGRESS,
            "--env-file",
            directory / ".backend.env",
            "--mount",
            "type=bind,source=" + metadata["database"] + ",target=" + DB_TARGET,
            image,
            "python",
            "manage.py",
            *args,
        )
    finally:
        # This also runs after timeout; labels/name persist through process death.
        # Failure leaves FAILED.json and retained writer evidence for the operator.
        stop_management()


def deploy(root, bundle):
    release = validate_bundle(bundle)
    preflight(root)
    stop_management()
    for name in ("releases", "recovery"):
        private_dir(root / name)
    candidate = root / "releases" / release["id"]
    if candidate.exists():
        raise ReleaseError("Release attempt already exists; use a new attempt ID")
    shutil.copytree(bundle, candidate)
    release["database"] = str(root / DB_FILE)
    (candidate / "release.json").write_text(json.dumps(release))
    write_private(
        candidate / ".release.env",
        "BACKEND_IMAGE="
        + release["backend"]
        + "\nFRONTEND_IMAGE="
        + release["frontend"]
        + "\nAPP_DB_PATH="
        + str(root / DB_FILE)
        + "\n",
    )
    compose(candidate, "config", "--quiet")
    compose(candidate, "pull", *SERVICES)
    preflight(root)  # disk policy must still pass after image staging
    recovery = root / "recovery" / release["id"]
    capture_recovery(root, candidate, recovery)
    begin_data_state(root)
    record = {
        "release": release["id"],
        "recovery": str(recovery),
        "stage": "before-stop",
    }
    atomic_json(
        root / "FAILED.json", record
    )  # also prevents a new deploy after process death
    try:
        stop_writers()
        snapshot_writer(root, recovery / "db.sqlite3")
        record["stage"] = "backup-verified"
        atomic_json(root / "FAILED.json", record)
        replace_database(root, recovery / "db.sqlite3")
        manage(candidate, release["backend"], "check", "--deploy")
        checked = candidate / "checked.sqlite3"
        snapshot_writer(root, checked)
        replace_database(root, checked)
        record["stage"] = "migration-started"
        atomic_json(root / "FAILED.json", record)
        manage(candidate, release["backend"], "migrate", "--noinput")
        # Consolidate committed container-local journals before a new app container
        # mounts the database. Keep its original ownership and mode.
        migrated = candidate / "migrated.sqlite3"
        snapshot_writer(root, migrated)
        replace_database(root, migrated)
        prepare_backend(root, candidate)
        compose(
            candidate,
            "up",
            "-d",
            "--no-deps",
            "--pull",
            "never",
            "--force-recreate",
            *SERVICES,
        )
        readiness(candidate)
        atomic_json(
            root / "current.json",
            {
                "id": release["id"],
                "directory": str(candidate),
                "revision": release["revision"],
                "backend": release["backend"],
                "frontend": release["frontend"],
                "recovery": str(recovery),
                "healthy": True,
            },
        )
        (root / "FAILED.json").unlink()
    except Exception:
        # Do not let newly migrated writers run while the operator assesses recovery.
        try:
            stop_writers()
        except ReleaseError:
            print(
                "Backend stop failed; operator must stop writers before recovery.",
                file=sys.stderr,
            )
        raise


def replace_database(root, source):
    info = regular(root / DB_FILE).stat()
    restored = root / ("restore-" + str(time.time_ns()) + ".sqlite3")
    snapshot(source, restored)
    os.chmod(restored, stat.S_IMODE(info.st_mode))
    os.chown(restored, info.st_uid, info.st_gid)
    checkpoint_data(root, source)
    # All actual writers are stopped. Preserve any host-side evidence too.
    for suffix in ("-wal", "-shm", "-journal"):
        sidecar = root / (DB_FILE + suffix)
        if sidecar.exists():
            regular(sidecar)
            os.replace(sidecar, source.parent / (restored.name + suffix))
    os.replace(restored, root / DB_FILE)


def rollback(root, recovery_id, restore_database, keep_database=False):
    private_dir(root)
    private_dir(root / "recovery")
    if not RUN_ID.fullmatch(recovery_id):
        raise ReleaseError("Invalid recovery identity")
    recovery = private_dir(root / "recovery" / recovery_id)
    regular(recovery / "compose.yml")
    regular(recovery / "runtime.json")
    if restore_database == keep_database:
        raise ReleaseError("Choose exactly one database recovery mode")
    if keep_database:
        failed = json.loads(regular(root / "FAILED.json").read_text())
        eligible = failed["stage"] in ("before-stop", "backup-verified") or (
            failed["stage"] == "rollback-started"
            and failed.get("keep_database_safe") is True
        )
        if failed["recovery"] != str(recovery) or not eligible:
            raise ReleaseError(
                "Database preservation is allowed only before migration started"
            )
    else:
        regular(recovery / "db.sqlite3")
    compose(recovery, "config", "--quiet")
    # Verify cached recovery images BEFORE stopping any current writer.
    for container in json.loads((recovery / "runtime.json").read_text()).values():
        docker("image", "inspect", container["Image"])
    atomic_json(
        root / "FAILED.json",
        {
            "recovery": str(recovery),
            "stage": "rollback-started",
            "keep_database_safe": keep_database,
        },
    )
    try:
        stop_management()
        stop_writers()
        # Preserve all current committed data, including container-local journals.
        rescue = recovery / ("before-rollback-" + str(time.time_ns()) + ".sqlite3")
        snapshot_writer(root, rescue)
        # Keep mode consolidates the SAME data before recreation, never an older DB.
        replace_database(root, recovery / "db.sqlite3" if restore_database else rescue)
        prepare_backend(root, recovery)
        compose(
            recovery,
            "up",
            "-d",
            "--no-deps",
            "--pull",
            "never",
            "--force-recreate",
            *SERVICES,
        )
        readiness(recovery)
        atomic_json(
            root / "current.json",
            {
                "id": "recovered-" + recovery_id,
                "directory": str(recovery),
                "recovery": str(recovery),
                "healthy": True,
            },
        )
        (root / "FAILED.json").unlink()
    except Exception:
        try:
            stop_writers()
        except ReleaseError:
            print(
                "Backend stop failed; operator must stop writers before recovery.",
                file=sys.stderr,
            )
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["deploy", "rollback"])
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--recovery")
    parser.add_argument("--restore-database", action="store_true")
    parser.add_argument("--keep-database", action="store_true")
    args = parser.parse_args()
    if not args.root.is_absolute() or ".." in args.root.parts or args.root.is_symlink():
        raise ReleaseError("Root must be an absolute application directory")
    root = args.root.resolve()
    if not re.fullmatch(r"/[A-Za-z0-9_/-]+", str(root)) or root == Path("/"):
        raise ReleaseError("Unsafe root path")
    os.umask(0o077)
    with locks():
        if args.operation == "deploy":
            if args.bundle is None or args.bundle.parent != root / "incoming":
                raise ReleaseError("Bundle must be the app's unique incoming directory")
            deploy(root, args.bundle)
        else:
            rollback(
                root, args.recovery or "", args.restore_database, args.keep_database
            )


if __name__ == "__main__":
    try:
        main()
    except (ReleaseError, OSError, ValueError, KeyError) as error:
        # Exceptions from parsed secrets or subprocess outputs must not expose their values.
        print(
            "Release failed; preserve recovery artifacts and inspect private state. "
            + (str(error) if isinstance(error, ReleaseError) else type(error).__name__),
            file=sys.stderr,
        )
        sys.exit(1)
