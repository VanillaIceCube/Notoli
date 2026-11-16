"""Application-neutral transport; application tools remain in their own registries."""

from urllib.parse import urlsplit

from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.exceptions import PermissionDenied
from mcp.server import MCPServer
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.transport_security import TransportSecuritySettings

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


def create_server(*, instructions, verifier=None):
    return MCPServer(
        settings.MCP_NAME,
        token_verifier=verifier or DjangoTokenVerifier(),
        auth=AuthSettings(
            issuer_url=settings.MCP_BASE_URL,
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
