"""Configuration, offline launch packaging and shared-source drift regressions."""

import hashlib
from io import BytesIO
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_production import ROOT, builder, environment, release


class ContractTests(unittest.TestCase):
    def test_builder_requires_app_policy_before_creating_output(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(builder, "CONFIG", None),
        ):
            target = Path(directory) / "incoming"
            with self.assertRaisesRegex(ValueError, "App configuration is required"):
                builder.build(target, environment())
            self.assertFalse(target.exists())

    def test_bundle_remains_executable_offline_with_its_exact_app_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(
                builder.urllib.request,
                "urlopen",
                side_effect=AssertionError("Bundle must stay offline"),
            ):
                identity = builder.build(root / "incoming", environment())
            bundle = root / "incoming" / identity
            self.assertEqual(
                json.loads((bundle / "app.json").read_text()), release.CONFIG
            )
            manifest = json.loads((bundle / "manifest.json").read_text())
            self.assertEqual(set(manifest), release.PAYLOAD)
            self.assertEqual(
                manifest["app.json"],
                hashlib.sha256((bundle / "app.json").read_bytes()).hexdigest(),
            )
            # Only the bundle is available in this cwd; no imports or fetches from
            # a neighboring checkout/shared repository are needed to launch.
            result = subprocess.run(
                [sys.executable, str(bundle / "release.py"), "--help"],
                cwd=root,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("--bundle", result.stdout)
            self.assertNotIn("rollback", result.stdout)
            self.assertNotIn("shared-source", manifest)

    def test_gateway_and_own_app_routes_are_required_without_companion_topology(self):
        policy = release.CONFIG["gateway"]
        own = set(release.CONFIG["containers"].values())
        for network in policy["networks"].values():
            expected = set(network["allowed"]) & (own | {policy["container"]})
            self.assertEqual(set(network["required"]), expected)
        self.assertLessEqual(set(policy["addresses"]), set(policy["networks"]))
        allowed = set(policy.get("allowed_networks", policy["networks"]))
        self.assertLessEqual(set(policy["networks"]), allowed)
        if release.APP in {"notoli", "macromapper"}:
            self.assertEqual(
                allowed,
                {"notoli_backend_private", "notoli_default", "macromapper-ingress"},
            )
        self.assertEqual(release.DB_TARGET, "/backend/db.sqlite3")
        self.assertEqual(release.DB_FILE, "db.sqlite3")
        if release.APP == "notoli":
            self.assertEqual(
                set(policy["networks"]), {"notoli_backend_private", "notoli_default"}
            )
            self.assertEqual(
                policy["addresses"], {"notoli_backend_private": "172.30.88.2"}
            )
            self.assertEqual(
                release.CONFIG["backend_addresses"],
                {"notoli_backend_private": "172.30.88.3"},
            )
            self.assertEqual(
                release.CONFIG["backend_required_env"],
                ["DJANGO_TRUSTED_PROXY_IPS=172.30.88.2"],
            )
            self.assertEqual(release.CONFIG["frontend_port_bindings"], [[]])
            self.assertNotIn("MACROMAPPER_OPENAI_API_KEY", builder.REQUIRED)
        elif release.APP == "macromapper":
            self.assertEqual(set(policy["networks"]), {"macromapper-ingress"})
            addresses = {}
            if builder.FIXED.get("DJANGO_MCP_ENABLED") == "1":
                addresses["macromapper-ingress"] = "172.20.0.3"
                self.assertEqual(
                    builder.FIXED["DJANGO_MCP_BASE_URL"],
                    "https://" + release.CONFIG["domain"],
                )
                self.assertEqual(
                    builder.FIXED["DJANGO_TRUSTED_PROXY_IPS"], "172.20.0.3"
                )
            else:
                self.assertIn(builder.FIXED.get("DJANGO_MCP_ENABLED"), (None, "0"))
                self.assertNotIn("DJANGO_MCP_BASE_URL", builder.FIXED)
            self.assertEqual(policy["addresses"], addresses)
            self.assertEqual(release.CONFIG["frontend_port_bindings"], [[]])
            self.assertIn("MACROMAPPER_OPENAI_API_KEY", builder.REQUIRED)

    def test_app_readiness_rejects_wrong_origin_content_and_missing_challenge(self):
        rules = {rule["path"]: rule for rule in release.CONFIG["readiness"]["public"]}
        expected = {"/", "/api/notifications/"}
        mcp_enabled = (
            release.APP == "notoli" or builder.FIXED.get("DJANGO_MCP_ENABLED") == "1"
        )
        if mcp_enabled:
            expected |= {
                "/.well-known/oauth-authorization-server",
                "/.well-known/oauth-protected-resource/mcp",
                "/mcp",
            }
        self.assertEqual(set(rules), expected)
        if mcp_enabled:
            origin = "https://" + release.CONFIG["domain"]
            self.assertEqual(
                rules["/.well-known/oauth-authorization-server"]["json_equals"],
                {"issuer": origin},
            )
            self.assertEqual(
                rules["/.well-known/oauth-protected-resource/mcp"]["json_equals"],
                {"resource": origin + "/mcp"},
            )
            if release.APP == "macromapper":
                for path in (
                    "/.well-known/oauth-authorization-server",
                    "/.well-known/oauth-protected-resource/mcp",
                ):
                    self.assertEqual(rules[path]["content_type"], "application/json")
                self.assertEqual(
                    rules["/mcp"]["header_contains"]["WWW-Authenticate"],
                    'resource_metadata="'
                    + origin
                    + '/.well-known/oauth-protected-resource/mcp"',
                )
        self.assertTrue(release.response_matches(rules["/"], {}, b"<HTML>app</HTML>"))
        self.assertFalse(release.response_matches(rules["/"], {}, b"upstream error"))
        self.assertFalse(
            release.response_matches(
                rules["/api/notifications/"], {"Content-Type": "text/html"}, b"detail"
            )
        )
        for rule in rules.values():
            if "json_equals" in rule:
                headers = {"Content-Type": rule.get("content_type", "application/json")}
                self.assertTrue(
                    release.response_matches(
                        rule, headers, json.dumps(rule["json_equals"]).encode()
                    )
                )
                wrong = {key: "https://wrong.invalid" for key in rule["json_equals"]}
                self.assertFalse(
                    release.response_matches(rule, headers, json.dumps(wrong).encode())
                )
                if "content_type" in rule:
                    self.assertFalse(
                        release.response_matches(
                            rule,
                            {"Content-Type": "text/html"},
                            json.dumps(rule["json_equals"]).encode(),
                        )
                    )
            if "header_contains" in rule:
                self.assertTrue(
                    release.response_matches(rule, rule["header_contains"], b"")
                )
                self.assertFalse(release.response_matches(rule, {}, b""))

    def test_parity_rejects_changed_code_tests_and_workflow(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            for name in (*builder.FILES, ".github/workflows/ci-deploy.yml"):
                with self.subTest(name=name):
                    path = root / name
                    original = path.read_bytes()
                    path.write_bytes(original + b"\n# unintended edit\n")
                    with self.assertRaisesRegex(ValueError, re.escape(name)):
                        builder.check_parity(root, source_root)
                    path.write_bytes(original)

    def test_action_upgrade_requires_the_approved_shared_template(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            path = root / ".github/workflows/ci-deploy.yml"
            previous = path.read_text(encoding="utf-8")
            # This fixture models a reviewed source upgrade, not an allowlist
            # for arbitrary workflow edits or mutable Action tags.
            references = re.findall(r"docker/login-action@[0-9a-f]{40}\b", previous)
            self.assertEqual(len(references), 1)
            old = references[0]
            approved = previous.replace(old, "docker/login-action@" + "a" * 40)
            path.write_text(approved, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "ci-deploy.yml"):
                builder.check_parity(root, source_root)
            (source_root / builder.SOURCE / "workflow.yml").write_text(
                approved, encoding="utf-8"
            )
            builder.check_parity(root, source_root)

    def parity_fixture(self, directory):
        root = Path(directory) / "consumer"
        source_root = Path(directory) / "infrastructure"
        source = source_root / builder.SOURCE
        for target, name in builder.FILES.items():
            consumer = root / target
            canonical = source / name
            consumer.parent.mkdir(parents=True, exist_ok=True)
            canonical.parent.mkdir(parents=True, exist_ok=True)
            data = (ROOT / target).read_bytes()
            consumer.write_bytes(data)
            canonical.write_bytes(data)
        for name in ("deploy/production/app.json", ".github/workflows/ci-deploy.yml"):
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        workflow = (ROOT / ".github/workflows/ci-deploy.yml").read_bytes()
        (source / "workflow.yml").write_bytes(workflow)
        return root, source_root

    def test_parity_uses_embedded_pin_and_offline_sync_restores_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            unrelated = root / "deploy/local-helper.py"
            unrelated.write_text("local helper", encoding="utf-8")
            with patch.object(
                builder.urllib.request,
                "urlopen",
                side_effect=AssertionError("Offline check fetched source"),
            ):
                self.assertEqual(
                    builder.check_parity(root, source_root),
                    builder.CONFIG["shared_source"]["commit"],
                )
                (root / "deploy/production/release.py").write_text(
                    "drift", encoding="utf-8"
                )
                (root / ".github/workflows/ci-deploy.yml").write_text(
                    "drift", encoding="utf-8"
                )
                with self.assertRaisesRegex(ValueError, "Shared release drift"):
                    builder.check_parity(root, source_root)
                builder.check_parity(root, source_root, sync=True)
                self.assertEqual(unrelated.read_text(encoding="utf-8"), "local helper")
                builder.check_parity(root, source_root, sync=True)
                builder.check_parity(root, source_root)

    @unittest.skipUnless(os.name == "posix", "Symlink boundary requires POSIX")
    def test_sync_rejects_linked_deploy_directory_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            external = Path(directory) / "external"
            (root / "deploy").rename(external)
            (root / "deploy").symlink_to(external, target_is_directory=True)
            target = external / "production/release.py"
            target.write_text("consumer drift", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "must not be a symlink"):
                builder.check_parity(root, source_root, sync=True)
            self.assertEqual(target.read_text(encoding="utf-8"), "consumer drift")

    def test_parity_rejects_invalid_embedded_source_before_fetching(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _ = self.parity_fixture(directory)
            path = root / "deploy/production/app.json"
            config = json.loads(path.read_text(encoding="utf-8"))
            for change, reason in (
                ({"contract_version": 2}, "Unsupported release contract"),
                (
                    {"shared_source": {"repository": "other/repo", "commit": "a" * 40}},
                    "canonical repository",
                ),
                (
                    {
                        "shared_source": {
                            "repository": builder.REPOSITORY,
                            "commit": "main",
                        }
                    },
                    "full commit SHA",
                ),
            ):
                path.write_text(json.dumps({**config, **change}), encoding="utf-8")
                with patch.object(builder.urllib.request, "urlopen") as fetch:
                    with self.assertRaisesRegex(ValueError, reason):
                        builder.check_parity(root)
                    fetch.assert_not_called()

    def test_failed_shared_download_never_partially_syncs_consumer(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            source = source_root / builder.SOURCE
            target = root / "deploy/production/release.py"
            target.write_text("consumer drift", encoding="utf-8")
            (source / "tests/test_contract.py").unlink()
            with self.assertRaises(FileNotFoundError):
                builder.check_parity(root, source_root, sync=True)
            self.assertEqual(target.read_text(encoding="utf-8"), "consumer drift")

    def test_parity_accepts_windows_and_unix_line_endings(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            target = root / "deploy/production/release.py"
            source = source_root / builder.SOURCE / "release.py"
            unix = source.read_bytes().replace(b"\r\n", b"\n")
            windows = unix.replace(b"\n", b"\r\n")
            for local, canonical in ((windows, unix), (unix, windows)):
                target.write_bytes(local)
                source.write_bytes(canonical)
                builder.check_parity(root, source_root)

    def test_remote_parity_fetches_the_immutable_pin_and_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            pin = builder.CONFIG["shared_source"]
            prefix = f"https://raw.githubusercontent.com/{builder.REPOSITORY}/{pin['commit']}/{builder.SOURCE}/"

            def response(url, timeout):
                self.assertTrue(url.startswith(prefix))
                self.assertEqual(timeout, 30)

                return BytesIO(
                    (
                        source_root / builder.SOURCE / url.removeprefix(prefix)
                    ).read_bytes()
                )

            with patch.object(builder.urllib.request, "urlopen", side_effect=response):
                self.assertEqual(builder.check_parity(root), pin["commit"])
                (source_root / builder.SOURCE / "release.py").write_bytes(b"changed")
                with self.assertRaisesRegex(ValueError, "deploy/production/release.py"):
                    builder.check_parity(root)
            with (
                patch.object(
                    builder.urllib.request,
                    "urlopen",
                    side_effect=OSError("unavailable"),
                ),
                self.assertRaises(OSError),
            ):
                builder.check_parity(root)
            with (
                patch.object(
                    builder.urllib.request,
                    "urlopen",
                    return_value=BytesIO(b"x" * (1024 * 1024 + 1)),
                ),
                self.assertRaisesRegex(ValueError, "download limit"),
            ):
                builder.check_parity(root)
