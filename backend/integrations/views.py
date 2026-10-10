from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.views import LoginView, LogoutView
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_GET, require_http_methods
from oauth2_provider.models import AccessToken, Application, Grant, RefreshToken
from oauth2_provider.views import AuthorizationView


class EmailAuthenticationForm(AuthenticationForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].label = "Email or username"

    def clean(self):
        identifier = self.cleaned_data.get("username", "")
        user = get_user_model().objects.filter(email__iexact=identifier).first()
        if user:
            self.cleaned_data["username"] = user.get_username()
        return super().clean()


@method_decorator(never_cache, name="dispatch")
class ConnectionLoginView(LoginView):
    template_name = "integrations/login.html"
    authentication_form = EmailAuthenticationForm


class ConnectionLogoutView(LogoutView):
    next_page = "/auth/mcp/login/"


@method_decorator(never_cache, name="dispatch")
@method_decorator(sensitive_post_parameters(), name="dispatch")
class NotoliAuthorizationView(AuthorizationView):
    template_name = "integrations/authorize.html"

    def redirect(self, redirect_to, application):
        # Toolkit adds issuer identification to successful responses, but its
        # error/consent-denial path uses this separate redirect helper.
        parts = urlsplit(redirect_to)
        query = [
            (key, value)
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
            if key != "iss"
        ]
        query.append(("iss", settings.MCP_BASE_URL))
        destination = urlunsplit(parts._replace(query=urlencode(query)))
        return super().redirect(destination, application)

    def dispatch(self, request, *args, **kwargs):
        data = request.POST if request.method == "POST" else request.GET
        if (
            data.getlist("resource") != [settings.MCP_RESOURCE_URL]
            or data.get("code_challenge_method") != "S256"
            or not data.get("state")
        ):
            return JsonResponse(
                {
                    "error": "invalid_request",
                    "error_description": "Resource, state, and S256 PKCE are required.",
                    "iss": settings.MCP_BASE_URL,
                },
                status=400,
            )
        return super().dispatch(request, *args, **kwargs)


@require_GET
def authorization_metadata(request):
    base = settings.MCP_BASE_URL
    return JsonResponse(
        {
            "issuer": base,
            "authorization_endpoint": f"{base}/auth/mcp/authorize/",
            "token_endpoint": f"{base}/auth/mcp/token/",
            "revocation_endpoint": f"{base}/auth/mcp/revoke/",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "token_endpoint_auth_methods_supported": ["none"],
            "code_challenge_methods_supported": ["S256"],
            "authorization_response_iss_parameter_supported": True,
            "scopes_supported": list(settings.OAUTH2_PROVIDER["SCOPES"]),
        }
    )


@require_GET
def resource_metadata(request):
    return JsonResponse(
        {
            "resource": settings.MCP_RESOURCE_URL,
            "authorization_servers": [settings.MCP_BASE_URL],
            "scopes_supported": list(settings.OAUTH2_PROVIDER["SCOPES"]),
            "bearer_methods_supported": ["header"],
            "resource_name": "Notoli",
        }
    )


@never_cache
@login_required
@require_http_methods(["GET", "POST"])
def connections(request):
    if request.method == "POST":
        try:
            application_id = int(request.POST.get("application_id", ""))
        except ValueError:
            return JsonResponse({"error": "Invalid application."}, status=400)
        # Owner identity comes from the session, never from a posted user ID.
        with transaction.atomic():
            for token in RefreshToken.objects.filter(
                user=request.user, application_id=application_id, revoked__isnull=True
            ):
                token.revoke()
            AccessToken.objects.filter(
                user=request.user, application_id=application_id
            ).delete()
            Grant.objects.filter(
                user=request.user, application_id=application_id
            ).delete()
        return redirect("mcp-connections")
    apps = Application.objects.filter(
        Q(accesstoken__user=request.user)
        | Q(refreshtoken__user=request.user, refreshtoken__revoked__isnull=True)
    ).distinct()
    return render(request, "integrations/connections.html", {"applications": apps})
