"""Authenticated MCP transport and live grant revocation."""

import unittest
from datetime import timedelta

from asgiref.sync import async_to_sync
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from django.utils import timezone

from .helpers import make_application, make_token


@unittest.skipUnless(
    settings.MCP_ENABLED, "Run the separate MCP-enabled profile to exercise transport"
)
class MCPTransportTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "protocol-user", email="protocol@example.test"
        )
        self.application = make_application()
        self.token = make_token(self.user, self.application)

    def test_default_and_explicit_scope_requirements_cannot_be_skipped(self):
        from ..errors import ConnectionPermissionDenied
        from ..oauth import resolve_token
        from ..server import DjangoTokenVerifier

        required_scope = settings.MCP_REQUIRED_SCOPES[0]
        calls = ((), (None,), ("",), (required_scope,))
        for arguments in calls:
            with self.subTest(arguments=arguments):
                self.assertEqual(
                    resolve_token("framework-access", *arguments).pk, self.token.pk
                )
        with self.assertRaises(ConnectionPermissionDenied) as denied:
            resolve_token("framework-access", "fixture:additional")
        self.assertEqual(denied.exception.oauth_error, "insufficient_scope")
        self.assertEqual(denied.exception.required_scopes, ("fixture:additional",))
        self.token.scope += " fixture:additional"
        self.token.save()
        self.assertEqual(
            resolve_token("framework-access", "fixture:additional").pk, self.token.pk
        )
        verifier = DjangoTokenVerifier()
        verified = async_to_sync(verifier.verify_token)("framework-access")
        self.assertIsNotNone(verified)
        self.assertEqual(verified.subject, str(self.user.pk))

        self.token.scope = "fixture:additional"
        self.token.save()
        for arguments in calls:
            with self.subTest(arguments=arguments):
                with self.assertRaises(ConnectionPermissionDenied) as denied:
                    resolve_token("framework-access", *arguments)
                self.assertEqual(denied.exception.oauth_error, "insufficient_scope")
                self.assertEqual(denied.exception.required_scopes, (required_scope,))
        self.assertIsNone(async_to_sync(verifier.verify_token)("framework-access"))

    def test_authenticated_initialization_discovery_and_safe_fixture(self):
        import httpx2
        from django.core.asgi import get_asgi_application
        from mcp.types import ToolAnnotations

        from ..asgi import create_application
        from ..server import create_server

        server = create_server(
            instructions="Isolated shared-framework protocol fixture."
        )

        @server.tool(
            annotations=ToolAnnotations(readOnlyHint=True), structured_output=True
        )
        async def connection_status() -> dict[str, bool]:
            return {"connected": True}

        application = create_application(get_asgi_application(), server)

        async def exercise():
            async with application.router.lifespan_context(application):
                async with httpx2.AsyncClient(
                    transport=httpx2.ASGITransport(app=application),
                    base_url=settings.MCP_BASE_URL,
                ) as client:
                    headers = {
                        "Accept": "application/json, text/event-stream",
                        "MCP-Protocol-Version": "2025-11-25",
                    }
                    payload = {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/list",
                        "params": {},
                    }
                    response = await client.post("/mcp", json=payload, headers=headers)
                    self.assertEqual(response.status_code, 401, response.text)
                    self.assertIn(
                        "oauth-protected-resource/mcp",
                        response.headers["www-authenticate"],
                    )
                    for bearer in ("invalid", "", self.jwt_token()):
                        response = await client.post(
                            "/mcp",
                            json=payload,
                            headers=headers | {"Authorization": f"Bearer {bearer}"},
                        )
                        self.assertEqual(response.status_code, 401, response.text)
                    headers["Authorization"] = "Bearer framework-access"
                    response = await client.post(
                        "/mcp",
                        headers=headers,
                        json={
                            "jsonrpc": "2.0",
                            "id": 0,
                            "method": "initialize",
                            "params": {
                                "protocolVersion": "2025-11-25",
                                "capabilities": {},
                                "clientInfo": {
                                    "name": "framework-test",
                                    "version": "1",
                                },
                            },
                        },
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    response = await client.post("/mcp", json=payload, headers=headers)
                    self.assertEqual(response.status_code, 200, response.text)
                    tools = response.json()["result"]["tools"]
                    self.assertEqual(
                        [tool["name"] for tool in tools], ["connection_status"]
                    )
                    self.assertTrue(tools[0]["annotations"]["readOnlyHint"])
                    response = await client.post(
                        "/mcp",
                        headers=headers,
                        json=payload
                        | {
                            "method": "tools/call",
                            "params": {"name": "connection_status", "arguments": {}},
                        },
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(
                        response.json()["result"]["structuredContent"],
                        {"connected": True},
                    )
                    response = await client.post("/mcp/", headers=headers, json=payload)
                    self.assertNotEqual(response.status_code, 200)

        # Create REST JWT outside the async context; OAuth verifier must reject it.
        from rest_framework_simplejwt.tokens import RefreshToken

        jwt = str(RefreshToken.for_user(self.user).access_token)
        self.jwt_token = lambda: jwt
        async_to_sync(exercise)()

    def test_database_revocation_scope_expiry_resource_and_inactive_user(self):
        from ..oauth import resolve_token

        for change in (
            {"scope": ""},
            {"expires": timezone.now() - timedelta(seconds=1)},
            {"resource": ["https://other.example/mcp"]},
        ):
            with self.subTest(change=change):
                original = {key: getattr(self.token, key) for key in change}
                for key, value in change.items():
                    setattr(self.token, key, value)
                self.token.save()
                from ..errors import ConnectionPermissionDenied

                with self.assertRaises(ConnectionPermissionDenied) as denied:
                    resolve_token("framework-access")
                self.assertEqual(
                    denied.exception.oauth_error,
                    "insufficient_scope" if "scope" in change else "invalid_token",
                )
                for key, value in original.items():
                    setattr(self.token, key, value)
                self.token.save()
        self.user.is_active = False
        self.user.save()
        with self.assertRaises(PermissionDenied):
            resolve_token("framework-access")
        self.user.is_active = True
        self.user.save()
        self.token.delete()
        with self.assertRaises(PermissionDenied):
            resolve_token("framework-access")


@override_settings(
    MCP_NAME="Fixture",
    MCP_BASE_URL="https://fixture.example",
    MCP_REQUIRED_SCOPES=["fixture:read"],
)
class ConnectionChallengeTests(SimpleTestCase):
    def test_missing_scope_preserves_required_scopes_without_private_details(self):
        from ..errors import ConnectionPermissionDenied, connection_error

        error = ConnectionPermissionDenied(
            "private-token-provider-or-record",
            "insufficient_scope",
            required_scopes=["fixture:read", "fixture:write"],
        )
        output = connection_error(error).model_dump(by_alias=True)
        challenge = output["_meta"]["mcp/www_authenticate"][0]
        self.assertTrue(output["isError"])
        self.assertIn('error="insufficient_scope"', challenge)
        self.assertIn('scope="fixture:read fixture:write"', challenge)
        self.assertIn(
            'resource_metadata="https://fixture.example/.well-known/oauth-protected-resource/mcp"',
            challenge,
        )
        self.assertNotIn("private-token-provider-or-record", str(output))

    def test_expired_connection_uses_reconnect_guidance_and_caller_scopes(self):
        from ..errors import ConnectionPermissionDenied, connection_error

        output = connection_error(
            ConnectionPermissionDenied("private-expiry"),
            ["fixture:read", "fixture:estimate"],
        ).model_dump(by_alias=True)
        self.assertIn(
            'error="invalid_token"', output["_meta"]["mcp/www_authenticate"][0]
        )
        self.assertIn(
            'scope="fixture:read fixture:estimate"',
            output["_meta"]["mcp/www_authenticate"][0],
        )
        self.assertIn("Reconnect Fixture", output["content"][0]["text"])
        self.assertNotIn("private-expiry", str(output))

    def test_unexpected_auth_error_code_cannot_escape_into_challenge(self):
        from ..errors import ConnectionPermissionDenied, connection_error

        output = connection_error(
            ConnectionPermissionDenied("secret", 'private"code')
        ).model_dump(by_alias=True)
        self.assertIn(
            'error="invalid_token"', output["_meta"]["mcp/www_authenticate"][0]
        )
        self.assertNotIn("private", str(output))
