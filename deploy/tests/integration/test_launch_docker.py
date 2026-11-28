"""Exercise pre-migration backups and failed launches with disposable Docker containers."""

import json
import os
import sqlite3
import subprocess
import tempfile
import unittest
import urllib.error
import uuid
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from deploy.production import release


def values(database):
    with closing(sqlite3.connect(database)) as db:
        return db.execute("select value from entries order by rowid").fetchall()


class SQLiteLaunchTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.incoming = self.root / "incoming"
        self.incoming.mkdir(mode=0o700)
        self.database = self.root / release.DB_FILE
        with closing(sqlite3.connect(self.database)) as db:
            db.execute("create table entries (value text)")
            db.execute("insert into entries values ('existing')")
            db.commit()

        self.project = "launch-fixture-" + uuid.uuid4().hex
        self.image = self.project + ":test"
        (self.root / "Dockerfile").write_text(
            "FROM python:3.12-alpine\nWORKDIR /backend\nCOPY manage.py .\n"
        )
        (self.root / "manage.py").write_text(
            "import os, sqlite3, sys\n"
            "if sys.argv[1] == 'migrate':\n"
            "    db = sqlite3.connect('/backend/db.sqlite3')\n"
            "    db.execute(\"insert into entries values ('migrated')\")\n"
            "    if os.getenv('FAIL') == '1': sys.exit(3)\n"
            "    db.commit()\n"
            "    db.close()\n"
        )
        release.docker("build", "-q", "-t", self.image, self.root)
        self.cleanup_docker("image", "rm", self.image)
        self.cleanup_docker("rm", "-f", self.project + "-deploy-migrate")
        self.names = {
            role: self.project + "-" + role for role in ("backend", "frontend")
        }
        self.enterContext(patch.object(release, "APP", self.project))
        self.enterContext(patch.object(release, "EGRESS", "none"))
        self.enterContext(patch.dict(release.CONFIG, {"containers": self.names}))

    def cleanup_docker(self, *args):
        self.addCleanup(subprocess.run, ["docker", *args], capture_output=True)

    def attempt(self, name, *, fail=False):
        bundle = self.incoming / name
        bundle.mkdir(mode=0o700)
        (bundle / ".backend.env").write_text(f"FAIL={int(fail)}\n")
        return bundle

    def test_first_launch_backups_survive_migration_retries_and_a_dirty_writer(self):
        first = self.attempt("first", fail=True)
        with self.assertRaises(release.ReleaseError):
            release.migrate(first, self.image, self.database)
        saved = first / "before-migration"
        self.assertEqual(json.loads((saved / "containers.json").read_text()), {})
        self.assertEqual(values(saved / release.DB_FILE), [("existing",)])

        release.migrate(self.attempt("retry"), self.image, self.database)
        self.assertEqual(values(self.database), [("existing",), ("migrated",)])
        self.assertEqual(values(saved / release.DB_FILE), [("existing",)])

        # This writer died after committing in WAL mode. Its journal lives in the container.
        writer = self.names["backend"]
        self.cleanup_docker("rm", "-f", writer)
        release.docker(
            "run",
            "--name",
            writer,
            "--network",
            "none",
            "--label",
            "com.docker.compose.project=" + self.project,
            "--label",
            "com.docker.compose.service=" + release.BACKEND,
            "--mount",
            f"type=bind,source={self.database},target={release.DB_TARGET}",
            self.image,
            "python",
            "-c",
            "import sqlite3, os; c=sqlite3.connect('/backend/db.sqlite3'); "
            "c.execute('pragma journal_mode=wal'); c.execute(\"insert into entries values ('pending')\"); "
            "c.commit(); os._exit(0)",
        )
        blocked = self.attempt("blocked")
        with self.assertRaisesRegex(release.ReleaseError, "SQLite journal"):
            release.migrate(blocked, self.image, self.database)
        self.assertFalse(release.inspect(writer)["State"]["Running"])
        self.assertFalse((blocked / "before-migration").exists())
        self.assertEqual(values(saved / release.DB_FILE), [("existing",)])

    def test_public_failure_leaves_app_offline_with_usable_backups(self):
        with closing(sqlite3.connect(self.database)) as db:
            self.assertEqual(db.execute("PRAGMA journal_mode=WAL").fetchone(), ("wal",))
        old = self.attempt("old")
        candidate = self.attempt("candidate")
        services = {}
        for role, service in release.CONFIG["services"].items():
            services[service] = {
                "image": self.image,
                "pull_policy": "never",
                "container_name": self.names[role],
                "command": ["sleep", "600"],
                "network_mode": "none",
                "restart": "unless-stopped",
                "stop_grace_period": "1s",
                "environment": {"FIXTURE_RELEASE": "old"},
            }
        services[release.BACKEND]["volumes"] = [f"{self.database}:{release.DB_TARGET}"]
        services[release.BACKEND]["command"] = [
            "python",
            "-m",
            "http.server",
            "8000",
            "--bind",
            "127.0.0.1",
        ]
        companion = self.project + "-companion"
        services["companion"] = {
            "image": self.image,
            "container_name": companion,
            "command": ["sleep", "600"],
            "network_mode": "none",
        }
        (old / ".release.env").touch()
        (old / "compose.yml").write_text(json.dumps({"services": services}))
        for name in [*self.names.values(), companion]:
            self.cleanup_docker("rm", "-f", name)
        release.compose(old, "up", "-d", "--pull", "never")
        for role, name in self.names.items():
            release.docker(
                "exec", name, "sh", "-c", "echo " + role + " > /prior-release"
            )
        for service in release.SERVICES:
            services[service]["environment"]["FIXTURE_RELEASE"] = "new"
        (candidate / "compose.yml").write_text(json.dumps({"services": services}))

        # The disposable images and isolated networks replace the production registry and gateway.
        with (
            patch.object(
                release,
                "validate_bundle",
                return_value=dict.fromkeys(self.names, self.image),
            ),
            patch.object(release, "check_host"),
            patch.dict(release.CONFIG["readiness"], {"direct_status": 404}),
            patch.object(release, "READINESS_TIMEOUT", 3),
            patch.object(
                release.urllib.request,
                "urlopen",
                side_effect=urllib.error.URLError("fixture gateway offline"),
            ) as public,
            self.assertRaisesRegex(release.ReleaseError, "public routes"),
        ):
            release.deploy(self.root, candidate)
        self.assertTrue(public.called)
        self.assertTrue(release.inspect(companion)["State"]["Running"])
        self.assertEqual(values(self.database), [("existing",), ("migrated",)])

        saved = candidate / "before-migration"
        database_copy = saved / release.DB_FILE
        self.assertEqual(values(database_copy), [("existing",)])
        prior = json.loads((saved / "containers.json").read_text())
        self.assertEqual(set(prior), set(self.names))
        if os.name == "posix":
            self.assertEqual(saved.stat().st_mode & 0o777, 0o700)
            for file in saved.iterdir():
                self.assertEqual(file.stat().st_mode & 0o777, 0o600)
        for role, name in self.names.items():
            state = release.inspect(name)
            self.assertFalse(state["State"]["Running"])
            self.assertEqual(
                state["HostConfig"]["RestartPolicy"]["Name"], "unless-stopped"
            )
            self.assertEqual(prior[role]["Name"], "/" + name)
            tag = f"{self.project}-backup-{role}:{candidate.name}"
            self.cleanup_docker("image", "rm", tag)
            release.docker("image", "load", "--input", saved / (role + ".tar"))
            output = release.docker(
                "run",
                "--rm",
                "--network",
                "none",
                "--mount",
                f"type=bind,source={database_copy},target={release.DB_TARGET},readonly",
                tag,
                "python",
                "-c",
                "import os, pathlib, sqlite3; print(os.environ['FIXTURE_RELEASE'], "
                "pathlib.Path('/prior-release').read_text().strip(), "
                "sqlite3.connect('/backend/db.sqlite3').execute('select value from entries').fetchone()[0])",
            )
            self.assertEqual(output.strip(), f"old {role} existing")

    def test_invalid_database_aborts_before_migration_and_publishes_no_backup(self):
        self.database.write_bytes(b"not a SQLite database")
        bundle = self.attempt("invalid")
        with self.assertRaises(sqlite3.DatabaseError):
            release.migrate(bundle, self.image, self.database)
        self.assertFalse((bundle / "before-migration").exists())
        self.assertEqual(self.database.read_bytes(), b"not a SQLite database")
        self.assertFalse(
            release.docker(
                "ps", "-aq", "--filter", "name=^/" + self.project + "-deploy-migrate$"
            ).strip()
        )
