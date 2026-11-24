"""Notoli scopes and live connection checks over the shared OAuth lifecycle."""

from apps.mcp.framework.errors import ConnectionPermissionDenied
from apps.mcp.framework.oauth import resolve_token


def required_scopes(operation):
    scopes = ["notoli:read"]
    if operation in {"add_task", "update_task", "add_board_task", "update_board_task"}:
        scopes.append("notoli:write")
    if operation in {
        "create_board",
        "update_board",
        "create_list",
        "update_list",
        "reorder_lists",
        "reorder_tasks",
        "attach_task",
        "set_list_tasks",
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
        "delete_task",
        "delete_notification",
        "clear_notifications",
    }:
        scopes.append("notoli:delete")
    if operation in {"add_board_collaborator", "remove_board_collaborator"}:
        scopes.append("notoli:share")
    return scopes


def lock_actor(user):
    from django.db.models import F

    from .models import ActorLock

    actor, _ = ActorLock.objects.get_or_create(owner=user)
    ActorLock.objects.filter(pk=actor.pk).update(revision=F("revision"))
    ActorLock.objects.select_for_update().get(pk=actor.pk)
    type(user).objects.select_for_update().get(pk=user.pk)


def principal(raw_token, operation, *, lock=False):
    scopes = required_scopes(operation)
    try:
        if not isinstance(raw_token, str) or not raw_token or len(raw_token) > 4096:
            raise ConnectionPermissionDenied("Connect your Notoli account.")
        token = resolve_token(raw_token)
        if not set(scopes) <= set(token.scope.split()):
            raise ConnectionPermissionDenied(
                "This connection lacks required permissions.", "insufficient_scope"
            )
        if lock:
            lock_actor(token.user)
            type(token).objects.select_for_update().get(pk=token.pk)
            return principal(raw_token, operation)
        return token
    except ConnectionPermissionDenied as error:
        error.required_scopes = scopes
        raise
