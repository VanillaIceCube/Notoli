from contextlib import asynccontextmanager

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils.module_loading import import_string


def create_application(django_application, server=None, transport=None):
    if not settings.MCP_ENABLED:
        return django_application
    from starlette.applications import Starlette
    from starlette.middleware import Middleware
    from starlette.routing import Mount, Route

    from .proxy import TrustedProxyHeadersMiddleware
    from .server import http_application

    if server is None:
        factory = settings.MCP_SERVER_FACTORY
        if not factory:
            raise ImproperlyConfigured(
                "Enabled MCP requires an explicit tool registry factory."
            )
        server = import_string(factory)()
    mcp_application = transport if transport is not None else http_application(server)

    @asynccontextmanager
    async def lifespan(app):
        async with server.session_manager.run():
            yield

    # Route preserves the exact resource path; Mount('/mcp') would strip it/redirect POSTs.
    return Starlette(
        routes=[
            Route("/mcp", endpoint=mcp_application),
            Mount("/", app=django_application),
        ],
        lifespan=lifespan,
        middleware=[
            Middleware(
                TrustedProxyHeadersMiddleware, trusted_ips=settings.TRUSTED_PROXY_IPS
            )
        ],
    )
