"""Offline package validation; no real accounts, connections, or publishing."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from build_package import PACKAGE, build_package


class PortablePackageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.package = self.root / "source"
        shutil.copytree(
            PACKAGE, self.package, ignore=shutil.ignore_patterns("__pycache__")
        )
        self.output = self.root / "plugin.zip"
        self.plugin = json.loads((self.package / "plugin.json").read_text())
        self.mcp = json.loads((self.package / "mcp.json").read_text())
        self.server = self.mcp["mcpServers"][self.plugin["name"]]
        # A synthetic HTTPS origin makes the template fixture buildable offline.
        self.server["url"] = "https://fixture.example.test/mcp"
        auth = self.server["extensions"]["com.openai"]["auth"]
        auth["authorizationUrl"] = "https://fixture.example.test/auth/mcp/authorize/"
        auth["tokenUrl"] = "https://fixture.example.test/auth/mcp/token/"
        self.save()

    def save(self):
        for name, value in (("plugin.json", self.plugin), ("mcp.json", self.mcp)):
            (self.package / name).write_text(json.dumps(value), encoding="utf-8")

    def rejected(self):
        self.save()
        with self.assertRaises(ValueError):
            build_package(self.output, self.package)
        self.assertFalse(self.output.exists())

    def test_portable_archive_contains_only_manifests_and_referenced_artwork(self):
        (self.package / ".app.json").write_text('{"private":"fixture"}')
        (self.package / "private.txt").write_text("not part of the portable package")
        build_package(self.output, self.package)
        with ZipFile(self.output) as archive:
            names = set(archive.namelist())
            self.assertTrue({"plugin.json", "mcp.json"}.issubset(names))
            self.assertFalse(
                names
                & {
                    ".app.json",
                    "private.txt",
                    "build_listing.py",
                    "test_build_listing.py",
                }
            )
            for key in ("logo", "composerIcon"):
                asset = self.plugin["extensions"]["com.openai"]["interface"][key][2:]
                self.assertEqual(
                    archive.read(asset), (self.package / asset).read_bytes()
                )

    def test_uninitialized_template_endpoint_is_rejected(self):
        self.server["url"] = "https://app.example.com/mcp"
        self.rejected()

    def test_insecure_or_authenticated_endpoint_is_rejected(self):
        for url in (
            "http://fixture.example.test/mcp",
            "https://user:secret@fixture.example.test/mcp",
        ):
            with self.subTest(url=url):
                self.server["url"] = url
                self.rejected()

    def test_mismatched_oauth_origin_is_rejected(self):
        self.server["extensions"]["com.openai"]["auth"]["tokenUrl"] = (
            "https://other.example.test/token"
        )
        self.rejected()

    def test_missing_artwork_is_rejected(self):
        self.plugin["extensions"]["com.openai"]["interface"]["logo"] = (
            "./assets/missing.png"
        )
        self.rejected()

    def test_artwork_escape_is_rejected(self):
        self.plugin["extensions"]["com.openai"]["interface"]["logo"] = (
            "./assets/../../private.png"
        )
        self.rejected()

    def test_foreign_scope_is_rejected(self):
        self.server["extensions"]["com.openai"]["auth"]["baseScopes"] = [
            "another-app:read"
        ]
        self.rejected()

    def test_output_cannot_be_written_inside_source_package(self):
        with self.assertRaises(ValueError):
            build_package(self.package / "plugin.zip", self.package)


if __name__ == "__main__":
    unittest.main()
