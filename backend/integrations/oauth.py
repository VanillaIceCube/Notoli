"""OAuth policy around the toolkit's code, PKCE, and token lifecycle."""

import hashlib

from django.conf import settings
from django.core.exceptions import PermissionDenied
from oauth2_provider.models import AccessToken
from oauth2_provider.oauth2_validators import OAuth2Validator
from oauthlib.oauth2.rfc6749.errors import CustomOAuth2Error


class ConnectionPermissionDenied(PermissionDenied):
    def __init__(self, message, oauth_error="invalid_token"):
        super().__init__(message)
        self.oauth_error = oauth_error


def required_scopes(operation):
    scopes = ["notoli:read"]
    if operation in {"add_item", "update_item"}:
        scopes.append("notoli:write")
    if operation in {"add_board_collaborator", "remove_board_collaborator"}:
        scopes.append("notoli:share")
    return scopes


class NotoliOAuthValidator(OAuth2Validator):
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
                description="This server only authorizes the Notoli MCP resource.",
                request=request,
            )

    def _check_and_set_request_resource(self, request):
        super()._check_and_set_request_resource(request)
        if request.resource != [settings.MCP_RESOURCE_URL]:
            raise CustomOAuth2Error(
                error="invalid_target",
                description="The Notoli MCP resource is required.",
                request=request,
            )


def resolve_token(raw_token, scope="notoli:read"):
    """Revalidate tokens against the database; revocation takes effect immediately."""
    checksum = hashlib.sha256(raw_token.encode()).hexdigest()
    token = (
        AccessToken.objects.select_related("user", "application")
        .filter(token_checksum=checksum)
        .first()
    )
    if (
        token is None
        or not token.is_valid([scope])
        or token.resource != [settings.MCP_RESOURCE_URL]
        or token.user is None
        or not token.user.is_active
        or token.application is None
        or token.application.authorization_grant_type != "authorization-code"
    ):
        raise ConnectionPermissionDenied(
            "Notoli connection expired, revoked, or lacks the required permission."
        )
    return token
