"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/howto/deployment/asgi/
"""

import os
from contextlib import asynccontextmanager

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.settings")

django_application = get_asgi_application()

# Django must initialize before importing the MCP tools and their models.
from starlette.applications import Starlette  # noqa: E402
from starlette.routing import Mount, Route  # noqa: E402

from integrations.server import mcp_application, server  # noqa: E402


@asynccontextmanager
async def lifespan(app):
    async with server.session_manager.run():
        yield


# Route preserves /mcp in the child scope. Mounting at /mcp would strip it or
# redirect POST requests to a trailing slash and break resource URL matching.
application = Starlette(
    routes=[
        Route("/mcp", endpoint=mcp_application),
        Mount("/", app=django_application),
    ],
    lifespan=lifespan,
)
