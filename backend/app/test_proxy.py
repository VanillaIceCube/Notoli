from pathlib import Path

import yaml
from asgiref.sync import async_to_sync
from django.core.exceptions import ImproperlyConfigured
from django.core.handlers.asgi import ASGIRequest
from django.test import SimpleTestCase, override_settings

from .proxy import TrustedProxyHeadersMiddleware


class ProxyTrustTests(SimpleTestCase):
    @override_settings(ALLOWED_HOSTS=["notoli.example"])
    def inspect_request(self, peer, trusted_ips):
        import io

        captured = {}

        async def app(scope, receive, send):
            request = ASGIRequest(scope, io.BytesIO())
            captured.update(
                scheme=request.scheme,
                host=request.get_host(),
                client=request.META.get("REMOTE_ADDR"),
                headers=dict(scope["headers"]),
            )

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/auth/mcp/authorize/",
            "query_string": b"",
            "scheme": "http",
            "server": ("backend", 8000),
            "client": peer,
            "headers": [
                (b"host", b"notoli.example"),
                (b"x-forwarded-host", b"attacker.example"),
                (b"x-forwarded-proto", b"https"),
                (b"x-forwarded-for", b"198.51.100.23"),
                (b"forwarded", b"host=attacker.example;proto=https"),
            ],
        }
        async_to_sync(TrustedProxyHeadersMiddleware(app, trusted_ips))(
            scope, None, None
        )
        return captured

    def test_untrusted_peer_cannot_forge_django_scheme_host_or_client(self):
        for peer, trusted in (
            (("172.30.88.3", 1234), ["172.30.88.2"]),
            (("127.0.0.1", 1234), []),
            (None, ["172.30.88.2"]),
        ):
            request = self.inspect_request(peer, trusted)
            self.assertEqual(request["scheme"], "http")
            self.assertEqual(request["host"], "notoli.example")
            self.assertEqual(request["client"], peer[0] if peer else None)
            self.assertEqual(request["headers"], {b"host": b"notoli.example"})

    def test_exact_trusted_proxy_sets_scheme_and_client_but_not_host(self):
        request = self.inspect_request(("172.30.88.2", 1234), ["172.30.88.2"])
        self.assertEqual(request["scheme"], "https")
        self.assertEqual(request["host"], "notoli.example")
        self.assertEqual(request["client"], "198.51.100.23")
        self.assertNotIn(b"x-forwarded-host", request["headers"])
        self.assertNotIn(b"forwarded", request["headers"])

    def test_wildcards_subnets_and_hostnames_are_rejected(self):
        for value in ("*", "172.30.88.0/29", "proxy", "invalid"):
            with self.assertRaises(ImproperlyConfigured):
                TrustedProxyHeadersMiddleware(None, [value])

    def test_compose_and_nginx_enforce_the_proxy_boundary(self):
        root = Path(__file__).resolve().parents[2]
        compose = yaml.safe_load((root / "deploy/docker-compose.yml").read_text())
        backend = compose["services"]["backend"]
        proxy = compose["services"]["proxy"]
        frontend = compose["services"]["frontend"]
        self.assertNotIn("ports", backend)
        self.assertEqual(
            set(backend["networks"]), {"backend_private", "backend_egress"}
        )
        self.assertNotIn("backend_private", frontend.get("networks", ["default"]))
        self.assertEqual(
            backend["environment"]["DJANGO_TRUSTED_PROXY_IPS"],
            proxy["networks"]["backend_private"]["ipv4_address"],
        )
        self.assertTrue(compose["networks"]["backend_private"]["internal"])
        nginx = (root / "deploy/nginx-proxy.conf").read_text()
        self.assertNotIn("$http_x_forwarded_proto", nginx)
        self.assertNotIn("$proxy_add_x_forwarded_for", nginx)
        self.assertIn("proxy_set_header X-Forwarded-Proto $scheme;", nginx)
        self.assertIn("proxy_set_header X-Forwarded-For $remote_addr;", nginx)
        for filename in ("Dockerfile", "Dockerfile.dev"):
            dockerfile = (root / "backend" / filename).read_text()
            self.assertIn('"--no-proxy-headers"', dockerfile)
            self.assertNotIn('"--forwarded-allow-ips"', dockerfile)
