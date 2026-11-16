import hashlib
import json
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import UUID

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.http import Http404, JsonResponse, QueryDict
from django.shortcuts import redirect
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.module_loading import import_string
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_GET
from oauth2_provider.models import AccessToken, Application, Grant, RefreshToken
from oauth2_provider.views import AuthorizationView
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

CONSENT_MAX_AGE = 600


def invalid_consent():
    return JsonResponse(
        {
            "error": "invalid_consent",
            "error_description": (
                "This connection request expired or is no longer valid. "
                "Reload this page to review the permissions again."
            ),
        },
        status=400,
    )


@method_decorator(never_cache, name="dispatch")
@method_decorator(sensitive_post_parameters(), name="dispatch")
# Authentication is exclusively an explicit JWT header, never an ambient
# session cookie. Cookie-authenticated requests cannot authorize or revoke.
@method_decorator(csrf_exempt, name="dispatch")
class MCPAuthorizationView(AuthorizationView):
    def render_to_response(self, context, **kwargs):
        if "error" in context:
            error = context["error"]
            return JsonResponse(
                {"error": error.error, "error_description": error.description},
                status=kwargs.get("status", 400),
            )
        form = context["form"]
        if form.is_bound:
            return JsonResponse({"error": "invalid_request"}, status=400)
        fields = {field.name: field.value() or "" for field in form if field.is_hidden}
        return JsonResponse(
            {
                "application": {
                    "name": context["application"].name,
                    "client_id": context["application"].client_id,
                },
                "user": {"username": self.request.user.get_username()},
                "permissions": [
                    {"scope": scope, "description": description}
                    for scope, description in zip(
                        context["scopes"], context["scopes_descriptions"], strict=True
                    )
                ],
                "ticket": signing.dumps(
                    {"user_id": self.request.user.pk, "fields": fields},
                    salt=settings.MCP_CONSENT_SALT,
                    compress=True,
                ),
            }
        )

    def handle_prompt_login(self):
        # OIDC is not enabled. Do not fall back to Toolkit's session login UI.
        return JsonResponse(
            {
                "error": "invalid_request",
                "error_description": "prompt=login is not supported.",
            },
            status=400,
        )

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
        response = super().redirect(destination, application)
        return JsonResponse({"redirect_url": response.url})

    def dispatch(self, request, *args, **kwargs):
        if request.method == "GET" and "application/json" not in request.headers.get(
            "Accept", ""
        ):
            query = request.META.get("QUERY_STRING", "")
            return redirect(
                f"{settings.FRONTEND_BASE_URL}/connections/authorize?{query}"
            )
        if request.method not in {"GET", "POST"}:
            return JsonResponse({"error": "invalid_request"}, status=405)
        try:
            authenticated = JWTAuthentication().authenticate(request)
        except AuthenticationFailed:
            authenticated = None
        if authenticated is None:
            return JsonResponse(
                {"error": "login_required"},
                status=401,
                headers={"WWW-Authenticate": 'Bearer realm="api"'},
            )
        request.user, request.auth = authenticated
        if request.method == "POST":
            try:
                consent = signing.loads(
                    request.POST.get("ticket", ""),
                    salt=settings.MCP_CONSENT_SALT,
                    max_age=CONSENT_MAX_AGE,
                )
            except signing.BadSignature:
                return invalid_consent()
            decision = request.POST.get("decision")
            if consent["user_id"] != request.user.pk or decision not in {
                "allow",
                "cancel",
            }:
                return invalid_consent()
            fields = QueryDict(mutable=True)
            fields.update(consent["fields"])
            if decision == "allow":
                fields["allow"] = "Authorize"
            request._post = fields
        else:
            # Always show the requested permissions, even for previous grants.
            request.GET = request.GET.copy()
            request.GET["approval_prompt"] = "force"
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
        if (
            request.method == "POST"
            and not Application.objects.filter(client_id=data.get("client_id")).exists()
        ):
            return JsonResponse({"error": "invalid_client"}, status=400)
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
            "resource_name": settings.MCP_NAME,
        }
    )


@never_cache
@api_view(["GET", "POST"])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def connections(request):
    if request.method == "POST":
        try:
            application_id = int(request.data.get("application_id", ""))
        except (ValueError, TypeError):
            return JsonResponse({"error": "Invalid application."}, status=400)
        # Owner identity comes from the verified JWT, never a posted user ID.
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
        return JsonResponse({"revoked": True})
    apps = Application.objects.filter(
        Q(accesstoken__user=request.user)
        | Q(refreshtoken__user=request.user, refreshtoken__revoked__isnull=True)
        # Consent creates a grant before any token exists. Keep pending apps
        # visible so the same account can revoke the code before exchange.
        | Q(grant__user=request.user, grant__expires__gt=timezone.now())
    ).distinct()
    return JsonResponse(
        {
            "applications": list(
                apps.order_by("name", "pk").values("id", "name", "client_id")
            )
        }
    )


@never_cache
@api_view(["GET", "POST"])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def action_approval(request):
    """Optional app-owned actions; MCP OAuth bearers cannot approve them."""
    handler_path = getattr(settings, "MCP_ACTION_APPROVAL_HANDLER", None)
    if not handler_path:
        raise Http404
    handler = import_string(handler_path)
    salt = settings.MCP_CONSENT_SALT + ".action-approval"
    decision = None
    ticket = None
    if request.method == "POST":
        try:
            value = request.data.get("ticket")
            if not isinstance(value, str) or len(value) > 4096:
                raise signing.BadSignature
            ticket = signing.loads(value, salt=salt, max_age=300)
            if ticket["user_id"] != request.user.pk:
                raise signing.BadSignature
            reference = ticket["reference"]
            decision = request.data.get("decision")
            if decision not in {"allow", "cancel"}:
                raise signing.BadSignature
        except (signing.BadSignature, KeyError, TypeError):
            return invalid_consent()
    else:
        reference = request.query_params.get("approval_id")
    try:
        reference = str(UUID(reference))
    except (ValueError, TypeError, AttributeError):
        return JsonResponse({"error": "Invalid action reference."}, status=400)

    # The handler locks its action/actor while returning the exact preview.
    # Hold those locks through ticket comparison and the explicit decision.
    with transaction.atomic():
        details = handler(request.user, reference)
        digest = hashlib.sha256(
            json.dumps(details, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        if ticket is not None:
            if ticket.get("digest") != digest:
                return JsonResponse(
                    {"error": "Action changed or expired. Reload to review it again."},
                    status=409,
                )
            details = handler(request.user, reference, decision)
            # A decision changes the preview (including status). Sign that new
            # state so an approved action can be cancelled without reloading.
            digest = hashlib.sha256(
                json.dumps(details, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
        response = {"approval": details}
        if details["status"] in {"prepared", "approved"}:
            response["ticket"] = signing.dumps(
                {"user_id": request.user.pk, "reference": reference, "digest": digest},
                salt=salt,
                compress=True,
            )
    return JsonResponse(response)
