"""Notoli tool permissions layered over the shared OAuth lifecycle."""


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
