"""Configuration, offline recovery packaging and shared-source drift regressions."""

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from test_production import ROOT, builder, environment, release


class ContractTests(unittest.TestCase):
    def assert_reviewed_gateway_profile(self, networks, addresses, *, central=False):
        legacy = {"macromapper-ingress", "notoli_default", "notoli_backend_private"}
        if not central:
            self.assertEqual(set(networks), legacy)
            expected = {"notoli_backend_private": "172.30.88.2"}
        else:
            self.assertEqual(
                set(networks), legacy | {"ynab_mcp_private", "mcp_auth_private"}
            )
            expected = {
                "notoli_backend_private": "172.30.88.2",
                "macromapper-ingress": "172.20.0.3",
                "ynab_mcp_private": "172.30.89.2",
                "mcp_auth_private": "172.30.92.2",
            }
        self.assertEqual(addresses, expected)

    def test_legacy_gateway_profile_retains_exact_original_address_map(self):
        self.assert_reviewed_gateway_profile(
            {"macromapper-ingress", "notoli_default", "notoli_backend_private"},
            {"notoli_backend_private": "172.30.88.2"},
        )

    def test_central_gateway_profile_requires_exact_five_networks_and_four_addresses(
        self,
    ):
        self.assert_reviewed_gateway_profile(
            {
                "macromapper-ingress",
                "notoli_default",
                "notoli_backend_private",
                "ynab_mcp_private",
                "mcp_auth_private",
            },
            {
                "notoli_backend_private": "172.30.88.2",
                "macromapper-ingress": "172.20.0.3",
                "ynab_mcp_private": "172.30.89.2",
                "mcp_auth_private": "172.30.92.2",
            },
            central=True,
        )

    def test_gateway_profiles_reject_partial_unknown_or_wrong_trust(self):
        legacy = {"macromapper-ingress", "notoli_default", "notoli_backend_private"}
        central = legacy | {"ynab_mcp_private", "mcp_auth_private"}
        baseline = {"notoli_backend_private": "172.30.88.2"}
        complete = baseline | {
            "macromapper-ingress": "172.20.0.3",
            "ynab_mcp_private": "172.30.89.2",
            "mcp_auth_private": "172.30.92.2",
        }
        invalid = [
            (legacy, {}),
            (legacy, complete),
            (central, baseline),
            (central | {"unreviewed_private"}, complete),
            (central, complete | {"unreviewed_private": "172.30.93.2"}),
            (legacy, {"notoli_backend_private": "172.30.88.9"}),
        ]
        invalid += [(central - {network}, complete) for network in central]
        invalid += [
            (central, {key: value for key, value in complete.items() if key != network})
            for network in complete
        ]
        invalid += [
            (central, complete | {network: "172.30.99.2"}) for network in complete
        ]
        for networks, addresses in invalid:
            with self.subTest(networks=networks, addresses=addresses):
                for central_mode in (False, True):
                    with self.assertRaises(AssertionError):
                        self.assert_reviewed_gateway_profile(
                            networks, addresses, central=central_mode
                        )

    def test_gateway_profile_cannot_be_selected_by_changing_topology(self):
        legacy = {"macromapper-ingress", "notoli_default", "notoli_backend_private"}
        addresses = {"notoli_backend_private": "172.30.88.2"}
        central = legacy | {"ynab_mcp_private", "mcp_auth_private"}
        complete = addresses | {
            "macromapper-ingress": "172.20.0.3",
            "ynab_mcp_private": "172.30.89.2",
            "mcp_auth_private": "172.30.92.2",
        }
        with self.assertRaises(AssertionError):
            self.assert_reviewed_gateway_profile(central, complete)
        with self.assertRaises(AssertionError):
            self.assert_reviewed_gateway_profile(legacy, addresses, central=True)

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
            # Select the expected topology from the independent app mode, never
            # from the network/address policy being checked. Canonical fixtures
            # stay legacy; central app adoption must be an explicit config change.
            if release.APP == "notoli":
                mode = builder.FIXED.get("DJANGO_MCP_AUTH_MODE", "legacy")
                self.assertIn(mode, {"legacy", "central"})
                central = mode == "central"
            else:
                enabled = builder.FIXED.get("DJANGO_MCP_ENABLED", "0")
                self.assertIn(enabled, {"0", "1"})
                central = enabled == "1"
            self.assert_reviewed_gateway_profile(
                policy["networks"], policy["addresses"], central=central
            )
        if release.APP == "notoli":
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
            self.assertEqual(release.CONFIG["frontend_port_bindings"], [[]])
            self.assertIn("MACROMAPPER_OPENAI_API_KEY", builder.REQUIRED)

    def test_app_readiness_rejects_wrong_origin_content_and_missing_challenge(self):
        rules = {rule["path"]: rule for rule in release.CONFIG["readiness"]["public"]}
        expected = {"/", "/api/notifications/"}
        if release.APP == "notoli":
            expected |= {
                "/.well-known/oauth-authorization-server",
                "/.well-known/oauth-protected-resource/mcp",
                "/mcp",
            }
        macro_enabled = (
            release.APP == "macromapper"
            and builder.FIXED.get("DJANGO_MCP_ENABLED", "0") == "1"
        )
        if release.APP == "macromapper":
            self.assertIn(builder.FIXED.get("DJANGO_MCP_ENABLED", "0"), {"0", "1"})
            if macro_enabled:
                self.assertEqual(
                    builder.FIXED.get("DJANGO_MCP_BASE_URL"),
                    "https://macromapper.judeandrewalaba.com",
                )
                expected |= {"/.well-known/oauth-protected-resource/mcp", "/mcp"}
            else:
                self.assertNotIn("DJANGO_MCP_BASE_URL", builder.FIXED)
        self.assertEqual(set(rules), expected)
        if macro_enabled:
            metadata = rules["/.well-known/oauth-protected-resource/mcp"]
            self.assertEqual(metadata["status"], 200)
            self.assertEqual(metadata.get("content_type"), "application/json")
            self.assertEqual(
                metadata.get("json_equals", {}).get("resource"),
                "https://macromapper.judeandrewalaba.com/mcp",
            )
            self.assertEqual(
                metadata.get("json_equals", {}).get("authorization_servers"),
                ["https://auth.judeandrewalaba.com"],
            )
            self.assertEqual(rules["/mcp"]["status"], 401)
            self.assertIn(
                "resource_metadata",
                rules["/mcp"].get("header_contains", {}).get("WWW-Authenticate", ""),
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

    def test_macromapper_mcp_profiles_require_bounded_central_readiness(self):
        baseline = [
            {"path": "/", "status": 200, "body_contains": "<html", "ignore_case": True},
            {
                "path": "/api/notifications/",
                "status": 401,
                "content_type": "application/json",
                "body_contains": "detail",
            },
        ]
        enabled = baseline + [
            {
                "path": "/.well-known/oauth-protected-resource/mcp",
                "status": 200,
                "content_type": "application/json",
                "json_equals": {
                    "resource": "https://macromapper.judeandrewalaba.com/mcp",
                    "authorization_servers": ["https://auth.judeandrewalaba.com"],
                },
            },
            {
                "path": "/mcp",
                "status": 401,
                "header_contains": {"WWW-Authenticate": "resource_metadata"},
            },
        ]
        fixed = {
            "DJANGO_MCP_ENABLED": "1",
            "DJANGO_MCP_BASE_URL": "https://macromapper.judeandrewalaba.com",
        }

        def check(settings, public):
            with (
                patch.object(release, "APP", "macromapper"),
                patch.object(builder, "FIXED", settings),
                patch.dict(release.CONFIG, {"readiness": {"public": public}}),
            ):
                self.test_app_readiness_rejects_wrong_origin_content_and_missing_challenge()

        check({"DJANGO_MCP_ENABLED": "0"}, baseline)
        check(fixed, enabled)
        invalid = [
            (fixed | {"DJANGO_MCP_BASE_URL": "https://wrong.invalid"}, enabled),
            (fixed, baseline),
            (
                fixed,
                enabled
                + [{"path": "/.well-known/oauth-authorization-server", "status": 200}],
            ),
        ]
        for field in ("resource", "authorization_servers"):
            public = copy.deepcopy(enabled)
            public[2]["json_equals"][field] = "https://wrong.invalid"
            invalid.append((fixed, public))
        for content_type in (None, "text/html"):
            public = copy.deepcopy(enabled)
            if content_type is None:
                public[2].pop("content_type")
            else:
                public[2]["content_type"] = content_type
            invalid.append((fixed, public))
        public = copy.deepcopy(enabled)
        public[3]["header_contains"] = {}
        invalid.append((fixed, public))
        for settings, public in invalid:
            with (
                self.subTest(settings=settings, public=public),
                self.assertRaises(AssertionError),
            ):
                check(settings, public)

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
