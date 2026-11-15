import base64
import hashlib
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

CALLBACK = "https://client.example/connection/callback"


VERIFIER = "framework-code-verifier-with-at-least-forty-three-characters"


CHALLENGE = (
    base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest())
    .decode()
    .rstrip("=")
)


def make_application():
    from oauth2_provider.models import Application

    return Application.objects.create(
        name="Framework test client",
        client_id="framework-client",
        client_type="public",
        authorization_grant_type="authorization-code",
        redirect_uris=CALLBACK,
    )


def make_token(user, application, **updates):
    from oauth2_provider.models import AccessToken

    values = dict(
        user=user,
        application=application,
        token="framework-access",
        scope=" ".join(settings.MCP_REQUIRED_SCOPES),
        expires=timezone.now() + timedelta(hours=1),
        resource=[settings.MCP_RESOURCE_URL],
    )
    values.update(updates)
    return AccessToken.objects.create(**values)
