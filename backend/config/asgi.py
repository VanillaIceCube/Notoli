"""Django ASGI plus opt-in MCP transport and lifecycle."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_application = get_asgi_application()

from apps.mcp.framework.asgi import create_application  # noqa: E402

application = create_application(django_application)
