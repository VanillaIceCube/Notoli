"""MCP mutation actions, using the same services as the REST API.

Only explicit fields enter serializers; ownership, scope, and creator fields
never come from tool callers. The caller encloses each action in a transaction.
"""

from django.core.exceptions import PermissionDenied
from rest_framework.exceptions import APIException

from apps.notifications import services as notifications
from apps.notifications.serializers import NotificationSerializer
from apps.tasks import services as tasks
from apps.tasks.serializers import (
    BoardSerializer,
    ListSerializer,
    TaskSerializer,
)

from .queries import accessible_list, board_for, notification_for, task_for
from .results import notification_result, summary, task_result


class OperationError(ValueError):
    """Expected, locally authored validation guidance safe for tool callers."""


CHANGE_REJECTED = (
    "Notoli rejected the change. Check the supplied fields and current record."
)


# Closed transport policy: unknown fields cannot become ownership or membership edits.
ROUTINE = {
    "create_board": ("name", "description"),
    "update_board": ("board_id", "name", "description"),
    "create_list": ("board_id", "name", "description"),
    "update_list": ("list_id", "name", "description"),
    "add_task": ("list_id", "text", "description"),
    "update_task": ("list_id", "task_id", "text", "description", "status"),
    "add_board_task": ("board_id", "text", "description"),
    "update_board_task": ("board_id", "task_id", "text", "description", "status"),
    "attach_task": ("list_id", "task_id"),
    "reorder_lists": ("board_id", "ordered_ids"),
    "reorder_tasks": ("list_id", "ordered_ids"),
    "update_notification": ("notification_id", "is_read"),
    "mark_all_notifications_read": (),
    "add_board_collaborator": ("board_id", "identifier"),
    "set_list_tasks": ("list_id", "task_ids"),
}
PREPARABLE = {
    "add_board_collaborator": ("board_id", "identifier"),
    "remove_board_collaborator": ("board_id", "user_id"),
    "delete_board": ("board_id",),
    "delete_list": ("list_id",),
    "delete_task": ("board_id", "task_id"),
    "set_list_tasks": ("list_id", "task_ids"),
    "delete_notification": ("notification_id",),
    "clear_notifications": (),
}


REMOVAL_ACTIONS = frozenset(
    {
        "delete_board",
        "delete_list",
        "delete_task",
        "delete_notification",
        "clear_notifications",
        "remove_board_collaborator",
    }
)


def requires_approval(user, operation, arguments):
    """Membership omissions are removals; hold the board lock through dispatch."""
    if operation in REMOVAL_ACTIONS:
        return True
    if operation == "set_list_tasks":
        from .queries import removes_memberships

        return removes_memberships(user, arguments["list_id"], arguments["task_ids"])
    if operation in ROUTINE:
        return False
    raise OperationError("Unknown operation policy.")


def validate_arguments(operation, arguments):
    fields = (ROUTINE | PREPARABLE).get(operation)
    if fields is None or set(arguments) - set(fields):
        raise OperationError("Unknown action or writable fields.")
    arguments = dict(arguments)
    for key in fields:
        value = arguments.get(key)
        if key.endswith("_id") and (type(value) is not int or value <= 0):
            raise OperationError("Identifiers must be positive integers.")
        if key in {"task_ids", "ordered_ids"} and (
            not isinstance(value, list)
            or len(value) > 1000
            or any(type(task) is not int or task <= 0 for task in value)
            or len(value) != len(set(value))
        ):
            raise OperationError("Use distinct positive IDs, at most 1000.")
        if key == "is_read" and type(value) is not bool:
            raise OperationError("is_read must be boolean.")
        if key in {"name", "text", "description", "status", "identifier"}:
            if value is not None and not isinstance(value, str):
                raise OperationError("Text fields must be strings.")
    if operation in {"create_board", "create_list", "add_task", "add_board_task"}:
        arguments.setdefault("description", "")
    if operation in {"update_task", "update_board_task"}:
        for key in ("text", "description", "status"):
            arguments.setdefault(key, None)
    return arguments


def _validated_fields(serializer_class, actor, fields, instance=None):
    serializer = serializer_class(
        instance, data=fields, partial=instance is not None, context={"actor": actor}
    )
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def _changed_fields(arguments, allowed_fields):
    fields = {
        key: arguments[key] for key in allowed_fields if arguments.get(key) is not None
    }
    if not fields:
        raise OperationError(f"Provide at least one of: {', '.join(allowed_fields)}.")
    return fields


def _create_board(actor, *, name, description):
    fields = _validated_fields(
        BoardSerializer, actor, {"name": name, "description": description}
    )
    return summary(tasks.create_board(actor, fields))


def _update_board(actor, *, board_id, **arguments):
    board = board_for(actor, board_id)
    fields = _changed_fields(arguments, ("name", "description"))
    fields = _validated_fields(BoardSerializer, actor, fields, board)
    return summary(tasks.update_board(actor, fields, board))


def _delete_board(actor, *, board_id):
    board = board_for(actor, board_id)
    tasks.delete_board(actor, board)
    return {"id": board_id, "action": "deleted"}


def _create_list(actor, *, board_id, name, description):
    board = board_for(actor, board_id)
    fields = _validated_fields(
        ListSerializer,
        actor,
        {"board": board.pk, "name": name, "description": description},
    )
    return summary(tasks.create_list(actor, fields))


def _update_list(actor, *, list_id, **arguments):
    board_list = accessible_list(actor, list_id)
    fields = _changed_fields(arguments, ("name", "description"))
    fields = _validated_fields(ListSerializer, actor, fields, board_list)
    return summary(tasks.update_list(actor, fields, board_list))


def _delete_list(actor, *, list_id):
    board_list = accessible_list(actor, list_id)
    tasks.delete_list(actor, board_list)
    return {"id": list_id, "action": "deleted"}


def _reorder_lists(actor, *, board_id, ordered_ids):
    board = board_for(actor, board_id)
    tasks.reorder_lists(actor, board.pk, ordered_ids)
    return {"id": board.pk, "ordered_ids": ordered_ids}


def _add_task(actor, *, list_id, text, description):
    board_list = accessible_list(actor, list_id)
    try:
        fields = _validated_fields(
            TaskSerializer,
            actor,
            {"list": board_list.pk, "text": text, "description": description},
        )
        task = tasks.create_task(actor, fields)
    except APIException:
        raise OperationError(CHANGE_REJECTED) from None
    return task_result(task, board_list.pk)


def _update_task(actor, *, list_id, task_id, **arguments):
    board_list = accessible_list(actor, list_id)
    task = (
        tasks.tasks_for(actor, board_id=board_list.board_id, list_id=board_list.pk)
        .filter(pk=task_id)
        .first()
    )
    if task is None:
        raise PermissionDenied("Task not found in this list or no longer accessible.")
    fields = {
        key: arguments[key]
        for key in ("text", "description", "status")
        if arguments[key] is not None
    }
    if not fields:
        raise OperationError("Provide text, description, or status to update.")
    try:
        fields = _validated_fields(TaskSerializer, actor, fields, task)
        task = tasks.update_task(actor, fields, task)
    except APIException:
        raise OperationError(CHANGE_REJECTED) from None
    return task_result(task, board_list.pk)


def _add_board_task(actor, *, board_id, text, description):
    board = board_for(actor, board_id)
    fields = _validated_fields(
        TaskSerializer,
        actor,
        {"board": board.pk, "text": text, "description": description},
    )
    return task_result(tasks.create_task(actor, fields), None)


def _update_board_task(actor, *, board_id, task_id, **arguments):
    board = board_for(actor, board_id)
    task = task_for(actor, board.pk, task_id)
    fields = _changed_fields(arguments, ("text", "description", "status"))
    fields = _validated_fields(TaskSerializer, actor, fields, task)
    return task_result(tasks.update_task(actor, fields, task), None)


def _delete_task(actor, *, board_id, task_id):
    board = board_for(actor, board_id)
    task = task_for(actor, board.pk, task_id)
    tasks.delete_task(actor, task)
    return {"id": task_id, "action": "deleted"}


def _attach_task(actor, *, list_id, task_id):
    board_list = accessible_list(actor, list_id)
    task = task_for(actor, board_list.board_id, task_id)
    fields = _validated_fields(TaskSerializer, actor, {"list": board_list.pk}, task)
    return task_result(tasks.update_task(actor, fields, task), board_list.pk)


def _set_list_tasks(actor, *, list_id, task_ids):
    board_list = accessible_list(actor, list_id)
    if len(task_ids) != len(set(task_ids)):
        raise OperationError("Duplicate task IDs are not allowed.")
    visible_tasks = tasks.tasks_for(actor, board_id=board_list.board_id)
    if visible_tasks.filter(pk__in=task_ids).count() != len(task_ids):
        raise PermissionDenied("Every task must belong to the accessible list's board.")
    fields = _validated_fields(ListSerializer, actor, {"tasks": task_ids}, board_list)
    tasks.update_list(actor, fields, board_list)
    return {"id": board_list.pk, "ordered_ids": task_ids}


def _reorder_tasks(actor, *, list_id, ordered_ids):
    board_list = accessible_list(actor, list_id)
    tasks.reorder_tasks(actor, board_list.pk, ordered_ids)
    return {"id": board_list.pk, "ordered_ids": ordered_ids}


def _collaborator_result(board, action):
    return {
        "board_id": board.pk,
        "board_name": board.name,
        "sharing_level": "board",
        "action": action,
    }


def _add_board_collaborator(actor, *, board_id, identifier=None, resolved_user_id=None):
    board = board_for(actor, board_id)
    tasks.add_collaborator(
        actor, board.pk, identifier, expected_user_id=resolved_user_id
    )
    return _collaborator_result(board, "added")


def _remove_board_collaborator(actor, *, board_id, user_id):
    board = board_for(actor, board_id)
    tasks.remove_collaborator(actor, board.pk, user_id)
    return _collaborator_result(board, "removed")


def _update_notification(actor, *, notification_id, is_read):
    notification = notification_for(actor, notification_id)
    fields = _validated_fields(
        NotificationSerializer, actor, {"is_read": is_read}, notification
    )
    return notification_result(
        notifications.update_notification(actor, fields, notification)
    )


def _mark_all_notifications_read(actor):
    return {"count": notifications.mark_all_read(actor)}


def _delete_notification(actor, *, notification_id):
    notification = notification_for(actor, notification_id)
    notifications.delete_notification(actor, notification)
    return {"id": notification_id, "action": "deleted"}


def _clear_notifications(actor, *, selected_ids):
    return {"count": notifications.clear_all(actor, selected_ids=selected_ids)}


_ACTION_HANDLERS = {
    "create_board": _create_board,
    "update_board": _update_board,
    "delete_board": _delete_board,
    "create_list": _create_list,
    "update_list": _update_list,
    "delete_list": _delete_list,
    "reorder_lists": _reorder_lists,
    "add_task": _add_task,
    "update_task": _update_task,
    "add_board_task": _add_board_task,
    "update_board_task": _update_board_task,
    "delete_task": _delete_task,
    "attach_task": _attach_task,
    "set_list_tasks": _set_list_tasks,
    "reorder_tasks": _reorder_tasks,
    "add_board_collaborator": _add_board_collaborator,
    "remove_board_collaborator": _remove_board_collaborator,
    "update_notification": _update_notification,
    "mark_all_notifications_read": _mark_all_notifications_read,
    "delete_notification": _delete_notification,
    "clear_notifications": _clear_notifications,
}


def apply_action(actor, action, arguments):
    """Run the named mutation inside the caller's authorization and receipt transaction."""
    handler = _ACTION_HANDLERS.get(action)
    if handler is None:
        raise OperationError("Unknown tool.")
    try:
        return handler(actor, **arguments)
    except tasks.SharingChangeError as error:
        raise OperationError(str(error.detail["error"])) from None
    except APIException as error:
        if action in {"add_board_collaborator", "remove_board_collaborator"}:
            if error.status_code == 400:
                if isinstance(error.detail, dict) and "error" in error.detail:
                    raise OperationError(str(error.detail["error"])) from None
                raise OperationError(
                    "Notoli rejected the sharing change. Check the supplied fields and current board."
                ) from None
            raise PermissionDenied(str(error.detail)) from None
        if error.status_code in {403, 404}:
            raise PermissionDenied(str(error.detail)) from None
        raise OperationError(CHANGE_REJECTED) from None
