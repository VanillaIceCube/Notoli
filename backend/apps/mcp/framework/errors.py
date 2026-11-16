"""Reconnectable connection failures and sanitized MCP authentication challenges."""

import json

from django.conf import settings
from django.core.exceptions import PermissionDenied
from mcp.types import CallToolResult, TextContent


class ConnectionPermissionDenied(PermissionDenied):
    def __init__(self, message, oauth_error="invalid_token", *, required_scopes=()):
        super().__init__(message)
        self.oauth_error = oauth_error
        self.required_scopes = tuple(required_scopes)


def connection_error(error, required_scopes=()):
    """Use only configured branding/scopes, never private exception details."""
    scopes = error.required_scopes or required_scopes or settings.MCP_REQUIRED_SCOPES
    code = (
        "insufficient_scope"
        if error.oauth_error == "insufficient_scope"
        else "invalid_token"
    )
    description = f"Reconnect {settings.MCP_NAME} with the required permissions"
    challenge = (
        f"Bearer resource_metadata={json.dumps(settings.MCP_BASE_URL + '/.well-known/oauth-protected-resource/mcp')}, "
        f"error={json.dumps(code)}, error_description={json.dumps(description)}, "
        f"scope={json.dumps(' '.join(scopes))}"
    )
    return CallToolResult(
        is_error=True,
        content=[TextContent(type="text", text=description + ".")],
        _meta={"mcp/www_authenticate": [challenge]},
    )
