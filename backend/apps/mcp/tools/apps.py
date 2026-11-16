"""Notoli app identity; shared configuration checks live in framework.apps."""

from django.apps import AppConfig


class NotoliMCPConfig(AppConfig):
    name = "apps.mcp.tools"
    # Preserve the existing Django identity and OAuth migration relationships.
    label = "integrations"
