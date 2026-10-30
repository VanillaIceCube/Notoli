"""Central MCP policy tested with synthetic tokens and a local HTTP transport."""

import asyncio
import base64
import importlib.util
import io
import time
from pathlib import Path
from unittest.mock import patch

import httpx2
from asgiref.sync import async_to_sync, sync_to_async
from django.contrib.auth import get_user_model
from django.core.asgi import get_asgi_application
from django.core.exceptions import ImproperlyConfigured, PermissionDenied
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, TransactionTestCase, override_settings
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from rest_framework_simplejwt.tokens import RefreshToken

from notes.models import Board

from . import central_oauth as central
from .models import MCPIdentityLink
from .oauth import resolve_token
from .tools import execute

SUBJECT = "598ce330-5388-4fd8-a2c5-4ec916e4daf5"


@override_settings(MCP_AUTH_MODE="central")
class CentralOAuthTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "central-local", email="central@example.test", password="test-password"
        )
        self.other = get_user_model().objects.create_user(
            "unrelated-local", email="other@example.test"
        )
        self.link = MCPIdentityLink.objects.create(
            issuer=central.ISSUER, subject=SUBJECT, user=self.user
        )
        self.data = {
            "active": True,
            "iss": central.ISSUER,
            "sub": SUBJECT,
            "aud": central.RESOURCE,
            "client_id": "notoli-chatgpt",
            "scope": "notoli:read",
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
        }
        self.credential_patch = patch.object(
            central,
            "credentials",
            return_value=("notoli-introspection", "synthetic-secret"),
        )
        self.credential_patch.start()
        self.addCleanup(self.credential_patch.stop)
        self.client_type = httpx2.AsyncClient
        self.calls = []

    def transport(self, response=None):
        def handler(request):
            self.calls.append(request)
            self.assertEqual(str(request.url), central.INTROSPECTION_URL)
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.content, b"token=synthetic-token")
            self.assertEqual(
                request.headers["authorization"],
                "Basic "
                + base64.b64encode(b"notoli-introspection:synthetic-secret").decode(),
            )
            return response or httpx2.Response(200, json=self.data)

        def factory(**kwargs):
            self.assertIs(kwargs["verify"], True)
            self.assertIs(kwargs["follow_redirects"], False)
            self.assertIs(kwargs["trust_env"], False)
            return self.client_type(transport=httpx2.MockTransport(handler), **kwargs)

        return patch.object(central.httpx2, "AsyncClient", side_effect=factory)

    def test_grant_client_and_local_user_binding_rechecked_each_operation(self):
        own = Board.objects.create(name="Own", owner=self.user, created_by=self.user)
        Board.objects.create(name="Foreign", owner=self.other, created_by=self.other)
        with self.transport():
            token = resolve_token("synthetic-token")
            self.assertEqual(token.user, self.user)
            rows = execute(
                "synthetic-token", "list_boards", query="", limit=100, offset=0
            )
            self.assertIn(own.pk, [row["id"] for row in rows["results"]])
            self.assertTrue(all(row["name"] != "Foreign" for row in rows["results"]))
            self.data["active"] = False
            with self.assertRaises(PermissionDenied):
                execute("synthetic-token", "list_boards", query="", limit=100, offset=0)
        self.assertEqual(len(self.calls), 3)

    def test_malformed_or_cross_boundary_claims_fail_closed(self):
        invalid = [
            {"active": 1},
            {"iss": "https://other.example"},
            {"sub": "username"},
            {"sub": "5c507ab5-0323-469b-bb0e-0888e0396793"},
            {"aud": "https://ynab.judeandrewalaba.com/mcp"},
            {"aud": [central.RESOURCE, "other"]},
            {"client_id": "ynab-chatgpt"},
            {"client_id": []},
            {"scope": "notoli:read admin"},
            {"scope": "notoli:write"},
            {"iat": True},
            {"exp": True},
            {"iat": int(time.time()) + 20},
            {"exp": int(time.time()) - 1},
            {"exp": self.data["iat"] + 901},
        ]
        with self.transport():
            original = self.data.copy()
            for change in invalid:
                with self.subTest(change=change):
                    self.data = original | change
                    with self.assertRaises(PermissionDenied):
                        resolve_token("synthetic-token")
            self.data = original | {
                "aud": [central.RESOURCE],
                "client_id": "notoli-codex",
            }
            self.assertEqual(resolve_token("synthetic-token").user, self.user)

    def test_disable_link_user_or_remove_membership_takes_effect(self):
        with self.transport():
            self.link.enabled = False
            self.link.save()
            with self.assertRaises(PermissionDenied):
                resolve_token("synthetic-token")
            self.link.enabled = True
            self.link.save()
            self.user.is_active = False
            self.user.save()
            with self.assertRaises(PermissionDenied):
                resolve_token("synthetic-token")

    def test_write_scopes_and_existing_owner_permission_are_preserved(self):
        board = Board.objects.create(
            name="Foreign", owner=self.other, created_by=self.other
        )
        with self.transport():
            with self.assertRaises(PermissionDenied):
                execute(
                    "synthetic-token", "update_board", board_id=board.pk, name="Bad"
                )
            self.data["scope"] = "notoli:read notoli:organize"
            with self.assertRaises(PermissionDenied):
                execute(
                    "synthetic-token", "update_board", board_id=board.pk, name="Bad"
                )
        board.refresh_from_db()
        self.assertEqual(board.name, "Foreign")

    def test_invalid_transport_responses_and_bearers_are_sanitized(self):
        for response in [
            httpx2.Response(302, headers={"location": "https://other.example"}),
            httpx2.Response(500, text="private upstream error"),
            httpx2.Response(
                200, text="not-json", headers={"content-type": "application/json"}
            ),
            httpx2.Response(
                200,
                content=b"x" * (central.MAX_RESPONSE + 1),
                headers={"content-type": "application/json"},
            ),
        ]:
            with self.subTest(status=response.status_code), self.transport(response):
                with self.assertRaisesMessage(PermissionDenied, central.DENIED):
                    resolve_token("synthetic-token")
        with self.transport():
            for bearer in [None, "", "=", "synthetic\nsecret", "x" * 8193]:
                with self.assertRaisesMessage(PermissionDenied, central.DENIED):
                    resolve_token(bearer)

    def test_total_deadline_bounds_trickled_response(self):
        class SlowStream(httpx2.AsyncByteStream):
            async def __aiter__(self):
                yield b"{"
                await asyncio.sleep(1)
                yield b"}"

        with (
            self.transport(
                httpx2.Response(
                    200,
                    stream=SlowStream(),
                    headers={"content-type": "application/json"},
                )
            ),
            patch.object(central, "DEADLINE", 0.02),
        ):
            started = time.monotonic()
            with self.assertRaisesMessage(PermissionDenied, central.DENIED):
                resolve_token("synthetic-token")
            self.assertLess(time.monotonic() - started, 0.5)

    def test_outage_does_not_reuse_previous_success(self):
        with self.transport():
            self.assertEqual(resolve_token("synthetic-token").user, self.user)
        with patch.object(
            central,
            "introspect",
            side_effect=httpx2.ConnectError("private upstream diagnostic"),
        ):
            with self.assertRaisesMessage(PermissionDenied, central.DENIED):
                resolve_token("synthetic-token")

    def test_retained_legacy_grant_cannot_bypass_central_revocation(self):
        from .tests import make_client, make_token

        make_token(self.user, make_client(), value="synthetic-token")
        self.data["active"] = False
        with self.transport():
            with self.assertRaises(PermissionDenied):
                resolve_token("synthetic-token")
        # Legacy rollback is deliberate: central revocation cannot revoke local
        # grants. The operator must retire those grants before reopening legacy.
        with override_settings(MCP_AUTH_MODE="legacy"):
            self.assertEqual(resolve_token("synthetic-token").user, self.user)

    def test_website_login_refresh_and_rest_sharing_ignore_provider_outage(self):
        board = Board.objects.create(name="Web", owner=self.user, created_by=self.user)
        with patch.object(
            central, "introspect", side_effect=AssertionError("REST called MCP issuer")
        ):
            login = self.client.post(
                "/auth/login/",
                {"email": self.user.email, "password": "test-password"},
            )
            self.assertEqual(login.status_code, 200)
            refreshed = self.client.post(
                "/auth/refresh/", {"refresh": login.json()["refresh"]}
            )
            self.assertEqual(refreshed.status_code, 200)
            self.client.defaults["HTTP_AUTHORIZATION"] = (
                "Bearer " + refreshed.json()["access"]
            )
            shared = self.client.post(
                f"/api/boards/{board.pk}/collaborators/",
                {"identifier": self.other.username},
            )
            self.assertEqual(shared.status_code, 200)
            self.assertTrue(board.collaborators.filter(pk=self.other.pk).exists())
            self.assertEqual(self.client.get("/api/boards/").status_code, 200)

    def test_central_discovery_and_legacy_endpoints_do_not_issue_or_revoke(self):
        metadata = self.client.get("/.well-known/oauth-protected-resource/mcp")
        self.assertEqual(metadata.json()["authorization_servers"], [central.ISSUER])
        for path in [
            "/.well-known/oauth-authorization-server",
            "/auth/mcp/authorize/",
            "/auth/mcp/token/",
            "/auth/mcp/revoke/",
        ]:
            self.assertEqual(self.client.get(path).status_code, 410)
            if path.startswith("/auth"):
                self.assertEqual(self.client.post(path, {}).status_code, 410)
        self.assertEqual(self.client.get("/auth/mcp/connections/").status_code, 401)
        jwt = str(RefreshToken.for_user(self.user).access_token)
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {jwt}"
        self.assertEqual(
            self.client.get("/auth/mcp/connections/").json()["authorization_server"][
                "manage_url"
            ],
            central.MANAGEMENT_URL,
        )
        self.assertEqual(
            self.client.post(
                "/auth/mcp/connections/", {"application_id": 1}
            ).status_code,
            409,
        )
        self.assertEqual(self.client.get("/api/notifications/").status_code, 200)
        with self.assertRaises(CommandError):
            call_command(
                "register_mcp_client",
                redirect_uri="https://client.example/callback",
                stdout=io.StringIO(),
            )

    def test_explicit_link_refuses_rebinding_and_can_disable(self):
        with self.assertRaises(CommandError):
            call_command(
                "link_mcp_identity",
                subject=SUBJECT,
                user_id=self.other.pk,
                stdout=io.StringIO(),
            )
        call_command(
            "link_mcp_identity",
            subject=SUBJECT,
            user_id=self.user.pk,
            disable=True,
            stdout=io.StringIO(),
        )
        self.link.refresh_from_db()
        self.assertFalse(self.link.enabled)
        self.assertEqual(self.link.user, self.user)

    def test_configuration_and_dedicated_credential_are_explicit(self):
        self.credential_patch.stop()
        with override_settings(
            MCP_BASE_URL=central.RESOURCE[:-4],
            MCP_RESOURCE_URL=central.RESOURCE,
            MCP_INTROSPECTION_CLIENT_SECRET="synthetic-secret",
        ):
            central.validate_configuration()
            self.assertEqual(central.credentials()[0], "notoli-introspection")
            for invalid in ("", " ", "unsafe\nsecret", "x" * 2049):
                with override_settings(MCP_INTROSPECTION_CLIENT_SECRET=invalid):
                    with self.assertRaises(ImproperlyConfigured):
                        central.validate_configuration()
        with override_settings(MCP_BASE_URL="https://other.example"):
            with self.assertRaises(ImproperlyConfigured):
                central.validate_configuration()

    @override_settings(MCP_AUTH_MODE="legacy")
    def test_legacy_selection_uses_only_local_verifier(self):
        with patch(
            "integrations.oauth.resolve_framework_token", return_value="legacy-result"
        ) as legacy:
            self.assertEqual(resolve_token("local-token"), "legacy-result")
            legacy.assert_called_once_with("local-token", "notoli:read")


@override_settings(
    MCP_AUTH_MODE="central",
    MCP_BASE_URL=central.RESOURCE[:-4],
    MCP_RESOURCE_URL=central.RESOURCE,
    MCP_INTROSPECTION_CLIENT_SECRET="synthetic-secret",
    ALLOWED_HOSTS=["notoli.judeandrewalaba.com"],
)
class CentralMCPHTTPTests(TransactionTestCase):
    def test_sdk_transport_tools_and_live_authorization(self):
        """Real SDK client/server HTTP; only the independent issuer is simulated."""
        owner = get_user_model().objects.create_user(
            "http-central-owner", email="http-owner@example.test"
        )
        member = get_user_model().objects.create_user(
            "http-central-member", email="http-member@example.test"
        )
        MCPIdentityLink.objects.create(
            issuer=central.ISSUER, subject=SUBJECT, user=member
        )
        own = Board.objects.create(name="Mine", owner=member, created_by=member)
        shared = Board.objects.create(name="Shared", owner=owner, created_by=owner)
        shared.collaborators.add(member)
        foreign = Board.objects.create(name="Private", owner=owner, created_by=owner)
        claims = {
            "active": True,
            "iss": central.ISSUER,
            "sub": SUBJECT,
            "aud": central.RESOURCE,
            "client_id": "notoli-codex",
            "scope": "notoli:read",
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
        }
        # Load an independent app-owned registry without mutating the legacy
        # registry used by the rest of the suite or changing the shared framework.
        spec = importlib.util.spec_from_file_location(
            "integrations._central_http_test", Path(__file__).with_name("server.py")
        )
        registry = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(registry)
        from mcp_framework.asgi import create_application

        application = create_application(
            get_asgi_application(), registry.server, registry.mcp_application
        )
        original_client = httpx2.AsyncClient
        calls = []

        def handler(request):
            self.assertEqual(str(request.url), central.INTROSPECTION_URL)
            self.assertIn("Basic ", request.headers["authorization"])
            calls.append(request)
            return httpx2.Response(200, json=claims)

        def issuer_client(**kwargs):
            return original_client(transport=httpx2.MockTransport(handler), **kwargs)

        async def check():
            async with application.router.lifespan_context(application):
                async with original_client(
                    transport=httpx2.ASGITransport(app=application),
                    base_url=central.RESOURCE[:-4],
                    trust_env=False,
                ) as client:
                    discovery = await client.get(
                        "/.well-known/oauth-protected-resource/mcp"
                    )
                    self.assertEqual(
                        discovery.json()["authorization_servers"], [central.ISSUER]
                    )
                    payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
                    headers = {"Accept": "application/json, text/event-stream"}
                    anonymous = await client.post("/mcp", headers=headers, json=payload)
                    self.assertEqual(anonymous.status_code, 401)
                    self.assertIn(
                        central.RESOURCE[:-4]
                        + "/.well-known/oauth-protected-resource/mcp",
                        anonymous.headers["www-authenticate"],
                    )
                    client.headers["Authorization"] = "Bearer synthetic-token"
                    with patch.object(
                        central.httpx2, "AsyncClient", side_effect=issuer_client
                    ):
                        async with streamable_http_client(
                            central.RESOURCE, http_client=client
                        ) as streams:
                            async with ClientSession(streams[0], streams[1]) as session:
                                await session.initialize()
                                tools = await session.list_tools()
                                self.assertEqual(len(tools.tools), 31)
                                before = len(calls)
                                rows = await session.call_tool("list_boards", {})
                                self.assertFalse(rows.is_error)
                                ids = {
                                    row["id"]
                                    for row in rows.structured_content["results"]
                                }
                                self.assertTrue({own.pk, shared.pk} <= ids)
                                self.assertNotIn(foreign.pk, ids)
                                self.assertEqual(len(calls) - before, 2)
                                denied = await session.call_tool(
                                    "update_board",
                                    {"board_id": own.pk, "name": "Changed"},
                                )
                                self.assertTrue(denied.is_error)
                                self.assertIn(
                                    "insufficient_scope",
                                    denied.meta["mcp/www_authenticate"][0],
                                )
                                claims["scope"] = "notoli:read notoli:organize"
                                changed = await session.call_tool(
                                    "update_board",
                                    {"board_id": own.pk, "name": "Changed"},
                                )
                                self.assertFalse(changed.is_error)
                                self.assertEqual(
                                    changed.structured_content["name"], "Changed"
                                )
                                await sync_to_async(shared.collaborators.remove)(member)
                                denied = await session.call_tool(
                                    "get_board", {"board_id": shared.pk}
                                )
                                self.assertTrue(denied.is_error)
                        # Current grant state is rechecked even after a successful
                        # initialized session. Wrong-resource and revoked grants
                        # fail at HTTP authentication before tool dispatch.
                        for change in (
                            {"aud": "https://macromapper.judeandrewalaba.com/mcp"},
                            {"aud": central.RESOURCE, "active": False},
                        ):
                            claims.update(change)
                            denied = await client.post(
                                "/mcp", headers=headers, json=payload
                            )
                            self.assertEqual(denied.status_code, 401)

        async_to_sync(check)()
        own.refresh_from_db()
        self.assertEqual(own.name, "Changed")
