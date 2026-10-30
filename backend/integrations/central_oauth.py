"""Notoli's bounded consumer of the independent MCP authorization service."""

import asyncio
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import httpx2
from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from mcp.server.auth.provider import AccessToken, TokenVerifier

from mcp_framework.oauth import ConnectionPermissionDenied

from .models import MCPIdentityLink

ISSUER = "https://auth.judeandrewalaba.com"
INTROSPECTION_URL = ISSUER + "/o/introspect/"
MANAGEMENT_URL = ISSUER + "/o/authorized_tokens/"
RESOURCE = "https://notoli.judeandrewalaba.com/mcp"
CLIENTS = frozenset({"notoli-chatgpt", "notoli-codex"})
MAX_RESPONSE = 16 * 1024
DEADLINE = 3
DENIED = "Notoli connection expired, revoked, or lacks the required permission."


def validate_configuration():
    if settings.MCP_RESOURCE_URL != RESOURCE or settings.MCP_BASE_URL != RESOURCE[:-4]:
        raise ImproperlyConfigured(
            "Central MCP requires the fixed Notoli resource origin"
        )
    try:
        credentials()
    except (OSError, ValueError, TypeError):
        raise ImproperlyConfigured(
            "Missing or invalid MCP introspection client secret"
        ) from None


def credentials():
    """Use the existing private backend.env delivery boundary, never caller input."""
    secret = settings.MCP_INTROSPECTION_CLIENT_SECRET
    if (
        not isinstance(secret, str)
        or not 1 <= len(secret) <= 2048
        or not secret.strip()
        or any(character in secret for character in "\r\n\0")
    ):
        raise ValueError("Invalid introspection configuration")
    return "notoli-introspection", secret


async def introspect(raw_token, credential):
    # The outer deadline bounds connect, headers AND trickled response chunks.
    async with asyncio.timeout(DEADLINE):
        async with httpx2.AsyncClient(
            timeout=DEADLINE, verify=True, follow_redirects=False, trust_env=False
        ) as client:
            async with client.stream(
                "POST",
                INTROSPECTION_URL,
                data={"token": raw_token},
                auth=httpx2.BasicAuth(*credential),
                headers={"Accept": "application/json"},
            ) as response:
                if (
                    response.status_code != 200
                    or response.headers.get("content-type", "").split(";", 1)[0].strip()
                    != "application/json"
                ):
                    raise ValueError("Invalid introspection response")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_RESPONSE:
                        raise ValueError("Invalid introspection response")
                return json.loads(body)


@dataclass(frozen=True)
class ApplicationIdentity:
    client_id: str


@dataclass(frozen=True)
class CentralToken:
    user: object
    application: ApplicationIdentity
    scope: str
    expires: datetime
    subject: str

    @property
    def user_id(self):
        return self.user.pk

    def is_valid(self, scopes):
        return (
            self.user.is_active
            and time.time() < self.expires.timestamp()
            and set(scopes) <= set(self.scope.split())
        )


def resolve_token(raw_token, scope="notoli:read"):
    """No remote-user creation or token cache; every call revalidates the grant."""
    try:
        if (
            not isinstance(raw_token, str)
            or not 1 <= len(raw_token) <= 8192
            or not re.fullmatch(r"[A-Za-z0-9._~+/-]{1,8192}=*", raw_token)
        ):
            raise ValueError("Invalid bearer")
        data = asyncio.run(introspect(raw_token, credentials()))
        if not isinstance(data, dict):
            raise ValueError("Invalid introspection response")
        subject = data.get("sub")
        issued, expires = data.get("iat"), data.get("exp")
        scopes = data.get("scope")
        audience = data.get("aud")
        now = time.time()
        if (
            data.get("active") is not True
            or data.get("iss") != ISSUER
            or not isinstance(subject, str)
            or str(UUID(subject)) != subject
            or audience not in (RESOURCE, [RESOURCE])
            or data.get("client_id") not in CLIENTS
            or not isinstance(scopes, str)
            or not set(scopes.split()) <= set(settings.OAUTH2_PROVIDER["SCOPES"])
            or scope not in scopes.split()
            or type(issued) is not int
            or type(expires) is not int
            or not 0 < issued <= now + 5
            or not now < expires <= issued + 900
        ):
            raise ValueError("Invalid introspection identity")
        link = MCPIdentityLink.objects.select_related("user").get(
            issuer=ISSUER, subject=subject, enabled=True, user__is_active=True
        )
        return CentralToken(
            user=link.user,
            application=ApplicationIdentity(data["client_id"]),
            scope=scopes,
            expires=datetime.fromtimestamp(expires, timezone.utc),
            subject=subject,
        )
    except (
        OSError,
        ValueError,
        TypeError,
        httpx2.HTTPError,
        TimeoutError,
        MCPIdentityLink.DoesNotExist,
    ):
        raise ConnectionPermissionDenied(DENIED) from None


class CentralTokenVerifier(TokenVerifier):
    async def verify_token(self, token):
        def lookup():
            try:
                resolved = resolve_token(token)
            except ConnectionPermissionDenied:
                return None
            return AccessToken(
                token=token,
                client_id=resolved.application.client_id,
                scopes=resolved.scope.split(),
                expires_at=int(resolved.expires.timestamp()),
                subject=resolved.subject,
                resource=RESOURCE,
                claims={"iss": ISSUER},
            )

        return await sync_to_async(lookup, thread_sensitive=True)()
