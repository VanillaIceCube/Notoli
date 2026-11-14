# 🔌 Notoli plugins

This folder is the entry point for client-facing plugin documentation and
packages. Application tools, OAuth, and permissions live in the backend.

## 🧭 Current integration

Notoli has both a backend MCP integration and a checked-in ChatGPT plugin
package with listing metadata, artwork, and a packaging helper.

- [Backend MCP integration](../backend/README.md#-mcp-integration).
- [Shared MCP framework](../backend/mcp_framework/README.md).
- [Notoli package and connection guide](notoli/README.md).

## 📦 Package layout

Application-specific packages use `plugins/<application-slug>/`. That folder
owns the client manifest, listing metadata, artwork, packaging helpers, and
connection instructions when a package is maintained. Backend deployment and
client listing updates are separate operations.
