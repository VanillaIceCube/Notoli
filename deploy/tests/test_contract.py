"""Configuration, offline recovery packaging and shared-source drift regressions."""

from contextlib import contextmanager
import copy
import hashlib
import io
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

    def test_gateway_and_own_app_routes_are_required_without_companion_topology(self):
        policy = release.CONFIG["gateway"]
        own = set(release.CONFIG["containers"].values())
        for network in policy["networks"].values():
            expected = set(network["allowed"]) & (own | {policy["container"]})
            self.assertEqual(set(network["required"]), expected)
        self.assertLessEqual(set(policy["addresses"]), set(policy["networks"]))
        self.assertEqual(release.DB_TARGET, "/backend/db.sqlite3")
        self.assertEqual(release.DB_FILE, "db.sqlite3")
        if release.APP == "notoli":
            self.assertEqual(set(policy["networks"]), {"notoli_backend_private", "notoli_default"})
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
        parity = builder
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

    def test_action_upgrade_requires_the_approved_shared_template(self):
        parity = builder
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
            path = root / ".github/workflows/ci-deploy.yml"
            previous = path.read_text(encoding="utf-8")
            # This fixture models a reviewed source upgrade, not an allowlist
            # for arbitrary workflow edits or mutable Action tags.
            references = re.findall(r"docker/login-action@[0-9a-f]{40}\b", previous)
            self.assertEqual(len(references), 1)
            old = references[0]
            approved = previous.replace(old, "docker/login-action@" + "a" * 40)
            path.write_text(approved, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "workflow differs"):
                parity.verify(root, manifest, previous)
            parity.verify(root, manifest, approved)
            path.write_text(
                approved + "\n# unrelated deployment drift\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "workflow differs"):
                parity.verify(root, manifest, approved)

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
        manifest = {
            "contract_version": 1,
            "files": {
                target: builder.digest((source / name).read_bytes())
                for target, name in builder.FILES.items()
            },
            "workflow_sha256": builder.digest(workflow),
        }
        (source / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
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
            for pin in (
                {"repository": "other/repo", "commit": "a" * 40},
                {"repository": builder.REPOSITORY, "commit": "main"},
            ):
                config["shared_source"] = pin
                path.write_text(json.dumps(config), encoding="utf-8")
                with patch.object(builder.urllib.request, "urlopen") as fetch:
                    with self.assertRaisesRegex(
                        ValueError, "canonical repository and full commit SHA"
                    ):
                        builder.check_parity(root)
                    fetch.assert_not_called()

    def test_failed_shared_download_never_partially_syncs_consumer(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            source = source_root / builder.SOURCE
            target = root / "deploy/production/release.py"
            target.write_text("consumer drift", encoding="utf-8")
            # Corrupt a later download after the first would otherwise be copied.
            (source / "tests/test_contract.py").write_text("tampered", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Shared source checksum mismatch"):
                builder.check_parity(root, source_root, sync=True)
            self.assertEqual(target.read_text(encoding="utf-8"), "consumer drift")

    def test_parity_rejects_bad_manifest_and_workflow_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            path = source_root / builder.SOURCE / "manifest.json"
            original = json.loads(path.read_text(encoding="utf-8"))
            for change in (
                {"contract_version": 2},
                {"files": {}},
                {"workflow_sha256": "0" * 64},
            ):
                path.write_text(json.dumps({**original, **change}), encoding="utf-8")
                with self.assertRaises(ValueError):
                    builder.check_parity(root, source_root, sync=True)

    def test_remote_parity_fetches_the_immutable_pin_and_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source_root = self.parity_fixture(directory)
            pin = builder.CONFIG["shared_source"]
            prefix = f"https://raw.githubusercontent.com/{builder.REPOSITORY}/{pin['commit']}/{builder.SOURCE}/"

            def response(url, timeout):
                self.assertTrue(url.startswith(prefix))
                self.assertEqual(timeout, 30)
                from io import BytesIO

                return BytesIO(
                    (
                        source_root / builder.SOURCE / url.removeprefix(prefix)
                    ).read_bytes()
                )

            with patch.object(
                builder.urllib.request, "urlopen", side_effect=response
            ) as fetch:
                self.assertEqual(builder.check_parity(root), pin["commit"])
                self.assertEqual(fetch.call_count, 2)
            with (
                patch.object(
                    builder.urllib.request,
                    "urlopen",
                    side_effect=OSError("unavailable"),
                ),
                self.assertRaises(OSError),
            ):
                builder.check_parity(root)
            from io import BytesIO

            with (
                patch.object(
                    builder.urllib.request,
                    "urlopen",
                    return_value=BytesIO(b"x" * (1024 * 1024 + 1)),
                ),
                self.assertRaisesRegex(ValueError, "download limit"),
            ):
                builder.check_parity(root)


@unittest.skipUnless(os.name == "posix", "Saved host permissions require POSIX")
class RecoveryControllerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "app"
        self.root.mkdir(mode=0o700)
        (self.root / "recovery").mkdir(mode=0o700)
        self.identity = "a" * 40 + "-123-1"
        self.previous_id = "b" * 40 + "-122-1"
        self.recovery = self.root / "recovery" / self.identity
        self.recovery.mkdir(mode=0o700)
        self.saved = self.recovery / "previous-release"
        self.saved.mkdir(mode=0o700)
        self.record = {
            "id": self.previous_id,
            "directory": str(self.root / "releases" / self.previous_id),
            "healthy": True,
        }
        release.write_private(self.recovery / "previous.json", json.dumps(self.record))
        self.policy = copy.deepcopy(release.CONFIG)
        self.policy["domain"] = "saved.example.invalid"
        self.policy["environment"]["fixed"]["DJANGO_MCP_ENABLED"] = "0"
        self.policy["readiness"]["public"] = self.policy["readiness"]["public"][:2]
        release.write_private(self.saved / "app.json", json.dumps(self.policy))
        release.write_private(
            self.saved / "release.py",
            (ROOT / "deploy/production/release.py").read_text(encoding="utf-8"),
        )
        self.rehash()
        self.addCleanup(setattr, release, "CURRENT_STEP", release.CURRENT_STEP)

    def rehash(self):
        release.atomic_json(
            self.saved / "manifest.json",
            {
                name: hashlib.sha256((self.saved / name).read_bytes()).hexdigest()
                for name in ("release.py", "app.json")
            },
        )

    def test_uses_saved_policy_offline_without_the_original_release_directory(self):
        self.assertFalse(Path(self.record["directory"]).exists())
        with patch.object(
            release.urllib.request,
            "urlopen",
            side_effect=AssertionError("No downloads"),
        ):
            saved = release.recovery_controller(self.root, self.identity)
        self.assertEqual(saved["CONFIG"], self.policy)
        self.assertEqual(saved["ORIGIN"], "https://saved.example.invalid")
        self.assertEqual(release.CONFIG["domain"], builder.CONFIG["domain"])
        with patch.dict(saved, {"compose": lambda *args, **kwargs: ""}):
            with patch.dict(saved, {"check_response": lambda *args: None}):
                saved["readiness"](self.recovery)

    def test_rejects_changed_missing_linked_or_public_controller_files_before_execution(
        self,
    ):
        for name in ("release.py", "app.json", "manifest.json"):
            path = self.saved / name
            original = path.read_bytes()
            for change in ("changed", "missing", "symlink", "permissions"):
                if change == "permissions" and name == "manifest.json":
                    continue
                with self.subTest(file=name, change=change):
                    if change == "changed":
                        path.write_text(
                            "{}"
                            if name != "release.py"
                            else "raise RuntimeError('private')"
                        )
                    elif change == "missing":
                        path.unlink()
                    elif change == "symlink":
                        path.unlink()
                        path.symlink_to(self.saved / "missing-target")
                    else:
                        path.chmod(0o644)
                    try:
                        with (
                            patch("builtins.exec") as execute,
                            patch.object(release, "docker") as docker,
                            self.assertRaises(
                                (release.ReleaseError, OSError, ValueError)
                            ),
                        ):
                            release.recovery_controller(self.root, self.identity)
                        execute.assert_not_called()
                        docker.assert_not_called()
                    finally:
                        if path.is_symlink():
                            path.unlink()
                        path.write_bytes(original)
                        path.chmod(0o600)

    def test_rejects_foreign_policy_even_when_its_checksums_match(self):
        for field, value in (
            ("app", "other"),
            ("services", {"backend": "other", "frontend": "other"}),
            ("containers", {"backend": "other", "frontend": "other"}),
            ("database", {"filename": "other.sqlite3", "target": "/other.sqlite3"}),
            ("contract_version", 2),
        ):
            with self.subTest(field=field):
                (self.saved / "app.json").write_text(
                    json.dumps(self.policy | {field: value})
                )
                self.rehash()
                with (
                    patch("builtins.exec") as execute,
                    self.assertRaisesRegex(release.ReleaseError, "does not match"),
                ):
                    release.recovery_controller(self.root, self.identity)
                execute.assert_not_called()

    def test_rejects_unrecorded_unsafe_or_unaccepted_previous_releases(self):
        for record in (
            {},
            [],
            self.record | {"id": 42},
            self.record | {"healthy": False},
            self.record | {"id": "../outside"},
            self.record | {"directory": "/outside"},
        ):
            with self.subTest(record=record):
                (self.recovery / "previous.json").write_text(json.dumps(record))
                with (
                    patch("builtins.exec") as execute,
                    self.assertRaises(release.ReleaseError),
                ):
                    release.recovery_controller(self.root, self.identity)
                execute.assert_not_called()
        with self.assertRaisesRegex(release.ReleaseError, "Invalid recovery identity"):
            release.recovery_controller(self.root, "../outside")

    def test_rejects_linked_saved_directory_and_hides_loading_errors(self):
        external = self.recovery / "external"
        self.saved.rename(external)
        self.saved.symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(release.ReleaseError, "private directory"):
            release.recovery_controller(self.root, self.identity)
        self.saved.unlink()
        external.rename(self.saved)
        (self.saved / "release.py").write_text("raise ValueError('private value')")
        self.rehash()
        with self.assertRaisesRegex(
            release.ReleaseError, "Saved controller could not be loaded"
        ):
            release.recovery_controller(self.root, self.identity)

    def test_requires_one_explicit_database_mode_before_selecting_a_controller(self):
        for restore, keep in ((False, False), (True, True)):
            with (
                patch.object(release, "recovery_controller") as select,
                self.assertRaisesRegex(release.ReleaseError, "exactly one"),
            ):
                release.recover(self.root, self.identity, restore, keep)
            select.assert_not_called()

    def test_main_selects_and_runs_under_the_existing_locks_for_both_modes(self):
        active = False

        @contextmanager
        def locks():
            nonlocal active
            active = True
            try:
                yield
            finally:
                active = False

        select = release.recovery_controller
        calls = []

        def selected(root, identity):
            self.assertTrue(active)
            saved = select(root, identity)

            def rollback(root, identity, restore, keep):
                self.assertTrue(active)
                calls.append((root, identity, restore, keep, saved["CONFIG"]))

            saved["rollback"] = rollback
            return saved

        for mode in ("--restore-database", "--keep-database"):
            with (
                patch.object(release, "locks", side_effect=locks),
                patch.object(release, "recovery_controller", side_effect=selected),
                patch.object(release.os, "umask"),
                patch.object(release, "REPORT_ROOT", None),
                patch.object(release.sys, "stderr", new_callable=io.StringIO),
                patch.object(
                    release.sys,
                    "argv",
                    [
                        "release.py",
                        "rollback",
                        "--root",
                        str(self.root),
                        "--recovery",
                        self.identity,
                        mode,
                    ],
                ),
            ):
                release.main()
            self.assertFalse(active)
        self.assertEqual(
            calls,
            [
                (self.root, self.identity, True, False, self.policy),
                (self.root, self.identity, False, True, self.policy),
            ],
        )

    def test_older_controller_errors_are_reported_and_unsupported_signatures_never_run(
        self,
    ):
        prefix = """import json
from pathlib import Path
CONFIG = json.loads((Path(__file__).parent / "app.json").read_text())
class ReleaseError(RuntimeError):
    pass
"""
        path = self.saved / "release.py"
        path.write_text(
            prefix
            + """def rollback(root, identity, restore, keep):
    raise ReleaseError("Saved recovery failed")
"""
        )
        self.rehash()
        with (
            patch.object(release.sys, "stderr", new_callable=io.StringIO),
            self.assertRaisesRegex(release.ReleaseError, "Saved recovery failed"),
        ):
            release.recover(self.root, self.identity, True)
        self.assertEqual(release.CURRENT_STEP, "Running the saved recovery controller")
        path.write_text(
            prefix
            + """def rollback(root, identity, restore):
    raise AssertionError("Unsupported controller must not run")
"""
        )
        self.rehash()
        with (
            patch.object(release.sys, "stderr", new_callable=io.StringIO),
            self.assertRaisesRegex(release.ReleaseError, "does not support"),
        ):
            release.recover(self.root, self.identity, True)
