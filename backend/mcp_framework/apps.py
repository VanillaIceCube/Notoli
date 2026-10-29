from urllib.parse import urlsplit

from django.apps import AppConfig
from django.conf import settings
from django.core.checks import Error, Tags, register


@register()
def mcp_settings_check(app_configs, **kwargs):
    if not settings.MCP_ENABLED:
        return []
    url = urlsplit(settings.MCP_BASE_URL)
    errors = []
    if (
        not url.hostname
        or url.username
        or url.password
        or url.path
        or url.query
        or url.fragment
        or url.scheme not in {"http", "https"}
    ):
        errors.append(
            Error("DJANGO_MCP_BASE_URL must be an origin URL.", id="mcp_framework.E001")
        )
    if not settings.MCP_REQUIRED_SCOPES or not set(
        settings.MCP_REQUIRED_SCOPES
    ).issubset(settings.OAUTH2_PROVIDER["SCOPES"]):
        errors.append(
            Error(
                "MCP required scopes must be explicitly declared.",
                id="mcp_framework.E003",
            )
        )
    if not getattr(settings, "MCP_SERVER_FACTORY", None):
        errors.append(
            Error(
                "Enabled MCP requires an explicit tool registry factory.",
                id="mcp_framework.E004",
            )
        )
    return errors


@register(Tags.security, deploy=True)
def mcp_https_check(app_configs, **kwargs):
    if (
        settings.MCP_ENABLED
        and not settings.DEBUG
        and urlsplit(settings.MCP_BASE_URL).scheme != "https"
    ):
        return [
            Error(
                "DJANGO_MCP_BASE_URL must use HTTPS in production.",
                id="mcp_framework.E002",
            )
        ]
    return []


class MCPFrameworkConfig(AppConfig):
    name = "mcp_framework"
