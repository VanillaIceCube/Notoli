"""Behavioral release checks: real Compose/env parsing, SQLite and fault recovery."""

import copy
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def module(name):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "deploy/production" / (name + ".py")
    )
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


release = module("release")
builder = module("build_bundle")


def environment():
    values = dict(
        GITHUB_SHA="a" * 40,
        GITHUB_RUN_ID="123",
        GITHUB_RUN_ATTEMPT="1",
        GITHUB_REPOSITORY_OWNER="VanillaIceCube",
        BACKEND_IMAGE="ghcr.io/vanillaicecube/"
        + release.APP
        + "-backend@sha256:"
        + "b" * 64,
        FRONTEND_IMAGE="ghcr.io/vanillaicecube/"
        + release.APP
        + "-frontend@sha256:"
        + "c" * 64,
        DJANGO_SECRET_KEY='literal-$dollar#hash"quote',
        DJANGO_EMAIL_HOST_KEY="key-$#literal",
        DJANGO_EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        DJANGO_DEFAULT_FROM_EMAIL="test@example.invalid",
        MACROMAPPER_OPENAI_API_KEY="fake-ai",
    )
    # App-owned app.json may add required private backend settings. Only this
    # disposable fixture supplies synthetic values; production still requires
    # the operator's explicit inputs and preserves its missing-setting checks.
    for key in builder.REQUIRED:
        values.setdefault(key, "synthetic-release-fixture-" + key.lower())
    return values


class BundleTests(unittest.TestCase):
    def test_extra_app_required_secret_is_synthetic_and_still_required(self):
        key = "APP_SPECIFIC_REQUIRED_SECRET"
        with patch.object(builder, "REQUIRED", [*builder.REQUIRED, key]):
            values = environment()
            self.assertEqual(values["DJANGO_SECRET_KEY"], 'literal-$dollar#hash"quote')
            self.assertEqual(values["DJANGO_EMAIL_HOST_KEY"], "key-$#literal")
            self.assertTrue(values[key].startswith("synthetic-release-fixture-"))
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / "incoming"
                identity = builder.build(target, values)
                self.assertIn(
                    key + "=" + values[key] + "\n",
                    (target / identity / ".backend.env").read_text(),
                )
            for update in (None, "", "line\nbreak"):
                with (
                    self.subTest(value=update),
                    tempfile.TemporaryDirectory() as directory,
                ):
                    supplied = values.copy()
                    if update is None:
                        supplied.pop(key)
                    else:
                        supplied[key] = update
                    with self.assertRaises(ValueError):
                        builder.build(Path(directory) / "incoming", supplied)

    def test_raw_secrets_immutable_images_app_only_compose_and_bind(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            identity = builder.build(path / "incoming", environment())
            bundle = path / "incoming" / identity
            (bundle / ".release.env").write_text(
                "BACKEND_IMAGE="
                + environment()["BACKEND_IMAGE"]
                + "\nFRONTEND_IMAGE="
                + environment()["FRONTEND_IMAGE"]
                + "\nAPP_DB_PATH="
                + str(path / "db.sqlite3").replace("\\", "/")
                + "\n"
            )
            result = subprocess.run(
                [
                    "docker",
                    "compose",
                    "-p",
                    release.APP,
                    "--env-file",
                    str(bundle / ".release.env"),
                    "-f",
                    str(bundle / "compose.yml"),
                    "config",
                    "--format",
                    "json",
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            model = json.loads(result.stdout)
            self.assertEqual(set(model["services"]), set(release.SERVICES))
            backend = model["services"][release.BACKEND]
            # Compose escapes dollars in its reusable config output.
            self.assertEqual(
                backend["environment"]["DJANGO_SECRET_KEY"].replace("$$", "$"),
                environment()["DJANGO_SECRET_KEY"],
            )
            self.assertEqual(
                backend["environment"]["DJANGO_EMAIL_HOST_KEY"].replace("$$", "$"),
                environment()["DJANGO_EMAIL_HOST_KEY"],
            )
            self.assertNotIn("ports", backend)
            self.assertFalse(
                backend["volumes"][0].get("bind", {}).get("create_host_path", False)
            )
            self.assertTrue(all(n["external"] for n in model["networks"].values()))
            if release.APP == "notoli":
                self.assertEqual(
                    backend["networks"]["backend_private"]["ipv4_address"],
                    "172.30.88.3",
                )
                self.assertEqual(
                    backend["environment"]["DJANGO_TRUSTED_PROXY_IPS"], "172.30.88.2"
                )
                self.assertNotIn(
                    "backend_private", model["services"][release.FRONTEND]["networks"]
                )
            # Exercise raw env parsing in a real disposable container, with all
            # production network/storage/port bindings removed from the fixture.
            model = json.loads(
                subprocess.run(
                    [
                        "docker",
                        "compose",
                        "--env-file",
                        str(bundle / ".release.env"),
                        "-f",
                        str(bundle / "compose.yml"),
                        "config",
                        "--format",
                        "json",
                        "--no-env-resolution",
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                ).stdout
            )
            service = model["services"][release.BACKEND]
            service.update(
                image="python:3.12-alpine", network_mode="none", volumes=[], ports=[]
            )
            service.pop("networks", None)
            service.pop("container_name", None)
            model["services"] = {release.BACKEND: service}
            model["networks"] = {}
            fixture = path / "fixture.json"
            fixture.write_text(json.dumps(model))
            value = subprocess.run(
                [
                    "docker",
                    "compose",
                    "-p",
                    release.APP + "-raw-test",
                    "-f",
                    str(fixture),
                    "run",
                    "--rm",
                    "--no-deps",
                    "-T",
                    "--entrypoint",
                    "python",
                    release.BACKEND,
                    "-c",
                    "import os,json; print(json.dumps(os.environ['DJANGO_SECRET_KEY']))",
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(
                json.loads(value.stdout), environment()["DJANGO_SECRET_KEY"]
            )

    def test_missing_secret_mutable_image_and_attempt_reuse_fail(self):
        for update in (
            {"DJANGO_SECRET_KEY": ""},
            {"BACKEND_IMAGE": "app:latest"},
            {"DJANGO_DEBUG": "1"},
            {"DJANGO_SECRET_KEY": "line\nbreak"},
        ):
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    builder.build(Path(directory) / "incoming", environment() | update)
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "incoming"
            builder.build(target, environment())
            with self.assertRaises(FileExistsError):
                builder.build(target, environment())


@unittest.skipUnless(
    os.name == "posix", "Real POSIX permissions/locks and transactions run on Linux"
)
class TransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "app"
        self.root.mkdir(mode=0o700)
        self.identity = builder.build(self.root / "incoming", environment())
        self.bundle = self.root / "incoming" / self.identity
        for name in ("releases", "recovery"):
            (self.root / name).mkdir(mode=0o700)
        with sqlite3.connect(self.root / "db.sqlite3") as db:
            db.execute("CREATE TABLE items(value TEXT)")
            db.execute("INSERT INTO items VALUES ('original')")
        (self.root / "docker-compose.yml").write_text("legacy proxy config")
        (self.root / ".env").write_text("ORIGINAL=private")
        self.events = []
        self.fail_migration = False
        self.fail_readiness = False
        self.model = {
            "name": release.APP,
            "services": {
                release.BACKEND: {
                    "image": "new-backend",
                    "networks": {},
                    "volumes": [
                        {
                            "type": "bind",
                            "source": str(self.root / "db.sqlite3"),
                            "target": "/backend/db.sqlite3",
                        }
                    ],
                },
                release.FRONTEND: {"image": "new-frontend", "networks": {}},
            },
            "networks": {},
        }
        self.patches = [
            patch.object(release, "app_writers", return_value=[]),
            patch.object(
                release,
                "stop_writers",
                side_effect=lambda: self.events.append(("stop-writers",)),
            ),
            patch.object(
                release,
                "snapshot_writer",
                side_effect=lambda root, destination: release.snapshot(
                    root / "db.sqlite3", destination
                ),
            ),
            patch.object(
                release,
                "stop_management",
                side_effect=lambda: self.events.append(("stop-management",)),
            ),
            patch.object(
                release,
                "preflight",
                side_effect=lambda root: self.events.append(("preflight",)),
            ),
            patch.object(release, "compose", side_effect=self.compose),
            patch.object(release, "inspect", side_effect=self.inspect),
            patch.object(
                release,
                "docker",
                side_effect=lambda *args: (
                    self.events.append(("docker",) + args) or "{}"
                ),
            ),
            patch.object(release, "manage", side_effect=self.manage),
            patch.object(release, "readiness", side_effect=self.ready),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def compose(self, directory, *args):
        self.events.append(("compose",) + args)
        forbidden = {"proxy", "down", "--remove-orphans", "prune", "restart"}
        self.assertFalse(forbidden.intersection(args))
        if args[:1] == ("config",) and "--format" in args:
            return json.dumps(copy.deepcopy(self.model))
        return ""

    def inspect(self, name):
        suffix = name.rsplit("-", 1)[1]
        return {
            "Id": "old-" + suffix,
            "Image": "sha256:" + ("1" if suffix == "backend" else "2") * 64,
            "Config": {
                "Labels": {"com.docker.compose.project": release.APP},
                "Cmd": ["python", "server.py"],
                "Entrypoint": None,
                "User": "",
                "Env": ['SECRET=original-$literal#quote"', "PATH=/bin"],
            },
            "HostConfig": {"PortBindings": {}},
            "Mounts": [
                {
                    "Destination": "/backend/db.sqlite3",
                    "Source": str(self.root / "db.sqlite3"),
                }
            ]
            if suffix == "backend"
            else [],
        }

    def manage(self, directory, image, *args):
        self.events.append(("manage",) + args)
        self.assertEqual(image, environment()["BACKEND_IMAGE"])
        if args[0] == "migrate":
            with sqlite3.connect(self.root / "db.sqlite3") as db:
                db.execute("INSERT INTO items VALUES ('migration')")
            if self.fail_migration:
                raise release.ReleaseError("simulated migration failure")

    def ready(self, directory):
        self.assertFalse((self.root / "current.json").exists())
        self.events.append(("ready",))
        if self.fail_readiness:
            raise release.ReleaseError("simulated readiness failure")

    def values(self):
        with sqlite3.connect(self.root / "db.sqlite3") as db:
            return [row[0] for row in db.execute("SELECT value FROM items")]

    def test_success_full_private_recovery_and_commit_after_health(self):
        release.deploy(self.root, self.bundle)
        self.assertEqual(self.values(), ["original", "migration"])
        self.assertFalse((self.root / "FAILED.json").exists())
        current = json.loads((self.root / "current.json").read_text())
        self.assertTrue(current["healthy"])
        recovery = self.root / "recovery" / self.identity
        self.assertTrue((recovery / "db.sqlite3").is_file())
        self.assertEqual(
            (recovery / "legacy-evidence/.env").read_text(), "ORIGINAL=private"
        )
        model = json.loads((recovery / "compose.yml").read_text())
        self.assertEqual(set(model["services"]), set(release.SERVICES))
        self.assertEqual(
            model["services"][release.BACKEND]["image"], "sha256:" + "1" * 64
        )
        self.assertIn("original-$literal", (recovery / ".backend.env").read_text())
        self.assertEqual((recovery / "runtime.json").stat().st_mode & 0o777, 0o600)
        self.assertLess(
            self.events.index(("stop-writers",)),
            self.events.index(("manage", "migrate", "--noinput")),
        )

    def test_migration_failure_preserves_old_db_config_and_explicit_rollback(self):
        self.fail_migration = True
        with self.assertRaises(release.ReleaseError):
            release.deploy(self.root, self.bundle)
        self.assertFalse((self.root / "current.json").exists())
        self.assertTrue((self.root / "FAILED.json").exists())
        self.assertEqual(self.events[-1], ("stop-writers",))
        with self.assertRaises(release.ReleaseError):
            release.rollback(self.root, self.identity, False, True)
        release.rollback(self.root, self.identity, True)
        self.assertEqual(self.values(), ["original"])
        self.assertTrue(json.loads((self.root / "current.json").read_text())["healthy"])
        self.assertFalse((self.root / "FAILED.json").exists())
        recovery = self.root / "recovery" / self.identity
        self.assertEqual(len(list(recovery.glob("before-rollback-*.sqlite3"))), 1)

    def test_backup_failure_never_migrates_and_can_restart_without_db_restore(self):
        with patch.object(
            release, "snapshot", side_effect=release.ReleaseError("backup failed")
        ):
            with self.assertRaises(release.ReleaseError):
                release.deploy(self.root, self.bundle)
        self.assertFalse(any(e[:1] == ("manage",) for e in self.events))
        self.assertEqual(self.values(), ["original"])
        release.rollback(self.root, self.identity, False, True)
        self.assertEqual(self.values(), ["original"])

    def test_keep_database_recovery_can_retry_after_readiness_failure(self):
        with patch.object(
            release, "snapshot", side_effect=release.ReleaseError("backup failed")
        ):
            with self.assertRaises(release.ReleaseError):
                release.deploy(self.root, self.bundle)
        self.fail_readiness = True
        with self.assertRaises(release.ReleaseError):
            release.rollback(self.root, self.identity, False, True)
        self.assertEqual(self.values(), ["original"])
        self.fail_readiness = False
        release.rollback(self.root, self.identity, False, True)
        self.assertEqual(self.values(), ["original"])
        self.assertFalse((self.root / "FAILED.json").exists())

    def test_readiness_failure_is_not_a_success_and_rollback_failure_stops_writers(
        self,
    ):
        self.fail_readiness = True
        with self.assertRaises(release.ReleaseError):
            release.deploy(self.root, self.bundle)
        with self.assertRaises(release.ReleaseError):
            release.rollback(self.root, self.identity, True)
        self.assertFalse((self.root / "current.json").exists())
        self.assertTrue((self.root / "FAILED.json").exists())
        self.assertEqual(self.events[-1], ("stop-writers",))

    def test_checksum_tamper_and_symlink_rejected_before_commands(self):
        (self.bundle / ".backend.env").write_text("tampered")
        with self.assertRaises(release.ReleaseError):
            release.deploy(self.root, self.bundle)
        self.assertEqual(self.events, [])
        (self.bundle / ".backend.env").unlink()
        (self.bundle / ".backend.env").symlink_to(self.root / ".env")
        with self.assertRaises(release.ReleaseError):
            release.validate_bundle(self.bundle)

    def test_stable_locks_exclude_maintenance_and_other_app_attempts(self):
        import fcntl

        directory = self.root / "locks"
        directory.mkdir(mode=0o700)
        for name in ("maintenance.lock", release.APP + ".lock"):
            release.write_private(directory / name, "")
        with release.locks(directory):
            with self.assertRaises(release.ReleaseError):
                with release.locks(directory):
                    self.fail("second app release acquired lock")
        with (directory / "maintenance.lock").open("r+") as hold:
            fcntl.flock(hold, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(release.ReleaseError):
                with release.locks(directory):
                    self.fail("release entered maintenance hold")
        descriptor_count = len(list(Path("/proc/self/fd").iterdir()))
        for _ in range(5):
            with self.assertRaises(release.ReleaseError):
                with release.locks(directory):
                    raise release.ReleaseError("operation failed while locked")
        self.assertEqual(len(list(Path("/proc/self/fd").iterdir())), descriptor_count)
        (directory / (release.APP + ".lock")).unlink()
        (directory / (release.APP + ".lock")).symlink_to(directory / "maintenance.lock")
        with self.assertRaises(release.ReleaseError):
            with release.locks(directory):
                self.fail("accepted symlink lock")


if __name__ == "__main__":
    unittest.main()
