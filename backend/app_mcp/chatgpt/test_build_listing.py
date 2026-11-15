"""Behavioral coverage for updating an existing personal plugin export."""

import json
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo

from build_listing import build_listing

SOURCE = json.loads((Path(__file__).parent / "plugin.json").read_text(encoding="utf-8"))
INTERFACE = SOURCE["extensions"]["com.openai"]["interface"]


class ListingBuildTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.export = self.directory / "export.zip"
        self.output = self.directory / "release.zip"
        self.manifest = {
            "name": f"dev-existing-{SOURCE['name']}",
            "version": "1.0.0",
            "apps": "./.app.json",
            "interface": {
                "displayName": INTERFACE["displayName"],
                "developerName": "App developer",
            },
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
            self.assertEqual(manifest["name"], f"dev-existing-{SOURCE['name']}")
            self.assertEqual(manifest["apps"], "./.app.json")
            self.assertEqual(manifest["existingSetting"], {"preserve": True})
            self.assertEqual(release.read(".app.json"), self.mapping)
            self.assertEqual(
                release.read("existing.txt"), original.read("existing.txt")
            )
            self.assertEqual(manifest["version"], "1.0.1")
            self.assertEqual(manifest["interface"]["category"], INTERFACE["category"])
            self.assertEqual(
                manifest["interface"]["developerName"], INTERFACE["developerName"]
            )
            self.assertEqual(
                manifest["interface"]["websiteURL"],
                INTERFACE["websiteURL"],
            )
            self.assertLessEqual(len(manifest["interface"]["shortDescription"]), 30)
            for icon in ("logo", "composerIcon"):
                path = manifest["interface"][icon].removeprefix("./")
                self.assertEqual(
                    release.read(path), (Path(__file__).parent / path).read_bytes()
                )

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

    def test_unsafe_export_paths_are_rejected(self):
        for name in (
            "../outside",
            "/absolute",
            "C:/absolute",
            "a/../outside",
            "a\\outside",
            "a/./outside",
            "a//outside",
            "file:stream",
        ):
            with self.subTest(name=name):
                self.write_export()
                with ZipFile(self.export, "a") as archive:
                    entry = ZipInfo("placeholder")
                    entry.filename = name
                    entry.orig_filename = name
                    archive.writestr(entry, b"untrusted")
                self.assert_rejected()

    def test_symlink_export_is_rejected(self):
        link = ZipInfo("link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        with ZipFile(self.export, "a") as archive:
            archive.writestr(link, "../outside")
        self.assert_rejected()

    def test_case_colliding_export_paths_are_rejected(self):
        with ZipFile(self.export, "a") as archive:
            archive.writestr("EXISTING.TXT", b"ambiguous")
        self.assert_rejected()

    def test_normal_directory_entries_are_preserved(self):
        with ZipFile(self.export, "a") as archive:
            archive.writestr("nested/", b"")
            archive.writestr("nested/file.txt", b"preserved")
        build_listing(self.export, self.output, "1.0.1")
        with ZipFile(self.output) as archive:
            self.assertEqual(archive.read("nested/file.txt"), b"preserved")

    def test_archive_byte_limit_is_enforced(self):
        with patch("build_listing.MAX_ARCHIVE_BYTES", self.export.stat().st_size - 1):
            self.assert_rejected()

    def test_archive_member_count_is_bounded(self):
        with patch("build_listing.MAX_ARCHIVE_MEMBERS", 2):
            self.assert_rejected()

    def test_archive_member_size_is_bounded(self):
        with ZipFile(self.export, "a") as archive:
            archive.writestr("large.txt", b"x" * 1025)
        with patch("build_listing.MAX_MEMBER_BYTES", 1024):
            self.assert_rejected()

    def test_total_expanded_size_is_bounded(self):
        from zipfile import ZIP_DEFLATED

        self.write_export()
        with ZipFile(self.export, "a", compression=ZIP_DEFLATED) as archive:
            archive.writestr("one.txt", b"x" * 2000)
            archive.writestr("two.txt", b"x" * 2000)
        with patch("build_listing.MAX_ARCHIVE_BYTES", 3000):
            self.assert_rejected()


if __name__ == "__main__":
    unittest.main()
