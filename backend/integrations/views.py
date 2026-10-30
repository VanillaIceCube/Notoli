"""Compatibility imports preserve the existing Notoli endpoint names."""

from mcp_framework.views import (
    MCPAuthorizationView as NotoliAuthorizationView,
)
from mcp_framework.views import (
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
