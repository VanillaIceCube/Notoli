"""Real single-file SQLite recovery across inode swaps and interrupted recreation."""

from contextlib import closing, ExitStack
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch
import uuid

from test_production import release


class GenerationRecoveryTests(unittest.TestCase):
    def test_wal_restore_missing_backend_and_temporary_name_retries(self):
        project = "generation-test-" + uuid.uuid4().hex[:10]
        identity = "a" * 40 + "-1-1"
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
            ExitStack() as stack,
        ):
            root = Path(directory)
            if os.name != "posix":
                # POSIX ownership/permission behavior has separate Linux coverage.
                stack.enter_context(
                    patch.object(release, "private_dir", side_effect=lambda p: p)
                )
                stack.enter_context(patch.object(release.os, "chown", create=True))
            database = root / "db.sqlite3"
            with closing(sqlite3.connect(database)) as db:
                db.execute("CREATE TABLE items(value TEXT)")
                db.commit()
            candidate = root / "candidate"
            candidate.mkdir(mode=0o700)
            (candidate / ".release.env").write_text("")
            model = {"services": {}}
            for key, suffix in (
                (release.BACKEND, "backend"),
                (release.FRONTEND, "frontend"),
            ):
                model["services"][key] = {
                    "image": "python:3.12-alpine",
                    "container_name": project + "-" + suffix,
                    "network_mode": "none",
                    "command": ["sleep", "600"],
                    "stop_signal": "SIGKILL",
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
            (root / "recovery").mkdir(mode=0o700)
            recovery = root / "recovery" / identity
            other = project + "-other"
            gateway = project + "-gateway"
            companion_db = root / "companion.sqlite3"
            companion_config = root / "companion.env"
            with closing(sqlite3.connect(companion_db)) as db:
                db.execute("CREATE TABLE untouched(value TEXT)")
                db.execute("INSERT INTO untouched VALUES ('companion')")
                db.commit()
            companion_config.write_text("COMPANION=unchanged\n")
            companion_before = (
                companion_db.read_bytes(),
                companion_config.read_bytes(),
            )
            managed = project + "-migration"
            temporary = project + "-temporary-backend"
            original_inspect = release.inspect

            def inspect(name):
                result = original_inspect(name)
                if os.name != "posix":
                    for mount in result["Mounts"]:
                        if mount["Destination"] == "/backend/db.sqlite3":
                            mount["Source"] = str(database)
                return result

            stack.enter_context(patch.object(release, "inspect", side_effect=inspect))
            try:
                release.docker(
                    "run",
                    "-d",
                    "--name",
                    other,
                    "--network",
                    "none",
                    "--mount",
                    "type=bind,source="
                    + str(companion_db)
                    + ",target=/companion.sqlite3",
                    "--mount",
                    "type=bind,source="
                    + str(companion_config)
                    + ",target=/companion.env,readonly",
                    "python:3.12-alpine",
                    "sleep",
                    "600",
                )
                release.docker(
                    "run",
                    "-d",
                    "--name",
                    gateway,
                    "--network",
                    "none",
                    "python:3.12-alpine",
                    "sleep",
                    "600",
                )
                other_before = original_inspect(other)
                gateway_before = original_inspect(gateway)
                release.compose(candidate, "up", "-d", "--no-deps", *release.SERVICES)
                release.capture_recovery(root, candidate, recovery)
                release.begin_data_state(root)
                release.stop_writers()
                release.snapshot_writer(root, recovery / "db.sqlite3")
                release.replace_database(root, recovery / "db.sqlite3")
                generation = release.arm_writer(root)
                script = (
                    "import sqlite3,time; db=sqlite3.connect('/backend/db.sqlite3'); "
                    "db.execute('PRAGMA journal_mode=WAL'); "
                    "db.execute(\"INSERT INTO items VALUES ('migration-wal-only')\"); "
                    "db.commit(); print('ready',flush=True); time.sleep(600)"
                )
                release.docker(
                    "run",
                    "-d",
                    "--name",
                    managed,
                    "--network",
                    "none",
                    "--label",
                    "org.jude.release.app=" + project,
                    "--label",
                    "org.jude.db.generation=" + generation,
                    "--mount",
                    "type=bind,source=" + str(database) + ",target=/backend/db.sqlite3",
                    "python:3.12-alpine",
                    "python",
                    "-c",
                    script,
                )
                deadline = time.monotonic() + 15
                while "ready" not in release.docker("logs", managed):
                    if time.monotonic() >= deadline:
                        self.fail("Migration WAL fixture did not initialize")
                    time.sleep(0.1)
                release.docker("kill", managed)
                migrated = candidate / "migrated.sqlite3"
                release.snapshot_writer(root, migrated)
                with closing(sqlite3.connect(migrated)) as db:
                    self.assertEqual(
                        db.execute("SELECT * FROM items").fetchall(),
                        [("migration-wal-only",)],
                    )
                release.replace_database(root, migrated)
                release.atomic_json(
                    root / "FAILED.json",
                    {"recovery": str(recovery), "stage": "migration-started"},
                )
                actual_compose = release.compose
                phase = "before-start"

                def compose(path, *args, **kwargs):
                    if args[0] == "up" and phase == "before-start":
                        raise release.ReleaseError(
                            "interrupted before replacement startup"
                        )
                    return actual_compose(path, *args, **kwargs)

                def readiness(path):
                    if phase == "temporary-name":
                        release.docker("rename", project + "-backend", temporary)
                        raise release.ReleaseError("interrupted canonical rename")
                    rows = release.docker(
                        "exec",
                        project + "-backend",
                        "python",
                        "-c",
                        "import sqlite3,json; print(json.dumps(sqlite3.connect('/backend/db.sqlite3').execute('SELECT * FROM items').fetchall()))",
                    )
                    self.assertEqual(json.loads(rows), [])

                with (
                    patch.object(release, "compose", side_effect=compose),
                    patch.object(release, "readiness", side_effect=readiness),
                ):
                    with self.assertRaises(release.ReleaseError):
                        release.rollback(root, identity, True)
                    # Restored inode must never be paired with retained migration WAL.
                    rescue = root / "after-restore.sqlite3"
                    release.snapshot_writer(root, rescue)
                    with closing(sqlite3.connect(rescue)) as db:
                        self.assertEqual(
                            db.execute("SELECT * FROM items").fetchall(), []
                        )
                    release.docker("rm", project + "-backend")
                    phase = "temporary-name"
                    with self.assertRaises(release.ReleaseError):
                        release.rollback(root, identity, True)
                    self.assertFalse(original_inspect(temporary)["State"]["Running"])
                    phase = "success"
                    release.rollback(root, identity, True)
                self.assertFalse((root / "FAILED.json").exists())
                self.assertTrue(
                    json.loads((root / "current.json").read_text())["healthy"]
                )
                self.assertEqual(
                    (companion_db.read_bytes(), companion_config.read_bytes()),
                    companion_before,
                )
                for name, before in ((other, other_before), (gateway, gateway_before)):
                    after = original_inspect(name)
                    for field in (
                        "Id",
                        "Image",
                        "Config",
                        "HostConfig",
                        "NetworkSettings",
                    ):
                        self.assertEqual(after[field], before[field])
                    self.assertEqual(
                        after["State"]["StartedAt"], before["State"]["StartedAt"]
                    )
                self.assertEqual(original_inspect(other)["Id"], other_before["Id"])
                self.assertEqual(
                    original_inspect(other)["State"]["StartedAt"],
                    other_before["State"]["StartedAt"],
                )
            finally:
                for writer in release.app_writers():
                    release.docker("rm", "-f", writer["Id"])
                for name in (project + "-frontend", other, gateway):
                    try:
                        release.docker("rm", "-f", name)
                    except release.ReleaseError:
                        # Keep the original assertion if startup failed before creation.
                        pass
