from urllib.parse import urlsplit

from django.apps import AppConfig
from django.conf import settings
from django.core.checks import Error, Tags, register


@register()
def mcp_settings_check(app_configs, **kwargs):
    url = urlsplit(settings.MCP_BASE_URL)
    if (
        not url.hostname
        or url.username
        or url.password
        or url.path
        or url.query
        or url.fragment
        or url.scheme not in {"http", "https"}
    ):
        return [
            Error("DJANGO_MCP_BASE_URL must be an origin URL.", id="integrations.E001")
        ]
    return []


@register(Tags.security, deploy=True)
def mcp_https_check(app_configs, **kwargs):
    if not settings.DEBUG and urlsplit(settings.MCP_BASE_URL).scheme != "https":
        return [
            Error(
                "DJANGO_MCP_BASE_URL must use HTTPS in production.",
                id="integrations.E002",
            )
        ]
    return []


class IntegrationsConfig(AppConfig):
    name = "integrations"
