"""Notoli uses its existing domain tool registry through the shared ASGI lifecycle."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.settings")
django_application = get_asgi_application()

from integrations.server import mcp_application, server  # noqa: E402
from mcp_framework.asgi import create_application  # noqa: E402

application = create_application(django_application, server, transport=mcp_application)
