"""Recreate captured app runtime using real Compose and retained image IDs."""

import json
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch
import uuid

from test_production import release


class RecoveryDockerTests(unittest.TestCase):
    def test_stopped_container_wal_is_included_in_verified_snapshot(self):
        project = "wal-test-" + uuid.uuid4().hex[:10]
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(release, "APP", project),
            patch.dict(
                release.CONFIG,
                {
                    "containers": {
                        "backend": project + "-backend",
                        "frontend": project + "-frontend",
                    }
                },
            ),
        ):
            root = Path(directory)
            source = root / "db.sqlite3"
            with closing(sqlite3.connect(source)) as db:
                db.execute("CREATE TABLE items(value TEXT)")
                db.commit()
            script = (
                "import sqlite3,time; db=sqlite3.connect('/backend/db.sqlite3'); "
                "db.execute('PRAGMA journal_mode=WAL'); "
                "db.execute(\"INSERT INTO items VALUES ('committed-in-container-wal')\"); "
                "db.commit(); print('ready',flush=True); time.sleep(600)"
            )
            name = project + "-backend"
            try:
                release.docker(
                    "run",
                    "-d",
                    "--name",
                    name,
                    "--label",
                    "com.docker.compose.project=" + project,
                    "--label",
                    "com.docker.compose.service=" + release.BACKEND,
                    "--network",
                    "none",
                    "--mount",
                    "type=bind,source=" + str(source) + ",target=/backend/db.sqlite3",
                    "python:3.12-alpine",
                    "python",
                    "-c",
                    script,
                )
                deadline = time.monotonic() + 15
                while "ready" not in release.docker("logs", name):
                    if time.monotonic() >= deadline:
                        self.fail("WAL fixture did not start")
                    time.sleep(0.1)
                self.assertFalse((root / "db.sqlite3-wal").exists())
                release.docker("kill", name)
                target = root / "captured.sqlite3"
                # Windows Docker bind sources have Linux daemon path spelling;
                # normalize only that comparison for the disposable fixture.
                original_inspect = release.inspect

                def inspect(identity):
                    result = original_inspect(identity)
                    result["Mounts"][0]["Source"] = str(source)
                    return result

                with patch.object(release, "inspect", side_effect=inspect):
                    release.begin_data_state(root)
                    release.snapshot_writer(root, target)
                with closing(sqlite3.connect(target)) as db:
                    self.assertEqual(
                        db.execute("SELECT * FROM items").fetchall(),
                        [("committed-in-container-wal",)],
                    )
                    self.assertEqual(
                        db.execute("PRAGMA journal_mode").fetchone()[0], "delete"
                    )
                self.assertEqual(original_inspect(name)["State"]["Status"], "exited")
            finally:
                release.docker("rm", "-f", name)

    def test_recovery_restores_runtime_without_touching_other_container(self):
        project = "recovery-test-" + uuid.uuid4().hex[:10]
        names = [project + "-" + suffix for suffix in ("backend", "frontend", "other")]
        secret = 'old-$literal#quote"'
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(release, "APP", project),
            patch.dict(
                release.CONFIG,
                {
                    "containers": {
                        "backend": project + "-backend",
                        "frontend": project + "-frontend",
                    }
                },
            ),
        ):
            root = Path(directory)
            candidate = root / "candidate"
            candidate.mkdir()
            (candidate / ".release.env").write_text("")
            database = root / "db.sqlite3"
            database.write_bytes(b"original-database")
            model = {"services": {}}
            for key, suffix in (
                (release.BACKEND, "backend"),
                (release.FRONTEND, "frontend"),
            ):
                model["services"][key] = {
                    "image": "python:3.12-alpine",
                    "container_name": project + "-" + suffix,
                    "network_mode": "none",
                    "entrypoint": ["python"],
                    "command": ["-c", "import time; time.sleep(600) # $literal"],
                    "environment": {"RECOVERY_SECRET": secret.replace("$", "$$")},
                }
                if suffix == "backend":
                    model["services"][key]["volumes"] = [
                        {
                            "type": "bind",
                            "source": str(database),
                            "target": "/backend/db.sqlite3",
                            "bind": {"create_host_path": False},
                        }
                    ]
            (candidate / "compose.yml").write_text(json.dumps(model))
            try:
                release.docker(
                    "run",
                    "-d",
                    "--name",
                    names[2],
                    "--network",
                    "none",
                    "python:3.12-alpine",
                    "sleep",
                    "600",
                )
                other_before = release.inspect(names[2])
                release.compose(candidate, "up", "-d", "--no-deps", *release.SERVICES)
                old = {name: release.inspect(name) for name in names[:2]}
                recovery = root / "recovery"
                release.capture_recovery(root, candidate, recovery)
                captured = json.loads((recovery / "compose.yml").read_text())
                self.assertEqual(set(captured["services"]), set(release.SERVICES))
                for service in captured["services"].values():
                    self.assertTrue(service["image"].startswith("sha256:"))
                # Replace the app runtime; then recreate from its captured content IDs.
                for service in model["services"].values():
                    service["environment"] = {"RECOVERY_SECRET": "new-value"}
                (candidate / "compose.yml").write_text(json.dumps(model))
                release.compose(
                    candidate,
                    "up",
                    "-d",
                    "--no-deps",
                    "--force-recreate",
                    *release.SERVICES,
                )
                release.begin_data_state(root)
                release.prepare_backend(root, recovery)
                release.compose(
                    recovery,
                    "up",
                    "-d",
                    "--no-deps",
                    "--pull",
                    "never",
                    "--force-recreate",
                    *release.SERVICES,
                )
                for name in names[:2]:
                    current = release.inspect(name)
                    self.assertNotEqual(current["Id"], old[name]["Id"])
                    self.assertEqual(current["Image"], old[name]["Image"])
                    self.assertEqual(
                        current["Config"]["Cmd"], old[name]["Config"]["Cmd"]
                    )
                    self.assertEqual(
                        sorted(current["Config"]["Env"]),
                        sorted(old[name]["Config"]["Env"]),
                    )
                    self.assertEqual(current["Mounts"], old[name]["Mounts"])
                    self.assertTrue(current["State"]["Running"])
                other_after = release.inspect(names[2])
                self.assertEqual(other_before["Id"], other_after["Id"])
                self.assertEqual(
                    other_before["State"]["StartedAt"],
                    other_after["State"]["StartedAt"],
                )
                self.assertEqual(database.read_bytes(), b"original-database")
                # Docker CLI timeout can leave the management container alive.
                # Exercise real cleanup while keeping unrelated containers intact.
                (candidate / "release.json").write_text(
                    json.dumps(
                        {
                            "id": "a" * 40 + "-1-1",
                            "database": str(database),
                        }
                    )
                )
                (candidate / ".backend.env").write_text("SECRET=fixture\n")
                real_docker = release.docker
                release.begin_data_state(root)

                def timed_out(*args, **kwargs):
                    if args[0] == "run":
                        image_index = args.index("python:3.12-alpine")
                        writer = "import time\nwith open('/backend/db.sqlite3', 'ab', buffering=0) as f:\n while True:\n  f.write(b'x'); time.sleep(0.05)"
                        return real_docker(
                            *args[: image_index + 1],
                            "python",
                            "-c",
                            writer,
                            timeout=0.8,
                        )
                    return real_docker(*args, **kwargs)

                with (
                    patch.object(release, "docker", side_effect=timed_out),
                    patch.object(release, "EGRESS", "none"),
                ):
                    with self.assertRaises(release.ReleaseError):
                        release.manage(candidate, "python:3.12-alpine", "migrate")
                self.assertEqual(
                    real_docker(
                        "ps", "-q", "--filter", "label=org.jude.release.app=" + project
                    ),
                    "",
                )
                stopped_bytes = database.read_bytes()
                time.sleep(0.3)
                self.assertEqual(database.read_bytes(), stopped_bytes)
                retained = release.management_containers()
                self.assertEqual(len(retained), 1)
                self.assertFalse(release.inspect(retained[0])["State"]["Running"])
                # Simulate a surviving management container after process death.
                real_docker("start", retained[0])
                release.stop_management()
                self.assertFalse(release.inspect(retained[0])["State"]["Running"])
                self.assertEqual(release.inspect(names[2])["Id"], other_before["Id"])
            finally:
                for identity in release.management_containers():
                    release.docker("rm", "-f", identity)
                for name in names:
                    try:
                        release.docker("rm", "-f", name)
                    except release.ReleaseError:
                        # Preserve the original assertion when cleanup finds no container.
                        pass
