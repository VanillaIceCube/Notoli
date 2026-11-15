"""Compatibility imports preserve the existing Notoli endpoint names."""

from app_mcp.views import (
    MCPAuthorizationView as NotoliAuthorizationView,
)
from app_mcp.views import (
    authorization_metadata,
    connections,
    resource_metadata,
)

__all__ = [
    "NotoliAuthorizationView",
    "authorization_metadata",
    "connections",
    "resource_metadata",
]
