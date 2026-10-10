"""MCP product actions, using the same services as the REST API.

Only explicit fields enter serializers; ownership, scope, and creator fields
never come from tool callers. The caller encloses each action in a transaction.
"""

from django.core.exceptions import PermissionDenied
from rest_framework.exceptions import APIException

from notes.models import Board, Note
from notes.views import BoardViewSet, ListViewSet, NoteViewSet
from notifications.views import NotificationViewSet

from .adapters import accessible_list, item_result, page, view_for

OPERATIONS = {
    "get_board",
    "create_board",
    "update_board",
    "delete_board",
    "get_list",
    "create_list",
    "update_list",
    "delete_list",
    "reorder_lists",
    "list_board_items",
    "get_item",
    "add_board_item",
    "update_board_item",
    "delete_item",
    "attach_item",
    "set_list_items",
    "reorder_items",
    "list_notifications",
    "get_notification",
    "update_notification",
    "mark_all_notifications_read",
    "delete_notification",
    "clear_notifications",
}


def board_for(user, board_id):
    board = Board.objects.accessible_to(user).filter(pk=board_id).first()
    if board is None:
        raise PermissionDenied("Board not found or no longer accessible.")
    return board


def item_for(user, board_id, item_id):
    board_for(user, board_id)
    item = (
        view_for(NoteViewSet, user, query={"board": board_id})
        .get_queryset()
        .filter(pk=item_id)
        .first()
    )
    if item is None:
        raise PermissionDenied("Item not found in this board or no longer accessible.")
    return item


def summary(row):
    result = {"id": row.pk, "name": row.name, "description": row.description}
    if hasattr(row, "board_id"):
        result["board_id"] = row.board_id
    return result


def notification_result(row):
    return {
        "id": row.pk,
        "event_type": row.event_type,
        "title": row.title,
        "message": row.message,
        "is_read": row.is_read,
        "created_at": row.created_at.isoformat(),
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "board_id": row.board_id,
        "board_name": row.board_name,
        "list_id": row.list_id,
        "item_id": row.note_id,
        "target_path": row.target_path,
    }


def save(view, data, instance=None):
    view.request.data = data
    serializer = view.get_serializer(instance, data=data, partial=instance is not None)
    serializer.is_valid(raise_exception=True)
    if instance is None:
        view.perform_create(serializer)
    else:
        view.perform_update(serializer)
    return serializer.instance


def updates(arguments, fields):
    data = {key: arguments[key] for key in fields if arguments.get(key) is not None}
    if not data:
        raise ValueError(f"Provide at least one of: {', '.join(fields)}.")
    return data


def response_data(response):
    if response.status_code >= 400:
        raise ValueError(f"Notoli rejected the change: {response.data}")
    return response.data


def execute_feature(user, operation, args):
    # Confirmation is also checked here, independently of the MCP schema.
    if operation.startswith("delete_") or operation == "clear_notifications":
        if args.get("confirm") is not True:
            raise ValueError(
                "Explain the deletion impact and obtain user confirmation first."
            )
    try:
        return perform(user, operation, args)
    except APIException as error:
        if error.status_code in {403, 404}:
            raise PermissionDenied(str(error.detail)) from None
        raise ValueError(f"Notoli rejected the change: {error.detail}") from None


def perform(user, operation, args):
    if operation == "create_board":
        return summary(
            save(
                view_for(BoardViewSet, user),
                {"name": args["name"], "description": args["description"]},
            )
        )
    if operation in {"get_board", "update_board", "delete_board", "reorder_lists"}:
        board = board_for(user, args["board_id"])
        view = view_for(BoardViewSet, user)
        if operation == "get_board":
            return summary(board)
        if operation == "update_board":
            return summary(save(view, updates(args, ("name", "description")), board))
        if operation == "delete_board":
            board_id = board.pk
            view.perform_destroy(board)
            return {"id": board_id, "action": "deleted"}
        view = view_for(
            ListViewSet,
            user,
            data={"board": board.pk, "ordered_ids": args["ordered_ids"]},
            query={"board": board.pk},
        )
        response_data(view.reorder(view.request))
        return {"id": board.pk, "ordered_ids": args["ordered_ids"]}
    if operation == "create_list":
        board = board_for(user, args["board_id"])
        return summary(
            save(
                view_for(ListViewSet, user),
                {
                    "board": board.pk,
                    "name": args["name"],
                    "description": args["description"],
                },
            )
        )
    if operation in {
        "get_list",
        "update_list",
        "delete_list",
        "set_list_items",
        "reorder_items",
        "attach_item",
    }:
        note_list = accessible_list(user, args["list_id"])
        view = view_for(ListViewSet, user)
        if operation == "get_list":
            return summary(note_list)
        if operation == "update_list":
            return summary(
                save(view, updates(args, ("name", "description")), note_list)
            )
        if operation == "delete_list":
            list_id = note_list.pk
            view.perform_destroy(note_list)
            return {"id": list_id, "action": "deleted"}
        if operation == "attach_item":
            item = item_for(user, note_list.board_id, args["item_id"])
            note_view = view_for(NoteViewSet, user)
            return item_result(
                save(note_view, {"list": note_list.pk}, item), note_list.pk
            )
        if operation == "set_list_items":
            ids = args["item_ids"]
            if len(ids) != len(set(ids)):
                raise ValueError("Duplicate item IDs are not allowed.")
            # ListSerializer checks same-board membership too. Check live access
            # before accepting a membership replacement, including orphan items.
            if Note.objects.filter(board=note_list.board, pk__in=ids).count() != len(
                ids
            ):
                raise PermissionDenied(
                    "Every item must belong to the accessible list's board."
                )
            save(view, {"notes": ids}, note_list)
            return {"id": note_list.pk, "ordered_ids": ids}
        view = view_for(
            NoteViewSet,
            user,
            data={"list": note_list.pk, "ordered_ids": args["ordered_ids"]},
            query={"board": note_list.board_id, "list": note_list.pk},
        )
        response_data(view.reorder(view.request))
        return {"id": note_list.pk, "ordered_ids": args["ordered_ids"]}
    if operation in {
        "list_board_items",
        "get_item",
        "add_board_item",
        "update_board_item",
        "delete_item",
    }:
        board = board_for(user, args["board_id"])
        view = view_for(NoteViewSet, user, query={"board": board.pk})
        if operation == "list_board_items":
            rows = view.get_queryset().order_by("id")
            return page(
                rows, args["limit"], args["offset"], lambda row: item_result(row, None)
            )
        if operation == "add_board_item":
            return item_result(
                save(
                    view,
                    {
                        "board": board.pk,
                        "note": args["note"],
                        "description": args["description"],
                    },
                ),
                None,
            )
        item = item_for(user, board.pk, args["item_id"])
        if operation == "get_item":
            return item_result(item, None)
        if operation == "update_board_item":
            return item_result(
                save(view, updates(args, ("note", "description", "status")), item), None
            )
        item_id = item.pk
        view.perform_destroy(item)
        return {"id": item_id, "action": "deleted"}
    view = view_for(NotificationViewSet, user)
    if operation == "list_notifications":
        rows = view.get_queryset()
        if args.get("unread_only"):
            rows = rows.filter(is_read=False)
        return page(rows, args["limit"], args["offset"], notification_result)
    if operation == "mark_all_notifications_read":
        return {"count": response_data(view.mark_all_read(view.request))["updated"]}
    if operation == "clear_notifications":
        return {"count": response_data(view.clear_all(view.request))["deleted"]}
    row = view.get_queryset().filter(pk=args["notification_id"]).first()
    if row is None:
        raise PermissionDenied("Notification not found or not yours.")
    if operation == "get_notification":
        return notification_result(row)
    if operation == "update_notification":
        return notification_result(save(view, {"is_read": args["is_read"]}, row))
    notification_id = row.pk
    view.perform_destroy(row)
    return {"id": notification_id, "action": "deleted"}
