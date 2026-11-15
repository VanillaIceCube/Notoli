"""Compatibility imports preserve the existing Notoli endpoint names."""

from apps.mcp.framework.views import (
    MCPAuthorizationView as NotoliAuthorizationView,
)
from apps.mcp.framework.views import (
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
