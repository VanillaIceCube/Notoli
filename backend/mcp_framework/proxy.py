from ipaddress import ip_address

from django.core.exceptions import ImproperlyConfigured
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware


class TrustedProxyHeadersMiddleware:
    """Accept proxy metadata only from explicitly configured individual IPs."""

    def __init__(self, app, trusted_ips):
        try:
            self.trusted_ips = {str(ip_address(value)) for value in trusted_ips}
        except ValueError as error:
            raise ImproperlyConfigured(
                "DJANGO_TRUSTED_PROXY_IPS must contain individual IP addresses."
            ) from error
        self.app = ProxyHeadersMiddleware(app, trusted_hosts=list(self.trusted_ips))

    async def __call__(self, scope, receive, send):
        if scope["type"] in {"http", "websocket"}:
            scope = dict(scope)
            peer = scope.get("client")
            trusted = peer is not None and peer[0] in self.trusted_ips
            scope["headers"] = [
                (name, value)
                for name, value in scope.get("headers", [])
                if name.lower() != b"forwarded"
                and (
                    not name.lower().startswith(b"x-forwarded-")
                    or (
                        trusted
                        and name.lower() in {b"x-forwarded-proto", b"x-forwarded-for"}
                    )
                )
            ]
        await self.app(scope, receive, send)
