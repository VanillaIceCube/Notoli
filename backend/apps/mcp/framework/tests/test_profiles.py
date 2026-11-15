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

        sentinel = object()
        self.assertIs(create_application(sentinel), sentinel)
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
