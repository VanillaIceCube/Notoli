"""Explicit per-application policy; no application models or domains live here."""

import os


def oauth_settings(
    base_url, scopes, required_scopes, validator="mcp_framework.oauth.MCPOAuthValidator"
):
    return {
        "OAUTH2_VALIDATOR_CLASS": validator,
        "SCOPES": scopes,
        "DEFAULT_SCOPES": required_scopes,
        "PKCE_REQUIRED": True,
        "COMPLIANT_BCP_RFC9700_PKCE_METHOD": True,
        "COMPLIANT_BCP_RFC9700_IMPLICIT_GRANT": True,
        "COMPLIANT_BCP_RFC9700_PASSWORD_GRANT": True,
        "COMPLIANT_BCP_RFC9700_ACCESS_TOKEN_TRANSPORT": True,
        "COMPLIANT_BCP_RFC9700_TOKEN_STORAGE": True,
        "COMPLIANT_BCP_RFC9700_AUTHZ_RESPONSE_ISS": True,
        "OIDC_ISS_ENDPOINT": base_url,
        "OAUTH2_RESPONSE_TYPES_SUPPORTED": ["code"],
        "OAUTH2_GRANT_TYPES_SUPPORTED": ["authorization_code", "refresh_token"],
        "OAUTH2_TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED": ["none"],
        "ALLOWED_REDIRECT_URI_SCHEMES": ["https"],
        "REQUEST_APPROVAL_PROMPT": "force",
        "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,
        "AUTHORIZATION_CODE_EXPIRE_SECONDS": 120,
        "REFRESH_TOKEN_EXPIRE_SECONDS": 30 * 24 * 3600,
        "ROTATE_REFRESH_TOKEN": True,
        "REFRESH_TOKEN_REUSE_PROTECTION": True,
        "REFRESH_TOKEN_GRACE_PERIOD_SECONDS": 0,
        "REQUIRE_FORM_ENCODED_REQUEST_BODY": True,
    }


def optional_settings(name, namespace, *, sample=False):
    enabled = os.getenv("DJANGO_MCP_ENABLED", "0") == "1"
    base = os.getenv("DJANGO_MCP_BASE_URL", "http://localhost:8000").rstrip("/")
    scope = f"{namespace}:connect"
    return {
        "MCP_ENABLED": enabled,
        "MCP_NAME": name,
        "MCP_BASE_URL": base,
        "MCP_RESOURCE_URL": f"{base}/mcp",
        "MCP_REQUIRED_SCOPES": [scope],
        "MCP_CONSENT_SALT": f"{namespace}.mcp.consent",
        "MCP_CLIENT_ID": f"{namespace}-chatgpt",
        "MCP_SERVER_FACTORY": os.getenv("DJANGO_MCP_SERVER_FACTORY")
        or ("mcp_framework.server.sample_server" if sample else None),
        "TRUSTED_PROXY_IPS": [
            v.strip()
            for v in os.getenv("DJANGO_TRUSTED_PROXY_IPS", "").split(",")
            if v.strip()
        ],
        "OAUTH2_PROVIDER": oauth_settings(
            base, {scope: "Check this connection; no application data access"}, [scope]
        ),
    }
