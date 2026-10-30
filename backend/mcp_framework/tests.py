"""Isolated protocol, OAuth lifecycle, consent and disabled-profile regressions."""

import base64
import hashlib
import io
import unittest
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit

from asgiref.sync import async_to_sync
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

CALLBACK = "https://client.example/connection/callback"
VERIFIER = "framework-code-verifier-with-at-least-forty-three-characters"
CHALLENGE = (
    base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest())
    .decode()
    .rstrip("=")
)


class ProfileTests(SimpleTestCase):
    def test_disabled_profile_does_not_publish_discovery_or_auth(self):
        if settings.MCP_ENABLED:
            self.skipTest(
                "Disabled profile is exercised in the ordinary backend test run"
            )
        self.assertFalse(apps.is_installed("oauth2_provider"))
        with self.assertRaisesMessage(CommandError, "MCP is disabled"):
            call_command("register_mcp_client", "--redirect-uri", CALLBACK)
        from .asgi import create_application

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
        from .apps import mcp_https_check, mcp_settings_check

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


@unittest.skipUnless(settings.MCP_ENABLED, "External issuer requires enabled MCP")
class ExternalIssuerTests(SimpleTestCase):
    @override_settings(
        MCP_BASE_URL="https://resource.example",
        MCP_RESOURCE_URL="https://resource.example/mcp",
        DEBUG=False,
    )
    def test_external_issuer_keeps_resource_origin_and_requires_owned_verifier(self):
        from mcp.server.auth.provider import AccessToken, TokenVerifier
        from starlette.testclient import TestClient

        from .server import create_server, http_application

        class OwnedVerifier(TokenVerifier):
            async def verify_token(self, token):
                if token != "synthetic-token":
                    return None
                return AccessToken(
                    token=token,
                    client_id="fixture-client",
                    scopes=settings.MCP_REQUIRED_SCOPES,
                    resource=settings.MCP_RESOURCE_URL,
                )

        with self.assertRaisesMessage(ValueError, "explicit token verifier"):
            create_server(instructions="test", issuer_url="https://issuer.example")
        with self.assertRaisesMessage(ValueError, "require HTTPS"):
            create_server(
                instructions="test",
                verifier=OwnedVerifier(),
                issuer_url="http://issuer.example",
            )
        legacy = create_server(instructions="test")
        self.assertEqual(str(legacy.settings.auth.issuer_url), settings.MCP_BASE_URL)
        server = create_server(
            instructions="test",
            verifier=OwnedVerifier(),
            issuer_url="https://issuer.example",
        )
        self.assertEqual(str(server.settings.auth.issuer_url), "https://issuer.example")
        self.assertEqual(
            str(server.settings.auth.resource_server_url), settings.MCP_RESOURCE_URL
        )
        with TestClient(
            http_application(server), base_url=settings.MCP_BASE_URL
        ) as client:
            response = client.post("/mcp", json={})
            self.assertEqual(response.status_code, 401)
            self.assertIn(
                "https://resource.example/", response.headers["www-authenticate"]
            )
            self.assertEqual(
                client.post(
                    "/mcp",
                    json={},
                    headers={
                        "host": "issuer.example",
                        "authorization": "Bearer synthetic-token",
                    },
                ).status_code,
                421,
            )


def make_application():
    from oauth2_provider.models import Application

    return Application.objects.create(
        name="Framework test client",
        client_id="framework-client",
        client_type="public",
        authorization_grant_type="authorization-code",
        redirect_uris=CALLBACK,
    )


def make_token(user, application, **updates):
    from oauth2_provider.models import AccessToken

    values = dict(
        user=user,
        application=application,
        token="framework-access",
        scope=" ".join(settings.MCP_REQUIRED_SCOPES),
        expires=timezone.now() + timedelta(hours=1),
        resource=[settings.MCP_RESOURCE_URL],
    )
    values.update(updates)
    return AccessToken.objects.create(**values)


@unittest.skipUnless(
    settings.MCP_ENABLED, "Run the separate MCP-enabled profile to exercise OAuth"
)
class OAuthTests(TestCase):
    def setUp(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        self.user = get_user_model().objects.create_user(
            "framework-user",
            email="framework@example.test",
            password="Test-only-password-789!",
        )
        self.application = make_application()
        self.jwt = str(RefreshToken.for_user(self.user).access_token)
        self.client.defaults.update(
            HTTP_AUTHORIZATION=f"Bearer {self.jwt}", HTTP_ACCEPT="application/json"
        )

    def consent(self, **changes):
        query = dict(
            client_id=self.application.client_id,
            response_type="code",
            redirect_uri=CALLBACK,
            scope=" ".join(settings.MCP_REQUIRED_SCOPES),
            state="client-state",
            resource=settings.MCP_RESOURCE_URL,
            code_challenge=CHALLENGE,
            code_challenge_method="S256",
        )
        query.update(changes)
        return self.client.get("/auth/mcp/authorize/", query)

    def exchange(self, code, **changes):
        data = dict(
            grant_type="authorization_code",
            client_id=self.application.client_id,
            code=code,
            redirect_uri=CALLBACK,
            code_verifier=VERIFIER,
            resource=settings.MCP_RESOURCE_URL,
        )
        data.update(changes)
        return self.client.post(
            "/auth/mcp/token/",
            urlencode(data),
            content_type="application/x-www-form-urlencoded",
        )

    def authorize(self):
        response = self.consent()
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertEqual(
            [p["scope"] for p in data["permissions"]], settings.MCP_REQUIRED_SCOPES
        )
        approved = self.client.post(
            "/auth/mcp/authorize/", {"ticket": data["ticket"], "decision": "allow"}
        )
        self.assertEqual(approved.status_code, 200, approved.content)
        query = parse_qs(urlsplit(approved.json()["redirect_url"]).query)
        self.assertEqual(query["state"], ["client-state"])
        self.assertEqual(query["iss"], [settings.MCP_BASE_URL])
        return query["code"][0]

    def test_pkce_exchange_pending_connection_refresh_and_revoke(self):
        from oauth2_provider.models import Grant

        from .oauth import resolve_token

        code = self.authorize()
        self.assertTrue(Grant.objects.exists())
        self.assertEqual(
            len(self.client.get("/auth/mcp/connections/").json()["applications"]), 1
        )
        issued = self.exchange(code)
        self.assertEqual(issued.status_code, 200, issued.content)
        tokens = issued.json()
        self.assertEqual(resolve_token(tokens["access_token"]).user_id, self.user.pk)
        self.assertEqual(resolve_token(tokens["access_token"]).token, "")
        refreshed = self.client.post(
            "/auth/mcp/token/",
            urlencode(
                dict(
                    grant_type="refresh_token",
                    client_id=self.application.client_id,
                    refresh_token=tokens["refresh_token"],
                    resource=settings.MCP_RESOURCE_URL,
                )
            ),
            content_type="application/x-www-form-urlencoded",
        )
        self.assertEqual(refreshed.status_code, 200, refreshed.content)
        self.assertNotEqual(tokens["refresh_token"], refreshed.json()["refresh_token"])
        self.assertEqual(
            len(self.client.get("/auth/mcp/connections/").json()["applications"]), 1
        )
        revoked = self.client.post(
            "/auth/mcp/connections/", {"application_id": self.application.pk}
        )
        self.assertEqual(revoked.status_code, 200)
        with self.assertRaises(PermissionDenied):
            resolve_token(refreshed.json()["access_token"])
        self.assertFalse(Grant.objects.exists())
        self.assertEqual(
            self.client.get("/auth/mcp/connections/").json()["applications"], []
        )

    def test_wrong_resource_pkce_callback_and_unknown_scope_are_rejected(self):
        for change in (
            {"resource": "https://other.example/mcp"},
            {"code_challenge_method": "plain"},
            {"state": ""},
            {"redirect_uri": "https://attacker.example/callback"},
            {"scope": "undeclared:scope"},
        ):
            with self.subTest(change=change):
                response = self.consent(**change)
                # OAuth errors for a validated client callback may be returned
                # as a redirect URL. They must never produce a consent ticket.
                self.assertNotIn("ticket", response.json())
                if response.status_code == 200:
                    query = parse_qs(urlsplit(response.json()["redirect_url"]).query)
                    self.assertIn("error", query)
                    self.assertNotIn("code", query)
        code = self.authorize()
        self.assertEqual(self.exchange(code, code_verifier="wrong").status_code, 400)

    def test_ticket_binding_and_client_changes_are_revalidated(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        ticket = self.consent().json()["ticket"]
        other = get_user_model().objects.create_user(
            "other-framework", email="other-framework@example.test"
        )
        response = self.client.post(
            "/auth/mcp/authorize/",
            {"ticket": ticket, "decision": "allow"},
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(other).access_token}",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            self.client.post(
                "/auth/mcp/authorize/", {"ticket": ticket + "x", "decision": "allow"}
            ).status_code,
            400,
        )
        self.application.redirect_uris = "https://other.example/callback"
        self.application.save()
        self.assertNotEqual(
            self.client.post(
                "/auth/mcp/authorize/", {"ticket": ticket, "decision": "allow"}
            ).status_code,
            200,
        )

    def test_cookie_authentication_cannot_consent_or_revoke_other_accounts(self):
        from oauth2_provider.models import AccessToken
        from rest_framework_simplejwt.tokens import RefreshToken

        token = make_token(self.user, self.application)
        other = get_user_model().objects.create_user(
            "isolated-framework", email="isolated-framework@example.test"
        )
        response = self.client.post(
            "/auth/mcp/connections/",
            {"application_id": self.application.pk, "user_id": self.user.pk},
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(other).access_token}",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(AccessToken.objects.filter(pk=token.pk).exists())
        self.client.force_login(self.user)
        self.assertEqual(
            self.client.get("/auth/mcp/authorize/", HTTP_AUTHORIZATION="").status_code,
            401,
        )
        self.assertEqual(
            self.client.post(
                "/auth/mcp/connections/",
                {"application_id": self.application.pk},
                HTTP_AUTHORIZATION="",
            ).status_code,
            401,
        )

    def test_registration_requires_exact_https_callback_and_never_overwrites(self):
        for uri in (
            "http://client.example/callback",
            "https://client.example/*",
            "https://user:password@client.example/callback",
            "https://client.example/callback#fragment",
        ):
            with self.assertRaises(CommandError):
                call_command(
                    "register_mcp_client", redirect_uri=[uri], stdout=io.StringIO()
                )
        call_command(
            "register_mcp_client", redirect_uri=[CALLBACK], stdout=io.StringIO()
        )
        with self.assertRaises(CommandError):
            call_command(
                "register_mcp_client", redirect_uri=[CALLBACK], stdout=io.StringIO()
            )


@unittest.skipUnless(
    settings.MCP_ENABLED, "Run the separate MCP-enabled profile to exercise transport"
)
class HTTPTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "protocol-user", email="protocol@example.test"
        )
        self.application = make_application()
        self.token = make_token(self.user, self.application)

    def test_authenticated_initialization_discovery_and_safe_sample(self):
        import httpx2
        from django.core.asgi import get_asgi_application

        from .asgi import create_application
        from .server import sample_server

        application = create_application(get_asgi_application(), sample_server())

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
        from .oauth import resolve_token

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
                with self.assertRaises(PermissionDenied):
                    resolve_token("framework-access")
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
