"""OAuth defaults shared by all applications."""


def oauth_settings(
    base_url,
    scopes,
    required_scopes,
    validator="apps.mcp.framework.oauth.MCPOAuthValidator",
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
        "ALLOW_URI_WILDCARDS": False,
        "REQUEST_APPROVAL_PROMPT": "force",
        "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,
        "AUTHORIZATION_CODE_EXPIRE_SECONDS": 120,
        "REFRESH_TOKEN_EXPIRE_SECONDS": 30 * 24 * 3600,
        "ROTATE_REFRESH_TOKEN": True,
        "REFRESH_TOKEN_REUSE_PROTECTION": True,
        "REFRESH_TOKEN_GRACE_PERIOD_SECONDS": 0,
        "REQUIRE_FORM_ENCODED_REQUEST_BODY": True,
    }
