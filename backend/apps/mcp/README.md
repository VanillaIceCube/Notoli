# 🔌 Application MCP

- [framework/](framework/README.md): canonical OAuth, transport and ASGI lifecycle.
- [tools/](tools/README.md): application-owned registry, permissions and domain behavior.
- [chatgpt/](chatgpt/README.md): application branding and offline plugin packaging.

The public registry factory is `apps.mcp.tools.server.create_server`. Shared
framework files and immutable pins stay identical across consumers; tools and
branding retain each application's policy. The installed `mcp` SDK is a separate
third-party package. Django app labels remain unchanged when modules move.
