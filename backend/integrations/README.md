# 🔌 Notoli MCP integration

This Django app owns Notoli's authenticated MCP tools, OAuth permissions, and
account-bound consent. The [shared framework](../app_mcp/README.md)
supplies transport and common OAuth plumbing.

## 🧭 Structure

- `server.py`, `tools.py`, `schemas.py`: registered tools and typed contracts.
- `oauth.py`, `views.py`, `urls.py`: application OAuth and consent policy.
- `adapters.py`: integration with application services.
- `coverage.py`, `tests.py`, `test_coverage.py`: tool and permission coverage.
- `management/commands/register_mcp_client.py`: public-client registration.

## 🔐 Accounts and permissions

MCP uses existing Notoli accounts with separate OAuth tokens. Each operation
checks its scope and current object ownership or collaboration. Read,
write, share, organize, notification, and deletion scopes remain distinct.
Deletion requires explicit confirmation; caller-supplied user IDs cannot
establish authorization.

<a id="-guides"></a>

## 📚 Reference

- [Backend API and authentication reference](../README.md).
- [Shared framework configuration and verification](../app_mcp/README.md).
- [Plugin connection, tool catalog, branding, and evaluation prompts](../../backend/app_mcp/chatgpt/README.md).
- [Deployment and client registration](../../deploy/production/README.md#-chatgpt-mcp-deployment).

The backend runs under Uvicorn ASGI. Follow the deployment guide for exact
proxy trust, migration, and readiness requirements. Updating Docker services
does not update or publish a ChatGPT plugin listing.
