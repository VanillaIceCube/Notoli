from django.urls import path
from oauth2_provider.views import RevokeTokenView, TokenView

from . import views

urlpatterns = [
    path("login/", views.ConnectionLoginView.as_view(), name="mcp-login"),
    path("logout/", views.ConnectionLogoutView.as_view(), name="mcp-logout"),
    path("authorize/", views.NotoliAuthorizationView.as_view(), name="mcp-authorize"),
    path("token/", TokenView.as_view(), name="mcp-token"),
    path("revoke/", RevokeTokenView.as_view(), name="mcp-revoke"),
    path("connections/", views.connections, name="mcp-connections"),
]
