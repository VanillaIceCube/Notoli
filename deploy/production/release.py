"""Launch the two application services on their existing host networks."""

import argparse
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

CONFIG = json.loads((Path(__file__).parent / "app.json").read_text(encoding="utf-8"))
if CONFIG["contract_version"] != 1:
    raise ValueError("Unsupported release contract version")
APP = CONFIG["app"]
BACKEND = CONFIG["services"]["backend"]
FRONTEND = CONFIG["services"]["frontend"]
SERVICES = (BACKEND, FRONTEND)
DOMAIN = CONFIG["domain"]
ORIGIN = "https://" + DOMAIN
READINESS_TIMEOUT = 90
EGRESS = CONFIG["egress"]
DB_FILE = CONFIG["database"]["filename"]
DB_TARGET = CONFIG["database"]["target"]
LOCK_DIR = Path("/var/lib/jude-deploy-locks")
PAYLOAD = {"compose.yml", ".backend.env", "release.py", "release.json", "app.json"}
RUN_ID = re.compile(r"[0-9a-f]{40}-[0-9]+-[0-9]+")
DIGEST = re.compile(
    r"ghcr\.io/[a-z0-9-]+/" + APP + r"-(backend|frontend)@sha256:[0-9a-f]{64}"
)
CURRENT_STEP = "Validating command arguments"


class ReleaseError(RuntimeError):
    pass


def progress(step):
    global CURRENT_STEP
    CURRENT_STEP = step
    try:
        print("Release: " + step, file=sys.stderr, flush=True)
    except OSError:
        # A disconnected log stream must not interrupt the deployment.
        pass


def report_failure(error):
    # Show our safe error messages, never parsed values or subprocess output.
    detail = str(error) if isinstance(error, ReleaseError) else type(error).__name__
    try:
        print(
            "Release failed during: " + CURRENT_STEP + ". " + detail,
            file=sys.stderr,
            flush=True,
        )
    except OSError:
        # Failure reporting must not replace the deployment error.
        pass


def run(args, timeout=300):
    # Never echo captured output: Compose, inspect and Django may include secrets.
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        raise ReleaseError("Command timed out: " + args[0]) from error
    if result.returncode:
        raise ReleaseError(
            "Command failed: "
            + args[0]
            + " (exit "
            + str(result.returncode)
            + "; output withheld; inspect privately)"
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


def sync_to_disk(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


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
        directory / "compose.yml",
        *args,
        timeout=timeout,
    )


def inspect(name):
    return json.loads(docker("inspect", name))[0]


def running_ports(container):
    return {
        (port, binding["HostIp"], binding["HostPort"])
        for port, bindings in (container["HostConfig"]["PortBindings"] or {}).items()
        for binding in (bindings or [])
    }


def require_frontend_ports(ports, allowed):
    if ports not in [{tuple(binding) for binding in form} for form in allowed]:
        raise ReleaseError("Frontend published-port boundary changed")


def validate_candidate_ports(candidate):
    services = json.loads(compose(candidate, "config", "--format", "json"))["services"]
    if any(service.get("network_mode") == "host" for service in services.values()):
        raise ReleaseError("Host networking bypasses the published-port policy")
    if services[BACKEND].get("ports"):
        raise ReleaseError("Backend unexpectedly publishes a port")
    ports = {
        (
            f"{port['target']}/{port.get('protocol', 'tcp')}",
            port.get("host_ip", ""),
            str(port.get("published", "")),
        )
        for port in services[FRONTEND].get("ports", [])
    }
    require_frontend_ports(ports, CONFIG["frontend_port_bindings"])


def check_host_journals(database):
    if any(
        database.with_name(database.name + suffix).exists()
        for suffix in ("-wal", "-journal")
    ):
        raise ReleaseError(
            "Host SQLite journal is present. Checkpoint the database before deploying."
        )


def check_host(root, *, require_app=True):
    private_dir(root)
    regular(root / DB_FILE)
    check_host_journals(root / DB_FILE)
    if not (root / DB_FILE).stat().st_size:
        raise ReleaseError(
            "Existing nonempty SQLite database is required; bootstrap is separate"
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
    # Require this app's routes and reject unreviewed ingress attachments.
    # The other app can be offline during a release.
    attached = set(gateway["NetworkSettings"]["Networks"])
    allowed = set(gateway_config.get("allowed_networks", expected))
    if not set(expected) <= attached <= allowed:
        raise ReleaseError("Ingress route network boundary changed")
    for network, address in gateway_config["addresses"].items():
        if gateway["NetworkSettings"]["Networks"][network]["IPAddress"] != address:
            raise ReleaseError("Ingress trusted peer changed")
    for name, policy in expected.items():
        network = json.loads(docker("network", "inspect", name))[0]
        actual = {c["Name"] for c in network["Containers"].values()}
        required = set(policy["required"])
        if not require_app:
            required -= set(CONFIG["containers"].values())
        if (
            network["Internal"] != policy["internal"]
            or [p["Subnet"] for p in network["IPAM"]["Config"]] != [policy["subnet"]]
            or not actual <= set(policy["allowed"])
            or not required <= actual
        ):
            raise ReleaseError("Route network invariant failed")
    if not require_app:
        return
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
    require_frontend_ports(running_ports(frontend), CONFIG["frontend_port_bindings"])
    check_database_mount(backend, root / DB_FILE)


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
    deadline = time.monotonic() + READINESS_TIMEOUT
    while True:
        probe = "direct backend API"
        try:
            compose(directory, "exec", "-T", BACKEND, "python", "-c", check, timeout=10)
            probe = "public routes"
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
                    "Readiness failed within the bounded retry window: " + probe
                ) from None
            time.sleep(2)


def check_database_mount(state, database):
    mounts = [mount for mount in state["Mounts"] if mount["Destination"] == DB_TARGET]
    if len(mounts) != 1 or Path(mounts[0]["Source"]) != database:
        raise ReleaseError("Database writer uses an unexpected bind mount")


def check_stopped_writer(container, database):
    state = inspect(container)
    if state["State"]["Running"]:
        raise ReleaseError("A database writer is still running")
    check_database_mount(state, database)
    # The deployed SQLite file is a single-file bind. Its journal lives in the
    # container until SQLite closes it. Never discard that container on a retry.
    journals = {DB_TARGET + "-wal", DB_TARGET + "-journal"}
    for change in docker("diff", container).splitlines():
        kind, _, path = change.partition(" ")
        if kind in {"A", "C"} and path in journals:
            raise ReleaseError(
                "Stopped writer has a SQLite journal. Preserve the container and checkpoint it before deploying."
            )


def stop_app_for_backup(database):
    containers = {}
    for role, service in CONFIG["services"].items():
        ids = docker(
            "ps",
            "-aq",
            "--filter",
            "label=com.docker.compose.project=" + APP,
            "--filter",
            "label=com.docker.compose.service=" + service,
        ).split()
        name = CONFIG["containers"][role]
        named = docker(
            "ps", "-aq", "--filter", "name=^/" + re.escape(name) + "$"
        ).split()
        if len(ids) > 1 or (named and named != ids):
            raise ReleaseError(
                "Ambiguous ownership of the existing " + role + " container"
            )
        if not ids:
            continue
        state = inspect(ids[0])
        if role == "backend":
            check_database_mount(state, database)
        # Docker commits omit mounted data. SQLite is the only app data mount.
        if len(state["Mounts"]) != (1 if role == "backend" else 0):
            raise ReleaseError(
                "Unexpected mount on the existing " + role + " container"
            )
        containers[role] = state

    for state in containers.values():
        if state["HostConfig"]["RestartPolicy"]["Name"] == "always":
            docker("update", "--restart=unless-stopped", state["Id"])
    if containers:
        docker("stop", *(state["Id"] for state in containers.values()))
    if "backend" in containers:
        check_stopped_writer(containers["backend"]["Id"], database)
    check_host_journals(database)
    return containers


def backup_before_migration(bundle, database):
    containers = stop_app_for_backup(database)
    with tempfile.TemporaryDirectory(
        prefix=".before-migration-", dir=bundle
    ) as staging:
        backup = Path(staging)
        snapshot = backup / DB_FILE
        # All app writers are stopped and both host and container journals were checked.
        with (
            closing(
                sqlite3.connect(database.as_uri() + "?mode=ro&immutable=1", uri=True)
            ) as source,
            closing(sqlite3.connect(snapshot)) as destination,
        ):
            source.backup(destination)
            if destination.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ReleaseError(
                    "Pre-migration SQLite backup failed its integrity check"
                )
        snapshot.chmod(0o600)

        for role, state in containers.items():
            tag = f"{APP}-backup-{role}:{bundle.name}"
            docker("commit", state["Id"], tag)
            try:
                archive = backup / (role + ".tar")
                docker("image", "save", "--output", archive, tag)
                archive.chmod(0o600)
            finally:
                docker("image", "rm", tag)
        write_private(
            backup / "containers.json", json.dumps(containers, indent=2) + "\n"
        )
        # Persist the complete backup and its directory entry before SQLite can change.
        for path in (*backup.iterdir(), backup):
            sync_to_disk(path)
        backup.rename(bundle / "before-migration")
        sync_to_disk(bundle)


def migrate(bundle, image, database):
    name = APP + "-deploy-migrate"
    prior = docker("ps", "-aq", "--filter", "name=^/" + name + "$").strip()
    if prior:
        if (inspect(prior)["Config"]["Labels"] or {}).get(
            "org.jude.release.app"
        ) != APP:
            raise ReleaseError("Migration container name is already in use")
        check_stopped_writer(prior, database)
        docker("rm", prior)
    if docker("ps", "-q", "--filter", "label=org.jude.release.app=" + APP).strip():
        raise ReleaseError("Another application migration is running")
    progress("Stopping existing services and saving the pre-migration backup")
    backup_before_migration(bundle, database)
    progress("Checking Django settings and applying migrations")
    # A one-off with only egress avoids claiming the backend's fixed gateway address.
    docker(
        "run",
        "--name",
        name,
        "--label",
        "org.jude.release.app=" + APP,
        "--network",
        EGRESS,
        "--env-file",
        bundle / ".backend.env",
        "--mount",
        f"type=bind,source={database},target={DB_TARGET}",
        image,
        "sh",
        "-ec",
        "python manage.py check --deploy && exec python manage.py migrate --noinput",
    )
    check_stopped_writer(name, database)
    docker("rm", name)


def deploy(root, bundle):
    progress("Validating release bundle and host")
    private_dir(root / "incoming")
    release = validate_bundle(bundle)
    check_host(root, require_app=False)
    database = root / DB_FILE
    write_private(
        bundle / ".release.env",
        f"BACKEND_IMAGE={release['backend']}\nFRONTEND_IMAGE={release['frontend']}\nAPP_DB_PATH={database}\n",
    )
    validate_candidate_ports(bundle)
    progress("Pulling pinned application images")
    compose(bundle, "pull", *SERVICES)
    progress("Checking for prior migration writers")
    migrate(bundle, release["backend"], database)
    progress("Starting backend and frontend")
    try:
        compose(bundle, "up", "-d", "--no-deps", "--pull", "never", *SERVICES)
        check_host(root)
        progress("Checking backend and public readiness")
        readiness(bundle)
    except Exception:
        # Compose can start one service before failing. Stop both on every failed launch.
        try:
            compose(bundle, "stop", *SERVICES)
        except (ReleaseError, OSError) as error:
            raise ReleaseError(
                "Could not take both services offline. Check their state on the host."
            ) from error
        raise
    progress("Release accepted")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--bundle", required=True, type=Path)
    args = parser.parse_args()
    root = args.root
    if (
        not root.is_absolute()
        or root.resolve() != root
        or root == Path("/")
        or not re.fullmatch(r"/[A-Za-z0-9_/-]+", str(root))
    ):
        raise ReleaseError("Unsafe application root")
    if args.bundle.parent != root / "incoming":
        raise ReleaseError("Bundle must be the app's unique incoming directory")
    os.umask(0o077)
    with locks():
        deploy(root, args.bundle)


if __name__ == "__main__":
    try:
        main()
    except (ReleaseError, sqlite3.Error, OSError, ValueError, KeyError) as error:
        report_failure(error)
        sys.exit(1)
