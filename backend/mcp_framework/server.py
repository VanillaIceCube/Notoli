"""Application-neutral transport; application tools remain in their own registries."""

from urllib.parse import urlsplit

from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.exceptions import PermissionDenied
from mcp.server import MCPServer
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations

from .oauth import resolve_token


class DjangoTokenVerifier(TokenVerifier):
    async def verify_token(self, token: str) -> AccessToken | None:
        def lookup():
            try:
                record = resolve_token(token)
            except PermissionDenied:
                return None
            return AccessToken(
                token=token,
                client_id=record.application.client_id,
                scopes=record.scope.split(),
                expires_at=int(record.expires.timestamp()),
                subject=str(record.user_id),
                resource=settings.MCP_RESOURCE_URL,
                claims={"iss": settings.MCP_BASE_URL},
            )

        return await sync_to_async(lookup, thread_sensitive=True)()


def create_server(*, instructions, verifier=None, issuer_url=None):
    issuer = settings.MCP_BASE_URL if issuer_url is None else issuer_url
    if issuer != settings.MCP_BASE_URL and verifier is None:
        raise ValueError("An external issuer requires an explicit token verifier")
    if (
        issuer != settings.MCP_BASE_URL
        and not settings.DEBUG
        and not str(issuer).startswith("https://")
    ):
        raise ValueError("Production MCP issuers require HTTPS")
    return MCPServer(
        settings.MCP_NAME,
        token_verifier=verifier if verifier is not None else DjangoTokenVerifier(),
        auth=AuthSettings(
            issuer_url=issuer,
            resource_server_url=settings.MCP_RESOURCE_URL,
            required_scopes=settings.MCP_REQUIRED_SCOPES,
            validate_token_resource=True,
        ),
        instructions=instructions,
    )


def http_application(server):
    hosts = [urlsplit(settings.MCP_BASE_URL).netloc]
    origins = [settings.MCP_BASE_URL]
    if settings.DEBUG:
        hosts += [f"{host}:*" for host in settings.ALLOWED_HOSTS if host != "*"]
        origins += settings.CORS_ALLOWED_ORIGINS
    return server.streamable_http_app(
        streamable_http_path="/mcp",
        json_response=True,
        stateless_http=True,
        max_request_body_size=65536,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=hosts,
            allowed_origins=origins,
        ),
    )


def sample_server():
    server = create_server(
        instructions="This sample checks the authenticated connection only. It has no application data tools."
    )

    @server.tool(
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
        structured_output=True,
        meta={
            "securitySchemes": [
                {"type": "oauth2", "scopes": settings.MCP_REQUIRED_SCOPES}
            ]
        },
    )
    async def connection_status() -> dict[str, bool]:
        """Confirm this authenticated MCP connection without reading application data."""
        return {"connected": True}

    return server
