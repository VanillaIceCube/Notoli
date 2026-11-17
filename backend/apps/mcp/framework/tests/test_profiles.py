"""Application identity and enabled or disabled MCP profiles."""

from django.apps import apps
from django.conf import settings
from django.core.management import get_commands
from django.test import SimpleTestCase, override_settings


class MCPProfileTests(SimpleTestCase):
    def test_renamed_package_preserves_django_application_identity(self):
        self.assertEqual(
            apps.get_app_config("mcp_framework").name, "apps.mcp.framework"
        )

    def test_sdk_server_import_remains_distinct_from_application_package(self):
        from mcp.server import MCPServer

        self.assertTrue(MCPServer.__module__.startswith("mcp."))

    def test_disabled_profile_does_not_publish_discovery_or_auth(self):
        if settings.MCP_ENABLED:
            self.skipTest(
                "Disabled profile is exercised in the ordinary backend test run"
            )
        self.assertFalse(apps.is_installed("oauth2_provider"))
        self.assertNotIn("createapplication", get_commands())
        from ..asgi import create_application
        from ..proxy import TrustedProxyHeadersMiddleware

        self.assertIsInstance(
            create_application(object()), TrustedProxyHeadersMiddleware
        )
        for path in (
            "/.well-known/oauth-authorization-server",
            "/.well-known/oauth-protected-resource/mcp",
            "/auth/mcp/authorize/",
            "/mcp",
        ):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_origin_and_https_checks_are_conditional_on_enabled_profile(self):
        from ..apps import mcp_https_check, mcp_settings_check

        with override_settings(MCP_ENABLED=False, MCP_BASE_URL="invalid"):
            self.assertEqual(mcp_settings_check(None), [])
            self.assertEqual(mcp_https_check(None), [])
        with override_settings(
            MCP_ENABLED=True,
            MCP_BASE_URL="https://host.example/path",
            MCP_SERVER_FACTORY="example.registry",
        ):
            self.assertIn(
                "mcp_framework.E001", [e.id for e in mcp_settings_check(None)]
            )
        with override_settings(
            MCP_ENABLED=True, DEBUG=False, MCP_BASE_URL="http://host.example"
        ):
            self.assertEqual(mcp_https_check(None)[0].id, "mcp_framework.E002")
        with override_settings(MCP_ENABLED=True, MCP_SERVER_FACTORY=None):
            self.assertIn(
                "mcp_framework.E004", [e.id for e in mcp_settings_check(None)]
            )

    def test_enable_switch_selects_the_same_optional_profile(self):
        import os
        import runpy
        from pathlib import Path
        from unittest.mock import patch

        for value in (None, "0", "1", "true"):
            environment = {
                "DJANGO_DEBUG": "1",
                "DJANGO_SECRET_KEY": "disposable-profile-settings-key",
                "DJANGO_MCP_BASE_URL": "http://localhost:8000",
            }
            if value is not None:
                environment["DJANGO_MCP_ENABLED"] = value
            with (
                self.subTest(value=value),
                patch.dict(os.environ, environment, clear=True),
                patch("dotenv.load_dotenv"),
            ):
                result = runpy.run_path(
                    str(Path(__file__).resolve().parents[4] / "config/settings.py")
                )
                self.assertEqual(result["MCP_ENABLED"], value == "1")
                self.assertEqual(
                    "oauth2_provider" in result["INSTALLED_APPS"], value == "1"
                )

    @override_settings(MCP_ENABLED=False, TRUSTED_PROXY_IPS=["192.0.2.2"])
    def test_disabled_transport_retains_exact_proxy_validation(self):
        from asgiref.sync import async_to_sync

        from ..asgi import create_application

        captured = []

        async def ordinary_rest(scope, receive, send):
            captured.append(scope)

        application = create_application(ordinary_rest)
        for peer, expected_scheme, expected_client in (
            ("192.0.2.2", "https", "198.51.100.7"),
            ("192.0.2.3", "http", "192.0.2.3"),
        ):
            scope = {
                "type": "http",
                "scheme": "http",
                "client": (peer, 1234),
                "headers": [
                    (b"host", b"app.example"),
                    (b"x-forwarded-proto", b"https"),
                    (b"x-forwarded-for", b"198.51.100.7"),
                    (b"x-forwarded-host", b"attacker.invalid"),
                    (b"forwarded", b"proto=https;host=attacker.invalid"),
                ],
            }
            async_to_sync(application)(scope, None, None)
            self.assertEqual(captured[-1]["scheme"], expected_scheme)
            self.assertEqual(captured[-1]["client"][0], expected_client)
            headers = dict(captured[-1]["headers"])
            self.assertNotIn(b"x-forwarded-host", headers)
            self.assertNotIn(b"forwarded", headers)
