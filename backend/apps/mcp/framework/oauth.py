"""OAuth policy around the toolkit's code, PKCE, and token lifecycle."""

import hashlib
from urllib.parse import urlsplit

from django.conf import settings
from oauth2_provider.models import AccessToken
from oauth2_provider.oauth2_validators import OAuth2Validator
from oauthlib.oauth2.rfc6749.errors import CustomOAuth2Error

from .errors import ConnectionPermissionDenied


class MCPOAuthValidator(OAuth2Validator):
    @staticmethod
    def _callback_allowed(uri):
        # Toolkit's generic registration UI/command accepts more URI forms than
        # this app's public MCP clients. Apply policy even to a default callback.
        if not isinstance(uri, str):
            return False
        try:
            parsed = urlsplit(uri)
            return (
                parsed.scheme == "https"
                and bool(parsed.hostname)
                and "@" not in parsed.netloc
                and "#" not in uri
                and "*" not in uri
            )
        except ValueError:
            return False

    def validate_redirect_uri(self, client_id, redirect_uri, request, *args, **kwargs):
        return self._callback_allowed(redirect_uri) and super().validate_redirect_uri(
            client_id, redirect_uri, request, *args, **kwargs
        )

    def get_default_redirect_uri(self, client_id, request, *args, **kwargs):
        uri = super().get_default_redirect_uri(client_id, request, *args, **kwargs)
        return uri if self._callback_allowed(uri) else None

    def confirm_redirect_uri(
        self, client_id, code, redirect_uri, client, *args, **kwargs
    ):
        return self._callback_allowed(redirect_uri) and super().confirm_redirect_uri(
            client_id, code, redirect_uri, client, *args, **kwargs
        )

    def validate_grant_type(
        self, client_id, grant_type, client, request, *args, **kwargs
    ):
        return grant_type in {
            "authorization_code",
            "refresh_token",
        } and super().validate_grant_type(
            client_id, grant_type, client, request, *args, **kwargs
        )

    def _validate_resource_uris(self, request, resources):
        super()._validate_resource_uris(request, resources)
        if any(resource != settings.MCP_RESOURCE_URL for resource in resources):
            raise CustomOAuth2Error(
                error="invalid_target",
                description="This server only authorizes its configured MCP resource.",
                request=request,
            )

    def _check_and_set_request_resource(self, request):
        super()._check_and_set_request_resource(request)
        if request.resource != [settings.MCP_RESOURCE_URL]:
            raise CustomOAuth2Error(
                error="invalid_target",
                description="The configured MCP resource is required.",
                request=request,
            )


def resolve_token(raw_token, scope=None):
    """Revalidate tokens against the database; revocation takes effect immediately."""
    # An omitted or blank scope still requires the application's baseline scope.
    required_scope = scope or settings.MCP_REQUIRED_SCOPES[0]
    checksum = hashlib.sha256(raw_token.encode()).hexdigest()
    token = (
        AccessToken.objects.select_related("user", "application")
        .filter(token_checksum=checksum)
        .first()
    )
    if (
        token is None
        or not token.is_valid()
        or token.resource != [settings.MCP_RESOURCE_URL]
        or token.user is None
        or not token.user.is_active
        or token.application is None
        or token.application.authorization_grant_type != "authorization-code"
    ):
        raise ConnectionPermissionDenied(
            "Connection expired, revoked, or lacks the required permission."
        )
    if required_scope not in token.scope.split():
        raise ConnectionPermissionDenied(
            "Connection lacks the required permission.",
            "insufficient_scope",
            required_scopes=[required_scope],
        )
    return token
