from django.conf import settings
from django.urls import include, path


def urlpatterns():
    if not settings.MCP_ENABLED:
        return []
    from .views import authorization_metadata, resource_metadata

    return [
        path(".well-known/oauth-authorization-server", authorization_metadata),
        path(".well-known/oauth-protected-resource", resource_metadata),
        path(".well-known/oauth-protected-resource/mcp", resource_metadata),
        path("auth/mcp/", include("mcp_framework.urls")),
    ]
