"""MCP mutation actions, using the same services as the REST API.

Only explicit fields enter serializers; ownership, scope, and creator fields
never come from tool callers. The caller encloses each action in a transaction.
"""

from django.core.exceptions import PermissionDenied
from rest_framework.exceptions import APIException

from apps.notes import services as notes
from apps.notes.serializers import (
    BoardSerializer,
    ListSerializer,
    NoteSerializer,
)
from apps.notifications import services as notifications
from apps.notifications.serializers import NotificationSerializer

from .queries import accessible_list, board_for, item_for, notification_for
from .results import item_result, notification_result, summary


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
    "add_item": ("list_id", "note", "description"),
    "update_item": ("list_id", "item_id", "note", "description", "status"),
    "add_board_item": ("board_id", "note", "description"),
    "update_board_item": ("board_id", "item_id", "note", "description", "status"),
    "attach_item": ("list_id", "item_id"),
    "reorder_lists": ("board_id", "ordered_ids"),
    "reorder_items": ("list_id", "ordered_ids"),
    "update_notification": ("notification_id", "is_read"),
    "mark_all_notifications_read": (),
    "add_board_collaborator": ("board_id", "identifier"),
    "set_list_items": ("list_id", "item_ids"),
}
PREPARABLE = {
    "add_board_collaborator": ("board_id", "identifier"),
    "remove_board_collaborator": ("board_id", "user_id"),
    "delete_board": ("board_id",),
    "delete_list": ("list_id",),
    "delete_item": ("board_id", "item_id"),
    "set_list_items": ("list_id", "item_ids"),
    "delete_notification": ("notification_id",),
    "clear_notifications": (),
}


REMOVAL_ACTIONS = frozenset(
    {
        "delete_board",
        "delete_list",
        "delete_item",
        "delete_notification",
        "clear_notifications",
        "remove_board_collaborator",
    }
)


def requires_approval(user, operation, arguments):
    """Membership omissions are removals; hold the board lock through dispatch."""
    if operation in REMOVAL_ACTIONS:
        return True
    if operation == "set_list_items":
        from .queries import removes_memberships

        return removes_memberships(user, arguments["list_id"], arguments["item_ids"])
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
        if key in {"item_ids", "ordered_ids"} and (
            not isinstance(value, list)
            or len(value) > 1000
            or any(type(item) is not int or item <= 0 for item in value)
            or len(value) != len(set(value))
        ):
            raise OperationError("Use distinct positive IDs, at most 1000.")
        if key == "is_read" and type(value) is not bool:
            raise OperationError("is_read must be boolean.")
        if key in {"name", "note", "description", "status", "identifier"}:
            if value is not None and not isinstance(value, str):
                raise OperationError("Text fields must be strings.")
    if operation in {"create_board", "create_list", "add_item", "add_board_item"}:
        arguments.setdefault("description", "")
    if operation in {"update_item", "update_board_item"}:
        for key in ("note", "description", "status"):
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
    return summary(notes.create_board(actor, fields))


def _update_board(actor, *, board_id, **arguments):
    board = board_for(actor, board_id)
    fields = _changed_fields(arguments, ("name", "description"))
    fields = _validated_fields(BoardSerializer, actor, fields, board)
    return summary(notes.update_board(actor, fields, board))


def _delete_board(actor, *, board_id):
    board = board_for(actor, board_id)
    notes.delete_board(actor, board)
    return {"id": board_id, "action": "deleted"}


def _create_list(actor, *, board_id, name, description):
    board = board_for(actor, board_id)
    fields = _validated_fields(
        ListSerializer,
        actor,
        {"board": board.pk, "name": name, "description": description},
    )
    return summary(notes.create_list(actor, fields))


def _update_list(actor, *, list_id, **arguments):
    note_list = accessible_list(actor, list_id)
    fields = _changed_fields(arguments, ("name", "description"))
    fields = _validated_fields(ListSerializer, actor, fields, note_list)
    return summary(notes.update_list(actor, fields, note_list))


def _delete_list(actor, *, list_id):
    note_list = accessible_list(actor, list_id)
    notes.delete_list(actor, note_list)
    return {"id": list_id, "action": "deleted"}


def _reorder_lists(actor, *, board_id, ordered_ids):
    board = board_for(actor, board_id)
    notes.reorder_lists(actor, board.pk, ordered_ids)
    return {"id": board.pk, "ordered_ids": ordered_ids}


def _add_item(actor, *, list_id, note, description):
    note_list = accessible_list(actor, list_id)
    try:
        fields = _validated_fields(
            NoteSerializer,
            actor,
            {"list": note_list.pk, "note": note, "description": description},
        )
        item = notes.create_note(actor, fields)
    except APIException:
        raise OperationError(CHANGE_REJECTED) from None
    return item_result(item, note_list.pk)


def _update_item(actor, *, list_id, item_id, **arguments):
    note_list = accessible_list(actor, list_id)
    item = (
        notes.notes_for(actor, board_id=note_list.board_id, list_id=note_list.pk)
        .filter(pk=item_id)
        .first()
    )
    if item is None:
        raise PermissionDenied("Item not found in this list or no longer accessible.")
    fields = {
        key: arguments[key]
        for key in ("note", "description", "status")
        if arguments[key] is not None
    }
    if not fields:
        raise OperationError("Provide note, description, or status to update.")
    try:
        fields = _validated_fields(NoteSerializer, actor, fields, item)
        item = notes.update_note(actor, fields, item)
    except APIException:
        raise OperationError(CHANGE_REJECTED) from None
    return item_result(item, note_list.pk)


def _add_board_item(actor, *, board_id, note, description):
    board = board_for(actor, board_id)
    fields = _validated_fields(
        NoteSerializer,
        actor,
        {"board": board.pk, "note": note, "description": description},
    )
    return item_result(notes.create_note(actor, fields), None)


def _update_board_item(actor, *, board_id, item_id, **arguments):
    board = board_for(actor, board_id)
    item = item_for(actor, board.pk, item_id)
    fields = _changed_fields(arguments, ("note", "description", "status"))
    fields = _validated_fields(NoteSerializer, actor, fields, item)
    return item_result(notes.update_note(actor, fields, item), None)


def _delete_item(actor, *, board_id, item_id):
    board = board_for(actor, board_id)
    item = item_for(actor, board.pk, item_id)
    notes.delete_note(actor, item)
    return {"id": item_id, "action": "deleted"}


def _attach_item(actor, *, list_id, item_id):
    note_list = accessible_list(actor, list_id)
    item = item_for(actor, note_list.board_id, item_id)
    fields = _validated_fields(NoteSerializer, actor, {"list": note_list.pk}, item)
    return item_result(notes.update_note(actor, fields, item), note_list.pk)


def _set_list_items(actor, *, list_id, item_ids):
    note_list = accessible_list(actor, list_id)
    if len(item_ids) != len(set(item_ids)):
        raise OperationError("Duplicate item IDs are not allowed.")
    visible_items = notes.notes_for(actor, board_id=note_list.board_id)
    if visible_items.filter(pk__in=item_ids).count() != len(item_ids):
        raise PermissionDenied("Every item must belong to the accessible list's board.")
    fields = _validated_fields(ListSerializer, actor, {"notes": item_ids}, note_list)
    notes.update_list(actor, fields, note_list)
    return {"id": note_list.pk, "ordered_ids": item_ids}


def _reorder_items(actor, *, list_id, ordered_ids):
    note_list = accessible_list(actor, list_id)
    notes.reorder_notes(actor, note_list.pk, ordered_ids)
    return {"id": note_list.pk, "ordered_ids": ordered_ids}


def _collaborator_result(board, action):
    return {
        "board_id": board.pk,
        "board_name": board.name,
        "sharing_level": "board",
        "action": action,
    }


def _add_board_collaborator(actor, *, board_id, identifier=None, resolved_user_id=None):
    board = board_for(actor, board_id)
    notes.add_collaborator(
        actor, board.pk, identifier, expected_user_id=resolved_user_id
    )
    return _collaborator_result(board, "added")


def _remove_board_collaborator(actor, *, board_id, user_id):
    board = board_for(actor, board_id)
    notes.remove_collaborator(actor, board.pk, user_id)
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
    "add_item": _add_item,
    "update_item": _update_item,
    "add_board_item": _add_board_item,
    "update_board_item": _update_board_item,
    "delete_item": _delete_item,
    "attach_item": _attach_item,
    "set_list_items": _set_list_items,
    "reorder_items": _reorder_items,
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
    except notes.SharingChangeError as error:
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
