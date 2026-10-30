"""App-owned issuer selection; ordinary website/REST authentication is unchanged."""

from functools import wraps

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from mcp_framework import views as legacy

from .central_oauth import ISSUER, MANAGEMENT_URL, RESOURCE

NotoliAuthorizationView = legacy.MCPAuthorizationView


def issuer_moved():
    return JsonResponse(
        {
            "error": "issuer_moved",
            "error_description": "Reconnect using the MCP authorization service.",
            "authorization_server": ISSUER,
        },
        status=410,
    )


def legacy_endpoint(view):
    @csrf_exempt
    @never_cache
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if settings.MCP_AUTH_MODE == "central":
            return issuer_moved()
        return view(request, *args, **kwargs)

    return wrapped


authorize = legacy_endpoint(NotoliAuthorizationView.as_view())


@require_GET
@never_cache
def authorization_metadata(request):
    if settings.MCP_AUTH_MODE == "central":
        return issuer_moved()
    return legacy.authorization_metadata(request)


@require_GET
@never_cache
def resource_metadata(request):
    if settings.MCP_AUTH_MODE == "central":
        return JsonResponse(
            {
                "resource": RESOURCE,
                "authorization_servers": [ISSUER],
                "scopes_supported": list(settings.OAUTH2_PROVIDER["SCOPES"]),
                "bearer_methods_supported": ["header"],
                "resource_name": settings.MCP_NAME,
            }
        )
    return legacy.resource_metadata(request)


@never_cache
@api_view(["GET", "POST"])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def central_connections(request):
    if request.method == "POST":
        return JsonResponse(
            {"error": "manage_at_authorization_server", "manage_url": MANAGEMENT_URL},
            status=409,
        )
    return JsonResponse(
        {
            "applications": [],
            "authorization_server": {"issuer": ISSUER, "manage_url": MANAGEMENT_URL},
        }
    )


@csrf_exempt
def connections(request, *args, **kwargs):
    view = (
        central_connections
        if settings.MCP_AUTH_MODE == "central"
        else legacy.connections
    )
    return view(request, *args, **kwargs)
