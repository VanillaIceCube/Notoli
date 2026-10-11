"""Recreate captured app runtime using real Compose and retained image IDs."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

from test_production import release


class RecoveryDockerTests(unittest.TestCase):
    def test_recovery_restores_runtime_without_touching_other_container(self):
        project = "recovery-test-" + uuid.uuid4().hex[:10]
        names = [project + "-" + suffix for suffix in ("backend", "frontend", "other")]
        secret = 'old-$literal#quote"'
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(release, "APP", project),
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
            finally:
                for name in names:
                    try:
                        release.docker("rm", "-f", name)
                    except release.ReleaseError:
                        pass
