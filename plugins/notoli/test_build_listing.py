"""Behavioral coverage for updating an existing personal plugin export."""

import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from build_listing import build_listing


class ListingBuildTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.export = self.directory / "export.zip"
        self.output = self.directory / "release.zip"
        self.manifest = {
            "name": "dev-existing-notoli",
            "version": "1.0.0",
            "apps": "./.app.json",
            "interface": {"displayName": "Notoli", "developerName": "App developer"},
            "existingSetting": {"preserve": True},
        }
        self.mapping = b'{"apps":{"existing":{"id":"asdk_app_existing"}}}\n'
        self.write_export()

    def write_export(self):
        with ZipFile(self.export, "w") as archive:
            archive.writestr(".codex-plugin/plugin.json", json.dumps(self.manifest))
            archive.writestr(".app.json", self.mapping)
            archive.writestr("existing.txt", b"Keep this exported file unchanged.\n")

    def test_overlay_preserves_installed_identity_and_exported_files(self):
        build_listing(self.export, self.output, "1.0.1")
        with ZipFile(self.output) as release, ZipFile(self.export) as original:
            manifest = json.loads(release.read(".codex-plugin/plugin.json"))
            self.assertEqual(manifest["name"], "dev-existing-notoli")
            self.assertEqual(manifest["apps"], "./.app.json")
            self.assertEqual(manifest["existingSetting"], {"preserve": True})
            self.assertEqual(release.read(".app.json"), self.mapping)
            self.assertEqual(
                release.read("existing.txt"), original.read("existing.txt")
            )
            self.assertEqual(manifest["version"], "1.0.1")
            self.assertEqual(manifest["interface"]["category"], "Productivity")
            self.assertEqual(
                manifest["interface"]["developerName"], "Jude Andrew Alaba"
            )
            self.assertEqual(
                manifest["interface"]["websiteURL"],
                "https://notoli.judeandrewalaba.com",
            )
            self.assertLessEqual(len(manifest["interface"]["shortDescription"]), 30)
            for icon in ("logo", "composerIcon"):
                path = manifest["interface"][icon].removeprefix("./")
                self.assertTrue(release.read(path).startswith(b"<svg"))

    def assert_rejected(self, version="1.0.1"):
        with self.assertRaises(ValueError):
            build_listing(self.export, self.output, version)
        self.assertFalse(self.output.exists())

    def test_wrong_plugin_is_rejected(self):
        self.manifest["interface"]["displayName"] = "Another plugin"
        self.write_export()
        self.assert_rejected()

    def test_wrong_mapping_path_is_rejected(self):
        self.manifest["apps"] = "./another.json"
        self.write_export()
        self.assert_rejected()

    def test_missing_registered_app_is_rejected(self):
        self.mapping = b'{"apps":{}}'
        self.write_export()
        self.assert_rejected()

    def test_malformed_release_version_is_rejected(self):
        for version in ("latest", "1.1", "1.0.1-beta", "-1.0.0"):
            with self.subTest(version=version):
                self.assert_rejected(version)

    def test_equal_or_older_release_version_is_rejected(self):
        for version in ("1.0.0", "0.9.9"):
            with self.subTest(version=version):
                self.assert_rejected(version)

    def test_version_order_is_numeric(self):
        self.manifest["version"] = "1.0.9"
        self.write_export()
        build_listing(self.export, self.output, "1.0.10")
        self.assertTrue(self.output.exists())

    def test_original_export_cannot_be_overwritten(self):
        before = self.export.read_bytes()
        with self.assertRaises(ValueError):
            build_listing(self.export, self.export, "1.0.1")
        self.assertEqual(self.export.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
