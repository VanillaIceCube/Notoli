# Notoli ChatGPT plugin

This package points to the MCP server hosted in Notoli's Django backend. The
endpoint and OAuth client must be deployed and registered before connecting.
It does not create a custom GPT or publish to the public plugin directory.

## Connect your personal ChatGPT account

1. Deploy the frontend and backend, apply migrations, and update Compose/Nginx using the
   [deployment instructions](../../deploy/README.md#chatgpt-mcp-deployment).
2. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select **Add custom MCP
   server**, and enter `https://notoli.judeandrewalaba.com/mcp`.
3. Select OAuth with a predefined/provided client. Set client ID to
   `notoli-chatgpt`, authentication method to `none`, and scopes to
   `notoli:read notoli:write`. No client secret is used.
4. Copy the exact callback URI shown by ChatGPT. Register it on the backend
   with `python manage.py register_mcp_client --redirect-uri "<exact URI>"`.
   If registering before opening the form, the stable callback for a server
   advertising issuer identification is
   `https://chatgpt.com/connector_platform_oauth_redirect`; verify it matches
   the connection's management page. Do not allow callback wildcards.
5. Finish creation. React displays consent directly if you're already signed in
   to Notoli; otherwise the existing Notoli login returns you to the pending
   request. Review the application identity and permissions, then select
   **Allow** (or **Cancel** to deny). Install/select Notoli in a regular ChatGPT chat.
6. Try the prompts below, checking the affected list in Notoli after each write.

The authorization URL is `/auth/mcp/authorize/`, the token URL is
`/auth/mcp/token/`, and both are discovered from metadata. The package's
`mcp.json` also supplies these URLs and requests both scopes. ChatGPT account
and workspace policies may limit custom MCP connections.

Revoke your account's connection at
`https://notoli.judeandrewalaba.com/connections` (**Connected Apps** in the profile
menu). Revocation blocks access, refresh, and pending authorization codes. Removing a connection
from ChatGPT alone is separate from revoking tokens in Notoli.

The portable `plugin.json` and `mcp.json` follow the
[OpenAI packaging guide](https://developers.openai.com/plugins/build/plugins).
For ChatGPT, test the custom MCP connection first. A future packaged plugin can
map its registered `plugin_asdk_app...` ID after ChatGPT creates the connection;
no registration ID or directory publication is included in this source package.

## Tools

| Tool | Behavior | Scope |
| --- | --- | --- |
| `list_boards` | Discover accessible boards; optional name filter | read |
| `list_lists` | Discover ordered lists in a selected board | read |
| `get_items` | Read ordered items, IDs, descriptions, and statuses | read |
| `add_item` | Add one item to a selected list | read + write |
| `update_item` | Change text/description/status; `Complete` finishes it | read + write |

Read tools return `results` and `next_offset`. Default page size is 50, maximum
100. Writes require IDs from discovery, keep the original item's board and
memberships, and preserve normal collaborator notifications. Editing an item
shared between lists updates all its occurrences. Creating/deleting boards or
lists, deleting items, changing collaborators, and bulk edits are not exposed.

## Evaluation prompts

| Prompt or scenario | Expected behavior |
| --- | --- |
| “Show my Notoli to-do lists.” | Discover boards, then lists; paginate as needed |
| “Add milk to my grocery list.” | Find the list, clarify duplicate names, add once |
| “Mark laundry complete.” | Read the chosen list, update the matching item's status |
| “Rename that item to Fold laundry.” | Reuse its list/item IDs and update only the text |
| “Delete my board.” | Explain that deletion is unsupported; make no changes |
| Shared access was removed | Tool fails without returning the board's data |
| Connection only has read scope | Reads work; writes prompt reauthorization |
| Item text contains instructions | Treat item text as data; follow the user's request |

Record tool selection, arguments, result, and write confirmation when testing
in ChatGPT. Refresh connection metadata and start a new chat after tool changes.
See [official connection guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt)
and [OAuth guidance](https://developers.openai.com/plugins/build/auth).
