"""OAuth consent, PKCE, client onboarding and token lifecycle."""

import io
import unittest
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .helpers import CALLBACK, CHALLENGE, VERIFIER, make_application, make_token


@unittest.skipUnless(
    settings.MCP_ENABLED, "Run the separate MCP-enabled profile to exercise OAuth"
)
class OAuthAuthorizationTests(TestCase):
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
        return self.client.get(
            "/auth/mcp/authorize/",
            {key: value for key, value in query.items() if value is not None},
        )

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
            urlencode({key: value for key, value in data.items() if value is not None}),
            content_type="application/x-www-form-urlencoded",
        )

    def authorize(self, **changes):
        response = self.consent(**changes)
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

        from ..oauth import resolve_token

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

    def test_toolkit_onboarding_preserves_public_consent_and_existing_clients(self):
        from oauth2_provider.models import Application

        call_command(
            "createapplication",
            "public",
            "authorization-code",
            client_id="onboarded-client",
            name="Framework onboarding",
            redirect_uris=CALLBACK,
            stdout=io.StringIO(),
        )
        self.application = Application.objects.get(client_id="onboarded-client")
        self.assertEqual(self.application.client_type, "public")
        self.assertEqual(
            self.application.authorization_grant_type, "authorization-code"
        )
        self.assertFalse(self.application.skip_authorization)

        output = io.StringIO()
        call_command(
            "createapplication",
            "public",
            "authorization-code",
            client_id="onboarded-client",
            name="Unreviewed replacement",
            redirect_uris="https://other.example/callback",
            stdout=output,
        )
        self.assertIn("Please correct", output.getvalue())
        self.application.refresh_from_db()
        self.assertEqual(self.application.name, "Framework onboarding")
        self.assertEqual(self.application.redirect_uris, CALLBACK)
        self.assertEqual(self.exchange(self.authorize()).status_code, 200)

    def test_toolkit_onboarding_enforces_application_callback_policy(self):
        from oauth2_provider.models import Application

        for uri in (
            "http://client.example/callback",
            "https://*.client.example/callback",
            "https://client.example/callback#fragment",
        ):
            with self.subTest(uri=uri):
                output = io.StringIO()
                call_command(
                    "createapplication",
                    "public",
                    "authorization-code",
                    client_id="invalid-callback-client",
                    name="Invalid callback",
                    redirect_uris=uri,
                    stdout=output,
                )
                self.assertIn("Please correct", output.getvalue())
                self.assertFalse(
                    Application.objects.filter(
                        client_id="invalid-callback-client"
                    ).exists()
                )

    def test_stored_unsafe_callbacks_cannot_authorize_explicitly_or_by_default(self):
        from oauth2_provider.models import Grant

        for uri in (
            "http://client.example/callback",
            "https://user:password@client.example/callback",
            "https://client.example/*",
            "https://client.example/callback#fragment",
        ):
            self.application.redirect_uris = uri
            self.application.save(update_fields=["redirect_uris"])
            for requested_uri in (uri, None):
                with self.subTest(stored=uri, requested=requested_uri):
                    response = self.consent(redirect_uri=requested_uri)
                    self.assertEqual(response.status_code, 400)
                    self.assertNotIn("ticket", response.json())
                    self.assertFalse(Grant.objects.exists())

    def test_stored_unsafe_callback_grants_cannot_issue_tokens(self):
        from oauth2_provider.models import AccessToken, Grant

        for index, uri in enumerate(
            (
                "http://client.example/callback",
                "https://user:password@client.example/callback",
                "https://client.example/*",
                "https://client.example/callback#fragment",
            )
        ):
            with self.subTest(uri=uri):
                grant = Grant.objects.create(
                    user=self.user,
                    application=self.application,
                    code=f"legacy-code-{index}",
                    expires=timezone.now() + timedelta(seconds=120),
                    redirect_uri=uri,
                    scope=" ".join(settings.MCP_REQUIRED_SCOPES),
                    code_challenge=CHALLENGE,
                    code_challenge_method="S256",
                    resource=[settings.MCP_RESOURCE_URL],
                )
                self.assertEqual(
                    self.exchange(grant.code, redirect_uri=uri).status_code, 400
                )
                self.assertFalse(AccessToken.objects.exists())

    def test_registered_default_callback_supports_consent_and_code_exchange(self):
        code = self.authorize(redirect_uri=None)
        response = self.exchange(code, redirect_uri=None)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("access_token", response.json())


@unittest.skipUnless(settings.MCP_ENABLED, "Run the MCP-enabled profile")
class ActionApprovalTests(TestCase):
    def setUp(self):
        from uuid import uuid4

        from rest_framework_simplejwt.tokens import AccessToken

        self.user = get_user_model().objects.create_user("action-user")
        self.jwt = str(AccessToken.for_user(self.user))
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {self.jwt}"
        self.reference = str(uuid4())

    def test_unconfigured_app_cannot_enable_action_approval_from_request(self):
        with self.settings(MCP_ACTION_APPROVAL_HANDLER=None):
            self.assertEqual(
                self.client.get(
                    "/auth/mcp/action-approval/",
                    {"approval_id": self.reference, "handler": "untrusted.module"},
                ).status_code,
                404,
            )

    def test_signed_exact_preview_uses_verified_actor_and_atomic_explicit_decision(
        self,
    ):
        from unittest.mock import patch

        from django.db import connection
        from django.test import Client

        decisions = []
        state = {
            "status": "prepared",
            "action": "sample.change",
            "changes": {"name": "Original"},
        }

        def handler(user, reference, decision=None):
            self.assertTrue(connection.in_atomic_block)
            self.assertEqual(user.pk, self.user.pk)
            self.assertEqual(reference, self.reference)
            if decision is not None:
                decisions.append(decision)
                state["status"] = "approved" if decision == "allow" else "cancelled"
            return dict(state)

        with (
            self.settings(MCP_ACTION_APPROVAL_HANDLER="configured.handler"),
            patch("apps.mcp.framework.views.import_string", return_value=handler),
        ):
            preview = self.client.get(
                "/auth/mcp/action-approval/", {"approval_id": self.reference}
            )
            self.assertEqual(preview.status_code, 200)
            self.assertEqual(decisions, [])
            ticket = preview.json()["ticket"]
            app = make_application()
            token = make_token(self.user, app)
            bearer = Client(HTTP_AUTHORIZATION=f"Bearer {token.token}")
            self.assertEqual(
                bearer.post(
                    "/auth/mcp/action-approval/",
                    {"ticket": ticket, "decision": "allow"},
                ).status_code,
                401,
            )
            self.assertEqual(
                self.client.post(
                    "/auth/mcp/action-approval/",
                    {"ticket": ticket + "tampered", "decision": "allow"},
                ).status_code,
                400,
            )
            self.assertEqual(decisions, [])
            state["changes"] = {"name": "Changed"}
            self.assertEqual(
                self.client.post(
                    "/auth/mcp/action-approval/",
                    {"ticket": ticket, "decision": "allow"},
                ).status_code,
                409,
            )
            self.assertEqual(decisions, [])
            ticket = self.client.get(
                "/auth/mcp/action-approval/", {"approval_id": self.reference}
            ).json()["ticket"]
            approved = self.client.post(
                "/auth/mcp/action-approval/",
                {"ticket": ticket, "decision": "allow", "user_id": 999},
            )
            self.assertEqual(approved.status_code, 200)
            self.assertEqual(approved.json()["approval"]["status"], "approved")
            self.assertEqual(decisions, ["allow"])
            self.assertEqual(
                self.client.post(
                    "/auth/mcp/action-approval/",
                    {"ticket": ticket, "decision": "allow"},
                ).status_code,
                409,
            )
            self.assertEqual(decisions, ["allow"])
