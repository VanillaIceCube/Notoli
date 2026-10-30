"""Configuration, offline recovery packaging and shared-source drift regressions."""

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from test_production import ROOT, builder, environment, release


class ContractTests(unittest.TestCase):
    def test_bundle_remains_executable_offline_with_its_exact_app_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
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
            # a neighboring checkout/shared repository are needed to invoke recovery.
            result = subprocess.run(
                [sys.executable, str(bundle / "release.py"), "--help"],
                cwd=root,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("rollback", result.stdout)
            self.assertNotIn("shared-source", manifest)

    def test_gateway_and_own_app_are_required_without_requiring_companion(self):
        policy = release.CONFIG["gateway"]
        own = set(release.CONFIG["containers"].values())
        for network in policy["networks"].values():
            expected = set(network["allowed"]) & (own | {policy["container"]})
            self.assertEqual(set(network["required"]), expected)
        self.assertLessEqual(set(policy["addresses"]), set(policy["networks"]))
        self.assertEqual(release.DB_TARGET, "/backend/db.sqlite3")
        self.assertEqual(release.DB_FILE, "db.sqlite3")
        if release.APP in {"notoli", "macromapper"}:
            self.assertEqual(set(policy["networks"]),
                             {"notoli_backend_private", "notoli_default", "macromapper-ingress"})
        if release.APP == "notoli":
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
            self.assertNotIn("MACROMAPPER_OPENAI_API_KEY", builder.REQUIRED)
        elif release.APP == "macromapper":
            self.assertEqual(
                policy["addresses"], {"notoli_backend_private": "172.30.88.2"}
            )
            self.assertEqual(release.CONFIG["frontend_port_bindings"], [[]])
            self.assertIn("MACROMAPPER_OPENAI_API_KEY", builder.REQUIRED)
            self.assertNotIn("DJANGO_MCP_BASE_URL", builder.FIXED)

    def test_app_readiness_rejects_wrong_origin_content_and_missing_challenge(self):
        rules = {rule["path"]: rule for rule in release.CONFIG["readiness"]["public"]}
        expected = {"/", "/api/notifications/"}
        if release.APP == "notoli":
            expected |= {
                "/.well-known/oauth-authorization-server",
                "/.well-known/oauth-protected-resource/mcp",
                "/mcp",
            }
        self.assertEqual(set(rules), expected)
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
                    self.assertFalse(release.response_matches(
                        rule, {"Content-Type": "text/html"}, json.dumps(rule["json_equals"]).encode()))
            if "header_contains" in rule:
                self.assertTrue(
                    release.response_matches(rule, rule["header_contains"], b"")
                )
                self.assertFalse(release.response_matches(rule, {}, b""))

    def test_parity_rejects_changed_code_tests_and_workflow(self):
        spec = importlib.util.spec_from_file_location(
            "parity", ROOT / "deploy/check_parity.py"
        )
        parity = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(parity)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in (
                *parity.FILES,
                "deploy/production/app.json",
                ".github/workflows/ci-deploy.yml",
            ):
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            manifest = {
                "contract_version": 1,
                "files": {
                    name: parity.digest((root / name).read_bytes())
                    for name in parity.FILES
                },
            }
            workflow = (root / ".github/workflows/ci-deploy.yml").read_text(
                encoding="utf-8"
            )
            parity.verify(root, manifest, workflow)
            for name in (
                "deploy/production/release.py",
                "deploy/tests/test_generation_docker.py",
                ".github/workflows/ci-deploy.yml",
            ):
                path = root / name
                original = path.read_bytes()
                path.write_bytes(original + b"\n# unintended edit\n")
                with self.assertRaises(ValueError):
                    parity.verify(root, manifest, workflow)
                path.write_bytes(original)
