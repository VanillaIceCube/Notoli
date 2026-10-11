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
import time
import urllib.error
import urllib.request

APP = "notoli"
BACKEND = "backend" if APP == "notoli" else "macromapper-backend"
FRONTEND = "frontend" if APP == "notoli" else "macromapper-frontend"
SERVICES = (BACKEND, FRONTEND)
DOMAIN = APP + ".judeandrewalaba.com"
ORIGIN = "https://" + DOMAIN
EGRESS = "notoli_backend_egress" if APP == "notoli" else "macromapper_default"
LOCK_DIR = Path("/var/lib/jude-deploy-locks")
PAYLOAD = {"compose.yml", ".backend.env", "release.py", "release.json"}
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
def locks(directory=LOCK_DIR):
    import fcntl

    private_dir(directory)
    handles = []
    try:
        for name, kind in (
            ("maintenance.lock", fcntl.LOCK_SH),
            (APP + ".lock", fcntl.LOCK_EX),
        ):
            path = directory / name
            regular(path)
            fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
            handles.append(fd)
            info = os.fstat(fd)
            if (
                info.st_uid != os.geteuid()
                or info.st_mode & 0o077
                or info.st_nlink != 1
            ):
                raise ReleaseError("Unsafe lock ownership/mode")
            try:
                fcntl.flock(fd, kind | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise ReleaseError(
                    "Maintenance or app release already in progress"
                ) from error
        yield
    finally:
        for fd in reversed(handles):
            os.close(fd)


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


def preflight(root):
    private_dir(root)
    regular(root / "db.sqlite3")
    if not (root / "db.sqlite3").stat().st_size:
        raise ReleaseError(
            "Existing nonempty SQLite database is required; bootstrap is separate"
        )
    if (root / "FAILED.json").exists():
        raise ReleaseError(
            "Resolve the failed release before trying another deployment"
        )
    expected = {
        "notoli_backend_private": (
            True,
            "172.30.88.0/29",
            {"host-ingress-proxy", "notoli-backend"},
        ),
        "notoli_default": (
            False,
            "172.18.0.0/16",
            {"host-ingress-proxy", "notoli-frontend"},
        ),
        "macromapper-ingress": (
            False,
            "172.20.0.0/16",
            {"host-ingress-proxy", "macromapper-backend", "macromapper-frontend"},
        ),
    }
    gateway = inspect("host-ingress-proxy")
    if (
        not gateway["State"]["Running"]
        or gateway["Config"]["Labels"].get("com.docker.compose.project")
        != "host-ingress"
    ):
        raise ReleaseError("Approved host ingress must already be active")
    if set(gateway["NetworkSettings"]["Networks"]) != set(expected):
        raise ReleaseError("Ingress network boundary changed")
    if (
        gateway["NetworkSettings"]["Networks"]["notoli_backend_private"]["IPAddress"]
        != "172.30.88.2"
    ):
        raise ReleaseError("Ingress trusted peer changed")
    for name, (internal, subnet, members) in expected.items():
        network = json.loads(docker("network", "inspect", name))[0]
        actual = {c["Name"] for c in network["Containers"].values()}
        required = {
            member
            for member in members
            if member == "host-ingress-proxy" or member.startswith(APP + "-")
        }
        if (
            network["Internal"] != internal
            or [p["Subnet"] for p in network["IPAM"]["Config"]] != [subnet]
            or not actual <= members
            or not required <= actual
        ):
            raise ReleaseError("Route network invariant failed")
    backend = inspect(APP + "-backend")
    frontend = inspect(APP + "-frontend")
    backend_networks = (
        {"notoli_backend_private", "notoli_backend_egress"}
        if APP == "notoli"
        else {"macromapper-ingress", "macromapper_default"}
    )
    frontend_networks = {"notoli_default"} if APP == "notoli" else backend_networks
    if (
        set(backend["NetworkSettings"]["Networks"]) != backend_networks
        or set(frontend["NetworkSettings"]["Networks"]) != frontend_networks
    ):
        raise ReleaseError("App network isolation changed")
    if APP == "notoli" and (
        backend["NetworkSettings"]["Networks"]["notoli_backend_private"]["IPAddress"]
        != "172.30.88.3"
        or "DJANGO_TRUSTED_PROXY_IPS=172.30.88.2" not in backend["Config"]["Env"]
    ):
        raise ReleaseError("Notoli trust invariant changed")
    if backend["HostConfig"]["PortBindings"]:
        raise ReleaseError("Backend unexpectedly publishes a port")
    mounts = [m for m in backend["Mounts"] if m["Destination"] == "/backend/db.sqlite3"]
    if len(mounts) != 1 or Path(mounts[0]["Source"]) != root / "db.sqlite3":
        raise ReleaseError("Existing database bind source differs")
    # Policy floors are configurable only by separately reviewed code/operator policy.
    disk = shutil.disk_usage(root)
    reserve = 5 * (root / "db.sqlite3").stat().st_size + 64 * 1024 * 1024
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


def capture_recovery(root, candidate, recovery):
    recovery.mkdir(mode=0o700)
    state = {}
    model = json.loads(
        compose(candidate, "config", "--format", "json", "--no-env-resolution")
    )
    for key, suffix in ((BACKEND, "backend"), (FRONTEND, "frontend")):
        container = inspect(APP + "-" + suffix)
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
            "release.json",
            "manifest.json",
        ):
            if (old_dir / name).exists():
                regular(old_dir / name)
                shutil.copyfile(old_dir / name, previous / name)
                (previous / name).chmod(0o600)


def check_response(path, status, predicate):
    request = urllib.request.Request(
        ORIGIN + path, headers={"Cache-Control": "no-cache"}
    )
    try:
        response = urllib.request.urlopen(request, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(256 * 1024)
        if response.status != status or not predicate(response.headers, body):
            raise ReleaseError("Readiness response did not match " + path)


def readiness(directory):
    # Direct backend test prevents a cached frontend/edge response from masking a dead app.
    check = (
        "import urllib.request,urllib.error; "
        "q=urllib.request.Request('http://127.0.0.1:8000/api/notifications/',headers={'Host':'"
        + DOMAIN
        + "'}); "
        "\ntry: urllib.request.urlopen(q,timeout=5); raise SystemExit(1)"
        "\nexcept urllib.error.HTTPError as e: assert e.code == 401"
    )
    deadline = time.monotonic() + 90
    while True:
        try:
            compose(directory, "exec", "-T", BACKEND, "python", "-c", check, timeout=10)
            check_response("/", 200, lambda h, b: b"<html" in b.lower())
            check_response(
                "/api/notifications/",
                401,
                lambda h, b: (
                    "application/json" in h.get("Content-Type", "") and b"detail" in b
                ),
            )
            if APP == "notoli":
                check_response(
                    "/.well-known/oauth-authorization-server",
                    200,
                    lambda h, b: json.loads(b)["issuer"] == ORIGIN,
                )
                check_response(
                    "/.well-known/oauth-protected-resource/mcp",
                    200,
                    lambda h, b: json.loads(b)["resource"] == ORIGIN + "/mcp",
                )
                check_response(
                    "/mcp",
                    401,
                    lambda h, b: "resource_metadata" in h.get("WWW-Authenticate", ""),
                )
            return
        except (ReleaseError, OSError, ValueError, KeyError, urllib.error.URLError):
            if time.monotonic() >= deadline:
                raise ReleaseError(
                    "Readiness failed within the bounded retry window"
                ) from None
            time.sleep(2)


def manage(directory, image, *args):
    # Management commands use egress only; never compete with backend's reserved .3.
    return docker(
        "run",
        "--rm",
        "--network",
        EGRESS,
        "--env-file",
        directory / ".backend.env",
        "--mount",
        "type=bind,source="
        + str(json.loads((directory / "release.json").read_text())["database"])
        + ",target=/backend/db.sqlite3",
        image,
        "python",
        "manage.py",
        *args,
    )


def deploy(root, bundle):
    release = validate_bundle(bundle)
    preflight(root)
    for name in ("releases", "recovery"):
        private_dir(root / name)
    candidate = root / "releases" / release["id"]
    if candidate.exists():
        raise ReleaseError("Release attempt already exists; use a new attempt ID")
    shutil.copytree(bundle, candidate)
    release["database"] = str(root / "db.sqlite3")
    (candidate / "release.json").write_text(json.dumps(release))
    write_private(
        candidate / ".release.env",
        "BACKEND_IMAGE="
        + release["backend"]
        + "\nFRONTEND_IMAGE="
        + release["frontend"]
        + "\nAPP_DB_PATH="
        + str(root / "db.sqlite3")
        + "\n",
    )
    compose(candidate, "config", "--quiet")
    compose(candidate, "pull", *SERVICES)
    preflight(root)  # disk policy must still pass after image staging
    recovery = root / "recovery" / release["id"]
    capture_recovery(root, candidate, recovery)
    record = {
        "release": release["id"],
        "recovery": str(recovery),
        "stage": "before-stop",
    }
    atomic_json(
        root / "FAILED.json", record
    )  # also prevents a new deploy after process death
    try:
        compose(candidate, "stop", BACKEND)
        snapshot(root / "db.sqlite3", recovery / "db.sqlite3")
        record["stage"] = "backup-verified"
        atomic_json(root / "FAILED.json", record)
        manage(candidate, release["backend"], "check", "--deploy")
        record["stage"] = "migration-started"
        atomic_json(root / "FAILED.json", record)
        manage(candidate, release["backend"], "migrate", "--noinput")
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
            compose(candidate, "stop", BACKEND)
        except ReleaseError:
            pass
        raise


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
        if failed["recovery"] != str(recovery) or failed["stage"] not in (
            "before-stop",
            "backup-verified",
        ):
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
        root / "FAILED.json", {"recovery": str(recovery), "stage": "rollback-started"}
    )
    try:
        compose(recovery, "stop", BACKEND)
        if restore_database:
            # Preserve current DB before selecting an older snapshot.
            rescue = recovery / ("before-rollback-" + str(time.time_ns()) + ".sqlite3")
            snapshot(root / "db.sqlite3", rescue)
            info = regular(root / "db.sqlite3").stat()
            # Writers are stopped. Checkpoint before replacing a WAL-mode DB;
            # stale sidecars must never be replayed into the restored snapshot.
            with closing(sqlite3.connect(root / "db.sqlite3")) as database:
                if database.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]:
                    raise ReleaseError("Database still has a writer during rollback")
            for suffix in ("-wal", "-shm"):
                sidecar = root / ("db.sqlite3" + suffix)
                if sidecar.exists():
                    regular(sidecar)
                    os.replace(sidecar, recovery / (rescue.name + suffix))
            restored = root / ("restore-" + str(time.time_ns()) + ".sqlite3")
            snapshot(recovery / "db.sqlite3", restored)
            os.chmod(restored, stat.S_IMODE(info.st_mode))
            os.chown(restored, info.st_uid, info.st_gid)
            os.replace(restored, root / "db.sqlite3")
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
            compose(recovery, "stop", BACKEND)
        except ReleaseError:
            pass
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
