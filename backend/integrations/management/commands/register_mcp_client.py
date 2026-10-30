from django.conf import settings
from django.core.management.base import CommandError

from mcp_framework.management.commands.register_mcp_client import (
    Command as LegacyCommand,
)


class Command(LegacyCommand):
    def handle(self, *args, **options):
        if settings.MCP_AUTH_MODE == "central":
            raise CommandError(
                "Register MCP clients at the authorization service in central mode"
            )
        return super().handle(*args, **options)


__all__ = ["Command"]
