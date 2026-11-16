"""Connected Apps shows and revokes only the current account grants."""

from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from oauth2_provider.models import AccessToken, Grant, RefreshToken
from rest_framework_simplejwt.tokens import RefreshToken as JWTRefreshToken

from .helpers import CALLBACK, CHALLENGE, OAuthClientFixture, make_token


class ConnectionTests(OAuthClientFixture, TestCase):
    def test_pending_grant_app_is_visible_and_revocable_before_exchange(self):
        approved = self.authorize()
        self.assertEqual(approved.status_code, 200)
        code = parse_qs(urlsplit(approved.json()["redirect_url"]).query)["code"][0]
        second = self.authorize()
        self.assertEqual(second.status_code, 200)
        self.assertFalse(AccessToken.objects.filter(user=self.user).exists())
        self.assertFalse(RefreshToken.objects.filter(user=self.user).exists())
        self.assertEqual(Grant.objects.filter(user=self.user).count(), 2)
        response = self.client.get("/auth/mcp/connections/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["applications"],
            [
                {
                    "id": self.app.pk,
                    "name": self.app.name,
                    "client_id": self.app.client_id,
                }
            ],
        )
        response = self.client.post(
            "/auth/mcp/connections/", {"application_id": self.app.pk}
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Grant.objects.filter(user=self.user).exists())
        self.assertEqual(
            self.client.get("/auth/mcp/connections/").json()["applications"], []
        )
        self.assertEqual(self.exchange(code).status_code, 400)

    def test_pending_connections_exclude_expired_and_other_account_grants(self):
        approved = self.authorize()
        self.assertEqual(approved.status_code, 200)
        Grant.objects.filter(user=self.user).update(
            expires=timezone.now() - timedelta(seconds=1)
        )
        other = get_user_model().objects.create_user(
            "pending-other", email="pending-other@example.com"
        )
        foreign_grant = Grant.objects.create(
            user=other,
            application=self.app,
            code="other-pending-code",
            expires=timezone.now() + timedelta(minutes=5),
            redirect_uri=CALLBACK,
            scope="notoli:read",
            code_challenge=CHALLENGE,
            code_challenge_method="S256",
            resource=[settings.MCP_RESOURCE_URL],
        )
        self.assertEqual(
            self.client.get("/auth/mcp/connections/").json()["applications"], []
        )
        response = self.client.post(
            "/auth/mcp/connections/", {"application_id": self.app.pk}
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Grant.objects.filter(pk=foreign_grant.pk).exists())
        other_client = Client(
            HTTP_AUTHORIZATION=f"Bearer {JWTRefreshToken.for_user(other).access_token}"
        )
        self.assertEqual(
            other_client.get("/auth/mcp/connections/").json()["applications"][0]["id"],
            self.app.pk,
        )

    def test_token_and_pending_grant_show_only_one_connection(self):
        self.issue()
        self.assertEqual(self.authorize().status_code, 200)
        self.assertEqual(
            len(self.client.get("/auth/mcp/connections/").json()["applications"]), 1
        )

    def test_revoke_endpoint_and_user_isolation(self):
        mine = make_token(self.user, self.app)
        other = get_user_model().objects.create_user(
            "other-connection", email="other@example.com"
        )
        theirs = make_token(other, self.app, "other-access")
        response = self.client.post(
            "/auth/mcp/revoke/",
            urlencode({"client_id": self.app.client_id, "token": "test-access"}),
            content_type="application/x-www-form-urlencoded",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(AccessToken.objects.filter(pk=mine.pk).exists())
        self.client.post("/auth/mcp/connections/", {"application_id": self.app.pk})
        self.assertTrue(AccessToken.objects.filter(pk=theirs.pk).exists())

    def test_revoke_removes_pending_codes_and_uses_jwt_owner(self):
        response = self.authorize()
        code = parse_qs(urlsplit(response.json()["redirect_url"]).query)["code"][0]
        other = get_user_model().objects.create_user("revoke-other")
        mine = make_token(self.user, self.app)
        theirs = make_token(other, self.app, "other-connection-access")
        response = self.client.post(
            "/auth/mcp/connections/",
            {"application_id": self.app.pk, "user_id": other.pk},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(AccessToken.objects.filter(pk=mine.pk).exists())
        self.assertTrue(AccessToken.objects.filter(pk=theirs.pk).exists())
        self.assertFalse(Grant.objects.filter(user=self.user).exists())
        self.assertEqual(self.exchange(code).status_code, 400)
