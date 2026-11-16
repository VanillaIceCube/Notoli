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

from .queries import accessible_list, board_for, item_for
from .results import item_result, notification_result, summary


class OperationError(ValueError):
    """Expected, locally authored validation guidance safe for tool callers."""


OPERATIONS = {
    "create_board",
    "update_board",
    "delete_board",
    "create_list",
    "update_list",
    "delete_list",
    "reorder_lists",
    "add_board_item",
    "update_board_item",
    "delete_item",
    "attach_item",
    "set_list_items",
    "reorder_items",
    "update_notification",
    "mark_all_notifications_read",
    "delete_notification",
    "clear_notifications",
}


def save(user, kind, data, instance=None):
    serializer_class, create, update = {
        "board": (BoardSerializer, notes.create_board, notes.update_board),
        "list": (ListSerializer, notes.create_list, notes.update_list),
        "note": (NoteSerializer, notes.create_note, notes.update_note),
        "notification": (
            NotificationSerializer,
            None,
            notifications.update_notification,
        ),
    }[kind]
    serializer = serializer_class(
        instance, data=data, partial=instance is not None, context={"actor": user}
    )
    serializer.is_valid(raise_exception=True)
    if instance is None:
        return create(user, serializer.validated_data)
    return update(user, serializer.validated_data, instance)


def updates(arguments, fields):
    data = {key: arguments[key] for key in fields if arguments.get(key) is not None}
    if not data:
        raise OperationError(f"Provide at least one of: {', '.join(fields)}.")
    return data


def execute_feature(user, operation, args):
    if operation.startswith("delete_") or operation == "clear_notifications":
        if args.get("confirm") is not True:
            raise OperationError(
                "Explain the deletion impact and obtain user confirmation first."
            )
    try:
        return perform(user, operation, args)
    except APIException as error:
        if error.status_code in {403, 404}:
            raise PermissionDenied(str(error.detail)) from None
        raise OperationError(
            "Notoli rejected the change. Check the supplied fields and current record."
        ) from None


def perform(user, operation, args):
    if operation == "create_board":
        return summary(
            save(
                user,
                "board",
                {"name": args["name"], "description": args["description"]},
            )
        )
    if operation in {"update_board", "delete_board", "reorder_lists"}:
        board = board_for(user, args["board_id"])
        if operation == "update_board":
            return summary(
                save(user, "board", updates(args, ("name", "description")), board)
            )
        if operation == "delete_board":
            board_id = board.pk
            notes.delete_board(user, board)
            return {"id": board_id, "action": "deleted"}
        notes.reorder_lists(user, board.pk, args["ordered_ids"])
        return {"id": board.pk, "ordered_ids": args["ordered_ids"]}
    if operation == "create_list":
        board = board_for(user, args["board_id"])
        return summary(
            save(
                user,
                "list",
                {
                    "board": board.pk,
                    "name": args["name"],
                    "description": args["description"],
                },
            )
        )
    if operation in {
        "update_list",
        "delete_list",
        "set_list_items",
        "reorder_items",
        "attach_item",
    }:
        note_list = accessible_list(user, args["list_id"])
        if operation == "update_list":
            return summary(
                save(user, "list", updates(args, ("name", "description")), note_list)
            )
        if operation == "delete_list":
            list_id = note_list.pk
            notes.delete_list(user, note_list)
            return {"id": list_id, "action": "deleted"}
        if operation == "attach_item":
            item = item_for(user, note_list.board_id, args["item_id"])
            return item_result(
                save(user, "note", {"list": note_list.pk}, item), note_list.pk
            )
        if operation == "set_list_items":
            ids = args["item_ids"]
            if len(ids) != len(set(ids)):
                raise OperationError("Duplicate item IDs are not allowed.")
            if notes.notes_for(user, board_id=note_list.board_id).filter(
                pk__in=ids
            ).count() != len(ids):
                raise PermissionDenied(
                    "Every item must belong to the accessible list's board."
                )
            save(user, "list", {"notes": ids}, note_list)
            return {"id": note_list.pk, "ordered_ids": ids}
        notes.reorder_notes(user, note_list.pk, args["ordered_ids"])
        return {"id": note_list.pk, "ordered_ids": args["ordered_ids"]}
    if operation in {"add_board_item", "update_board_item", "delete_item"}:
        board = board_for(user, args["board_id"])
        if operation == "add_board_item":
            return item_result(
                save(
                    user,
                    "note",
                    {
                        "board": board.pk,
                        "note": args["note"],
                        "description": args["description"],
                    },
                ),
                None,
            )
        item = item_for(user, board.pk, args["item_id"])
        if operation == "update_board_item":
            return item_result(
                save(
                    user, "note", updates(args, ("note", "description", "status")), item
                ),
                None,
            )
        item_id = item.pk
        notes.delete_note(user, item)
        return {"id": item_id, "action": "deleted"}
    if operation == "mark_all_notifications_read":
        return {"count": notifications.mark_all_read(user)}
    if operation == "clear_notifications":
        return {"count": notifications.clear_all(user)}
    row = (
        notifications.notifications_for(user).filter(pk=args["notification_id"]).first()
    )
    if row is None:
        raise PermissionDenied("Notification not found or not yours.")
    if operation == "update_notification":
        return notification_result(
            save(user, "notification", {"is_read": args["is_read"]}, row)
        )
    notification_id = row.pk
    notifications.delete_notification(user, row)
    return {"id": notification_id, "action": "deleted"}


def execute(user, operation, **arguments):
    if operation in OPERATIONS:
        return execute_feature(user, operation, arguments)
    if operation in {"add_board_collaborator", "remove_board_collaborator"}:
        board = board_for(user, arguments["board_id"])
        try:
            if operation == "add_board_collaborator":
                notes.add_collaborator(user, board.pk, arguments.get("identifier"))
            else:
                notes.remove_collaborator(user, board.pk, arguments["user_id"])
        except notes.SharingChangeError as error:
            raise OperationError(str(error.detail["error"])) from None
        except APIException as error:
            if error.status_code == 400:
                if isinstance(error.detail, dict) and "error" in error.detail:
                    raise OperationError(str(error.detail["error"])) from None
                raise OperationError(
                    "Notoli rejected the sharing change. Check the supplied fields and current board."
                ) from None
            raise PermissionDenied(str(error.detail)) from None
        return {
            "board_id": board.pk,
            "board_name": board.name,
            "sharing_level": "board",
            "action": "added" if operation == "add_board_collaborator" else "removed",
        }
    note_list = accessible_list(user, arguments["list_id"])
    if operation == "add_item":
        data = {
            "list": note_list.pk,
            "note": arguments["note"],
            "description": arguments["description"],
        }
        item = None
    elif operation == "update_item":
        item = (
            notes.notes_for(user, board_id=note_list.board_id, list_id=note_list.pk)
            .filter(pk=arguments["item_id"])
            .first()
        )
        if item is None:
            raise PermissionDenied(
                "Item not found in this list or no longer accessible."
            )
        data = {
            key: arguments[key]
            for key in ("note", "description", "status")
            if arguments[key] is not None
        }
        if not data:
            raise OperationError("Provide note, description, or status to update.")
    else:
        raise OperationError("Unknown tool.")
    try:
        item = save(user, "note", data, item)
    except APIException:
        raise OperationError(
            "Notoli rejected the change. Check the supplied fields and current record."
        ) from None
    return item_result(item, note_list.pk)
