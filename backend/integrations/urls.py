from django.urls import path
from oauth2_provider.views import RevokeTokenView, TokenView

from . import views

urlpatterns = [
    path("authorize/", views.authorize, name="mcp-authorize"),
    path("token/", views.legacy_endpoint(TokenView.as_view()), name="mcp-token"),
    path(
        "revoke/", views.legacy_endpoint(RevokeTokenView.as_view()), name="mcp-revoke"
    ),
    path("connections/", views.connections, name="mcp-connections"),
]
