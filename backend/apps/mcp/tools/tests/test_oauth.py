"""OAuth code exchange, PKCE, refresh rotation and token revocation."""

# ruff: noqa: E402 -- skip before importing optional OAuth ORM models.
from unittest import SkipTest

from django.conf import settings

if not settings.MCP_ENABLED:
    raise SkipTest("Run the enabled app-owned OAuth profile")


from urllib.parse import parse_qs, urlencode, urlsplit

from django.core.exceptions import PermissionDenied
from django.test import TestCase
from oauth2_provider.models import RefreshToken

from apps.mcp.framework.oauth import resolve_token

from .helpers import OAuthClientFixture


class AppOAuthFlowTests(OAuthClientFixture, TestCase):
    def test_full_pkce_flow_refresh_and_revoke(self):
        issued = self.issue()
        token = resolve_token(issued["access_token"])
        self.assertEqual(token.user, self.user)
        self.assertEqual(token.token, "")  # Only checksums are stored.
        refresh = self.client.post(
            "/auth/mcp/token/",
            urlencode(
                {
                    "grant_type": "refresh_token",
                    "client_id": self.app.client_id,
                    "refresh_token": issued["refresh_token"],
                    "resource": settings.MCP_RESOURCE_URL,
                }
            ),
            content_type="application/x-www-form-urlencoded",
        )
        self.assertEqual(refresh.status_code, 200, refresh.content)
        self.assertNotEqual(issued["refresh_token"], refresh.json()["refresh_token"])
        response = self.client.get("/auth/mcp/connections/")
        self.assertEqual(
            response.json()["applications"][0]["name"], "Notoli for ChatGPT"
        )
        self.client.post("/auth/mcp/connections/", {"application_id": self.app.pk})
        with self.assertRaises(PermissionDenied):
            resolve_token(refresh.json()["access_token"])
        self.assertFalse(
            RefreshToken.objects.filter(user=self.user, revoked__isnull=True).exists()
        )
        self.assertEqual(
            self.client.get("/auth/mcp/connections/").json()["applications"], []
        )
        self.assertEqual(
            self.client.post(
                "/auth/mcp/token/",
                urlencode(
                    {
                        "grant_type": "refresh_token",
                        "client_id": self.app.client_id,
                        "refresh_token": refresh.json()["refresh_token"],
                        "resource": settings.MCP_RESOURCE_URL,
                    }
                ),
                content_type="application/x-www-form-urlencoded",
            ).status_code,
            400,
        )

    def test_pkce_resource_and_callback_checks(self):
        for changes in (
            {"resource": "https://wrong.example/mcp"},
            {"code_challenge_method": "plain"},
            {"state": ""},
        ):
            self.assertEqual(self.authorize(**changes).status_code, 400)
        response = self.authorize(redirect_uri="https://unregistered.example/callback")
        self.assertEqual(response.status_code, 400)
        response = self.authorize()
        code = parse_qs(urlsplit(response.json()["redirect_url"]).query)["code"][0]
        self.assertEqual(
            self.exchange(code, code_verifier="incorrect-verifier").status_code, 400
        )
        self.assertEqual(
            self.exchange(code, resource="https://wrong.example/mcp").status_code, 400
        )
        good = self.exchange(code)
        self.assertEqual(good.status_code, 200, good.content)
        self.assertEqual(self.exchange(code).status_code, 400)

    def test_refresh_cannot_escalate_scope_and_reuse_revokes_family(self):
        issued = self.issue()

        def refresh(**changes):
            data = {
                "grant_type": "refresh_token",
                "client_id": self.app.client_id,
                "refresh_token": issued["refresh_token"],
                "resource": settings.MCP_RESOURCE_URL,
            }
            data.update(changes)
            return self.client.post(
                "/auth/mcp/token/",
                urlencode(data),
                content_type="application/x-www-form-urlencoded",
            )

        self.assertEqual(
            refresh(scope="notoli:read notoli:write unknown").status_code, 400
        )
        self.assertEqual(refresh(resource="https://wrong.example/mcp").status_code, 400)
        rotated = refresh()
        self.assertEqual(rotated.status_code, 200, rotated.content)
        self.assertEqual(refresh().status_code, 400)
        with self.assertRaises(PermissionDenied):
            resolve_token(rotated.json()["access_token"])
