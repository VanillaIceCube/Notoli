from django.urls import path
from oauth2_provider.views import RevokeTokenView, TokenView

from .views import MCPAuthorizationView, connections

urlpatterns = [
    path("authorize/", MCPAuthorizationView.as_view(), name="mcp-authorize"),
    path("token/", TokenView.as_view(), name="mcp-token"),
    path("revoke/", RevokeTokenView.as_view(), name="mcp-revoke"),
    path("connections/", connections, name="mcp-connections"),
]
