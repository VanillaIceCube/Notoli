"""Notoli scopes and live connection checks over the shared OAuth lifecycle."""

from apps.mcp.framework.errors import ConnectionPermissionDenied
from apps.mcp.framework.oauth import resolve_token


def required_scopes(operation):
    scopes = ["notoli:read"]
    if operation in {"add_item", "update_item", "add_board_item", "update_board_item"}:
        scopes.append("notoli:write")
    if operation in {
        "create_board",
        "update_board",
        "create_list",
        "update_list",
        "reorder_lists",
        "reorder_items",
        "attach_item",
        "set_list_items",
    }:
        scopes.append("notoli:organize")
    if operation in {
        "list_notifications",
        "get_notification",
        "update_notification",
        "mark_all_notifications_read",
        "delete_notification",
        "clear_notifications",
    }:
        scopes.append("notoli:notifications")
    if operation in {
        "delete_board",
        "delete_list",
        "delete_item",
        "delete_notification",
        "clear_notifications",
    }:
        scopes.append("notoli:delete")
    if operation in {"add_board_collaborator", "remove_board_collaborator"}:
        scopes.append("notoli:share")
    return scopes


def principal(raw_token, operation):
    scopes = required_scopes(operation)
    try:
        if not isinstance(raw_token, str) or not raw_token or len(raw_token) > 4096:
            raise ConnectionPermissionDenied("Connect your Notoli account.")
        token = resolve_token(raw_token)
        if not set(scopes) <= set(token.scope.split()):
            raise ConnectionPermissionDenied(
                "This connection lacks required permissions.", "insufficient_scope"
            )
        return token
    except ConnectionPermissionDenied as error:
        error.required_scopes = scopes
        raise
