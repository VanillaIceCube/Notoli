"""Exercise the single-file SQLite bind across launch attempts on a disposable Docker fixture."""

import sqlite3
import subprocess
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from test_production import release


class SQLiteLaunchTests(unittest.TestCase):
    def test_migration_retry_and_uncheckpointed_writer(self):
        namespace = "launch-fixture-" + uuid.uuid4().hex
        image = namespace + ":test"
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)
            database = bundle / "db.sqlite3"
            with sqlite3.connect(database) as db:
                db.execute("create table entries (value text)")
                db.execute("insert into entries values ('existing')")
            db.close()
            (bundle / "Dockerfile").write_text(
                "FROM python:3.12-alpine\nWORKDIR /backend\nCOPY manage.py .\n"
            )
            (bundle / "manage.py").write_text(
                "import os, sqlite3, sys\n"
                "if sys.argv[1] == 'migrate':\n"
                "    db = sqlite3.connect('/backend/db.sqlite3')\n"
                "    db.execute('insert into entries values (?)', ('migrated',))\n"
                "    if os.getenv('FAIL') == '1': sys.exit(3)\n"
                "    db.commit()\n"
                "    db.close()\n"
            )
            release.docker("build", "-q", "-t", image, directory)
            self.addCleanup(
                subprocess.run, ["docker", "image", "rm", image], capture_output=True
            )
            name = namespace + "-deploy-migrate"
            self.addCleanup(
                subprocess.run, ["docker", "rm", "-f", name], capture_output=True
            )
            with (
                patch.object(release, "APP", namespace),
                patch.object(release, "EGRESS", "none"),
            ):
                (bundle / ".backend.env").write_text("FAIL=1\n")
                with self.assertRaises(release.ReleaseError):
                    release.migrate(bundle, image, database)
                # A failed transaction rolls back on clean process exit.
                (bundle / ".backend.env").write_text("FAIL=0\n")
                release.migrate(bundle, image, database)
                with sqlite3.connect(database) as db:
                    self.assertEqual(
                        db.execute("select value from entries").fetchall(),
                        [("existing",), ("migrated",)],
                    )
                db.close()
                # This writer committed in WAL mode and died with its journal inside
                # the stopped container. It must survive a rejected replacement.
                writer = namespace + "-writer"
                self.addCleanup(
                    subprocess.run, ["docker", "rm", "-f", writer], capture_output=True
                )
                release.docker(
                    "run",
                    "--name",
                    writer,
                    "--network",
                    "none",
                    "--label",
                    "com.docker.compose.project=" + namespace,
                    "--label",
                    "com.docker.compose.service=" + release.BACKEND,
                    "--mount",
                    f"type=bind,source={database},target={release.DB_TARGET}",
                    image,
                    "python",
                    "-c",
                    "import sqlite3, os; c=sqlite3.connect('/backend/db.sqlite3'); "
                    "c.execute('pragma journal_mode=wal'); c.execute(\"insert into entries values ('pending')\"); c.commit(); os._exit(0)",
                )
                with self.assertRaisesRegex(release.ReleaseError, "SQLite journal"):
                    release.migrate(bundle, image, database)
                self.assertFalse(release.inspect(writer)["State"]["Running"])
