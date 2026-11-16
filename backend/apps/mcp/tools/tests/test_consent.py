"""Existing-account consent, scope approval and signed ticket validation."""

# ruff: noqa: E402 -- skip before importing optional OAuth ORM models.
from unittest import SkipTest

from django.conf import settings

if not settings.MCP_ENABLED:
    raise SkipTest("Run the enabled app-owned OAuth profile")


from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from oauth2_provider.models import AccessToken, Grant
from rest_framework_simplejwt.tokens import RefreshToken as JWTRefreshToken

from apps.mcp.framework.oauth import resolve_token

from .helpers import CALLBACK, CHALLENGE, OAuthClientFixture


class ConsentTests(OAuthClientFixture, TestCase):
    def test_read_consent_discloses_collaborator_identity_and_email_access(self):
        response = self.consent(scope="notoli:read")
        self.assertEqual(response.status_code, 200)
        permission = response.json()["permissions"][0]
        self.assertEqual(permission["scope"], "notoli:read")
        for detail in ("owner", "collaborator IDs", "usernames", "email addresses"):
            self.assertIn(detail, permission["description"])

    def test_existing_login_jwt_bridge_cookie_rejection_and_metadata(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        # An ambient Django/admin cookie is never sufficient authorization.
        self.assertEqual(client.get("/auth/mcp/connections/").status_code, 401)
        client.logout()
        response = client.post(
            "/auth/login/",
            {"email": self.user.email, "password": "Strong-password-789!"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        jwt = response.json()["access"]
        self.assertEqual(
            client.post(
                "/auth/mcp/connections/",
                {"application_id": self.app.pk},
                HTTP_AUTHORIZATION=f"Bearer {jwt}",
            ).status_code,
            200,
        )
        self.assertEqual(client.get("/auth/mcp/login/").status_code, 404)
        self.assertEqual(client.post("/auth/mcp/logout/").status_code, 404)
        self.assertEqual(
            self.client.post(
                "/auth/mcp/connections/", {"application_id": "bad"}
            ).status_code,
            400,
        )
        metadata = self.client.get("/.well-known/oauth-authorization-server").json()
        self.assertEqual(metadata["code_challenge_methods_supported"], ["S256"])
        self.assertNotIn("registration_endpoint", metadata)
        self.assertEqual(
            self.client.get("/.well-known/oauth-protected-resource/mcp").json()[
                "resource"
            ],
            settings.MCP_RESOURCE_URL,
        )

    def test_consent_denial_and_unsupported_grants(self):
        response = self.client.get(
            "/auth/mcp/authorize/",
            {
                "client_id": self.app.client_id,
                "response_type": "code",
                "redirect_uri": CALLBACK,
                "scope": "notoli:read",
                "state": "deny-state",
                "resource": settings.MCP_RESOURCE_URL,
                "code_challenge": CHALLENGE,
                "code_challenge_method": "S256",
            },
        )
        data = {"ticket": response.json()["ticket"], "decision": "cancel"}
        denied = self.client.post("/auth/mcp/authorize/", data)
        self.assertEqual(denied.status_code, 200)
        params = parse_qs(urlsplit(denied.json()["redirect_url"]).query)
        self.assertEqual(params["error"], ["access_denied"])
        self.assertEqual(params["iss"], [settings.MCP_BASE_URL])
        self.assertEqual(params["state"], ["deny-state"])
        self.assertFalse(AccessToken.objects.exists())
        self.assertFalse(Grant.objects.exists())
        csrf = Client(enforce_csrf_checks=True)
        csrf.force_login(self.user)
        self.assertEqual(csrf.post("/auth/mcp/authorize/", data).status_code, 401)
        for grant in ("password", "client_credentials"):
            response = self.client.post(
                "/auth/mcp/token/",
                urlencode({"grant_type": grant, "client_id": self.app.client_id}),
                content_type="application/x-www-form-urlencoded",
            )
            self.assertIn(response.status_code, (400, 401))

    def test_sharing_requires_explicit_consent_and_cannot_be_added_on_refresh(self):
        consent = self.consent(scope="notoli:read notoli:write notoli:share")
        self.assertEqual(consent.status_code, 200)
        permissions = {
            p["scope"]: p["description"] for p in consent.json()["permissions"]
        }
        self.assertIn("every list and item", permissions["notoli:share"])
        approved = self.client.post(
            "/auth/mcp/authorize/",
            {"ticket": consent.json()["ticket"], "decision": "allow"},
        )
        code = parse_qs(urlsplit(approved.json()["redirect_url"]).query)["code"][0]
        issued = self.exchange(code).json()
        self.assertTrue(
            resolve_token(issued["access_token"]).is_valid(
                ["notoli:read", "notoli:share"]
            )
        )
        legacy = self.issue()
        response = self.client.post(
            "/auth/mcp/token/",
            urlencode(
                {
                    "grant_type": "refresh_token",
                    "client_id": self.app.client_id,
                    "refresh_token": legacy["refresh_token"],
                    "resource": settings.MCP_RESOURCE_URL,
                    "scope": "notoli:read notoli:write notoli:share",
                }
            ),
            content_type="application/x-www-form-urlencoded",
        )
        self.assertEqual(response.status_code, 400)

    def test_product_scopes_require_consent_and_cannot_escalate_on_refresh(self):
        scopes = " ".join(settings.OAUTH2_PROVIDER["SCOPES"])
        consent = self.consent(scope=scopes)
        self.assertEqual(consent.status_code, 200)
        displayed = {p["scope"] for p in consent.json()["permissions"]}
        self.assertEqual(displayed, set(scopes.split()))
        approved = self.client.post(
            "/auth/mcp/authorize/",
            {"ticket": consent.json()["ticket"], "decision": "allow"},
        )
        code = parse_qs(urlsplit(approved.json()["redirect_url"]).query)["code"][0]
        token = self.exchange(code).json()
        self.assertTrue(resolve_token(token["access_token"]).is_valid(scopes.split()))
        for scope in ("notoli:organize", "notoli:notifications", "notoli:delete"):
            with self.subTest(scope=scope):
                legacy = self.issue()
                response = self.client.post(
                    "/auth/mcp/token/",
                    urlencode(
                        {
                            "grant_type": "refresh_token",
                            "client_id": self.app.client_id,
                            "refresh_token": legacy["refresh_token"],
                            "resource": settings.MCP_RESOURCE_URL,
                            "scope": f"notoli:read notoli:write {scope}",
                        }
                    ),
                    content_type="application/x-www-form-urlencoded",
                )
                self.assertEqual(response.status_code, 400)

    def test_browser_redirect_and_existing_jwt_consent(self):
        query = urlencode({"state": "a&b=?", "resource": settings.MCP_RESOURCE_URL})
        response = Client().get(f"/auth/mcp/authorize/?{query}")
        self.assertEqual(
            response.url, f"{settings.FRONTEND_BASE_URL}/connections/authorize?{query}"
        )
        response = self.consent()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["application"]["client_id"], self.app.client_id)
        self.assertEqual(data["user"]["username"], self.user.username)
        self.assertEqual(
            [p["scope"] for p in data["permissions"]], ["notoli:read", "notoli:write"]
        )
        self.assertNotIn("sessionid", response.cookies)
        self.assertFalse(Grant.objects.exists())
        expired = JWTRefreshToken.for_user(self.user).access_token
        expired.set_exp(lifetime=timedelta(seconds=-1))
        for bearer in (
            "invalid",
            str(expired),
            str(JWTRefreshToken.for_user(self.user)),
            "oauth-access",
        ):
            self.assertEqual(
                self.client.get(
                    "/auth/mcp/authorize/", HTTP_AUTHORIZATION=f"Bearer {bearer}"
                ).status_code,
                401,
            )

    def test_consent_ticket_expiry_tampering_and_account_binding(self):
        with patch(
            "django.core.signing.time.time",
            return_value=timezone.now().timestamp() - 601,
        ):
            expired = self.consent().json()["ticket"]
        ticket = self.consent().json()["ticket"]
        for value in (expired, ticket + "tampered", "", "malformed"):
            response = self.client.post(
                "/auth/mcp/authorize/", {"ticket": value, "decision": "allow"}
            )
            self.assertEqual(response.status_code, 400)
        other = get_user_model().objects.create_user("ticket-other")
        response = self.client.post(
            "/auth/mcp/authorize/",
            {"ticket": ticket, "decision": "allow"},
            HTTP_AUTHORIZATION=f"Bearer {JWTRefreshToken.for_user(other).access_token}",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Grant.objects.exists())
        # Client-supplied fields cannot replace the request shown in consent.
        approved = self.client.post(
            "/auth/mcp/authorize/",
            {
                "ticket": ticket,
                "decision": "allow",
                "redirect_uri": "https://evil.example",
                "scope": "unknown",
                "state": "changed",
                "user_id": other.pk,
            },
        )
        self.assertEqual(approved.status_code, 200, approved.content)
        callback = urlsplit(approved.json()["redirect_url"])
        self.assertEqual(callback.netloc, urlsplit(CALLBACK).netloc)
        self.assertEqual(parse_qs(callback.query)["state"], ["pending-state"])
        grant = Grant.objects.get()
        self.assertEqual(grant.user_id, self.user.pk)
        self.assertEqual(grant.scope, "notoli:read notoli:write")

    def test_signed_consent_revalidates_client_callback_and_user(self):
        ticket = self.consent().json()["ticket"]
        self.app.redirect_uris = "https://chatgpt.com/other"
        self.app.save()
        response = self.client.post(
            "/auth/mcp/authorize/", {"ticket": ticket, "decision": "allow"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Grant.objects.exists())
        self.user.is_active = False
        self.user.save()
        self.assertEqual(
            self.client.post(
                "/auth/mcp/authorize/", {"ticket": ticket, "decision": "allow"}
            ).status_code,
            401,
        )

    def test_client_deleted_after_consent_cannot_issue_a_grant(self):
        ticket = self.consent().json()["ticket"]
        self.app.delete()
        response = self.client.post(
            "/auth/mcp/authorize/", {"ticket": ticket, "decision": "allow"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Grant.objects.exists())

    def test_existing_login_to_consent_to_callback_without_session_cookies(self):
        client = Client(enforce_csrf_checks=True)
        jwt = client.post(
            "/auth/login/",
            {"email": self.user.email, "password": "Strong-password-789!"},
            content_type="application/json",
        ).json()["access"]
        client.defaults.update(
            HTTP_AUTHORIZATION=f"Bearer {jwt}", HTTP_ACCEPT="application/json"
        )
        fields = {
            "client_id": self.app.client_id,
            "response_type": "code",
            "redirect_uri": CALLBACK,
            "scope": "notoli:read",
            "state": "login-return-state",
            "resource": settings.MCP_RESOURCE_URL,
            "code_challenge": CHALLENGE,
            "code_challenge_method": "S256",
        }
        response = client.get("/auth/mcp/authorize/", fields)
        self.assertEqual(response.status_code, 200)
        approved = client.post(
            "/auth/mcp/authorize/",
            {"ticket": response.json()["ticket"], "decision": "allow"},
        )
        self.assertEqual(approved.status_code, 200, approved.content)
        params = parse_qs(urlsplit(approved.json()["redirect_url"]).query)
        self.assertEqual(params["state"], ["login-return-state"])
        self.assertEqual(params["iss"], [settings.MCP_BASE_URL])
        self.assertEqual(self.exchange(params["code"][0]).status_code, 200)
        self.assertNotIn("sessionid", client.cookies)
        self.assertNotIn("csrftoken", client.cookies)
