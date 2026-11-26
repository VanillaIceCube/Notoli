"""OAuth client, token, PKCE and authenticated request fixtures for MCP tests."""

import base64
import hashlib
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from oauth2_provider.models import AccessToken, Application
from rest_framework_simplejwt.tokens import RefreshToken as JWTRefreshToken

CALLBACK = "https://chatgpt.com/connector/oauth/test-callback"

VERIFIER = "notoli-test-code-verifier-with-at-least-forty-three-characters"

CHALLENGE = (
    base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest())
    .decode()
    .rstrip("=")
)


def make_client():
    return Application.objects.create(
        name="Notoli for ChatGPT",
        client_id="notoli-chatgpt",
        client_type="public",
        authorization_grant_type="authorization-code",
        redirect_uris=CALLBACK,
    )


def make_token(
    user, app, value="test-access", scope="notoli:read notoli:write", resource=None
):
    return AccessToken.objects.create(
        user=user,
        application=app,
        token=value,
        scope=scope,
        expires=timezone.now() + timedelta(hours=1),
        resource=[resource or settings.MCP_RESOURCE_URL],
    )


class OAuthClientFixture:
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "oauth-user", email="oauth@example.com", password="Strong-password-789!"
        )
        self.app = make_client()
        self.jwt = str(JWTRefreshToken.for_user(self.user).access_token)
        self.client.defaults.update(
            HTTP_AUTHORIZATION=f"Bearer {self.jwt}", HTTP_ACCEPT="application/json"
        )

    def authorize(self, **changes):
        params = {
            "client_id": self.app.client_id,
            "response_type": "code",
            "redirect_uri": CALLBACK,
            "scope": "notoli:read notoli:write",
            "state": "unguessable-client-state",
            "resource": settings.MCP_RESOURCE_URL,
            "code_challenge": CHALLENGE,
            "code_challenge_method": "S256",
        }
        params.update(changes)
        response = self.client.get("/auth/mcp/authorize/", params)
        if response.status_code != 200 or "ticket" not in response.json():
            return response
        data = {"ticket": response.json()["ticket"], "decision": "allow"}
        return self.client.post("/auth/mcp/authorize/", data)

    def exchange(self, code, **changes):
        data = {
            "grant_type": "authorization_code",
            "client_id": self.app.client_id,
            "code": code,
            "redirect_uri": CALLBACK,
            "code_verifier": VERIFIER,
            "resource": settings.MCP_RESOURCE_URL,
        }
        data.update(changes)
        return self.client.post(
            "/auth/mcp/token/",
            urlencode(data),
            content_type="application/x-www-form-urlencoded",
        )

    def issue(self):
        response = self.authorize()
        self.assertEqual(response.status_code, 200, response.content)
        params = parse_qs(urlsplit(response.json()["redirect_url"]).query)
        self.assertEqual(params["state"], ["unguessable-client-state"])
        self.assertEqual(params["iss"], [settings.MCP_BASE_URL])
        response = self.exchange(params["code"][0])
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def consent(self, **changes):
        params = {
            "client_id": self.app.client_id,
            "response_type": "code",
            "redirect_uri": CALLBACK,
            "scope": "notoli:read notoli:write",
            "state": "pending-state",
            "resource": settings.MCP_RESOURCE_URL,
            "code_challenge": CHALLENGE,
            "code_challenge_method": "S256",
        }
        params.update(changes)
        return self.client.get("/auth/mcp/authorize/", params)


def execute_action(raw, operation, **arguments):
    """Domain regression fixture: drive real UUID/JWT approval where required."""
    from uuid import uuid4

    from django.test import Client

    from .. import queries, services

    if operation not in queries.READ_OPERATIONS:
        arguments.setdefault("request_id", str(uuid4()))
    output = services.execute(raw, operation, **arguments)
    if output.get("status") == "prepared":
        token = AccessToken.objects.get(token=raw)
        client = Client(
            HTTP_AUTHORIZATION=f"Bearer {JWTRefreshToken.for_user(token.user).access_token}"
        )
        reference = output["result"]["confirmation_id"]
        preview = client.get("/auth/mcp/action-approval/", {"approval_id": reference})
        assert preview.status_code == 200, preview.content
        decision = client.post(
            "/auth/mcp/action-approval/",
            {"ticket": preview.json()["ticket"], "decision": "allow"},
        )
        assert decision.status_code == 200, decision.content
        return services.confirm_change(raw, output["request_id"], reference)["result"]
    return output["result"] if output.get("status") == "completed" else output
