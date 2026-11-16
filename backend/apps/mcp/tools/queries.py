"""Read-only Notoli queries and authoritative actor-scoped lookups."""

from django.core.exceptions import PermissionDenied

from apps.notes import services as notes
from apps.notes.serializers import UserSummarySerializer
from apps.notifications import services as notifications

from .results import item_result, notification_result, page, summary

READ_OPERATIONS = {
    "list_boards",
    "list_lists",
    "get_items",
    "get_board_collaborators",
    "get_board",
    "get_list",
    "list_board_items",
    "get_item",
    "list_notifications",
    "get_notification",
}


def board_for(user, board_id):
    board = notes.boards_for(user).select_related("owner").filter(pk=board_id).first()
    if board is None:
        raise PermissionDenied("Board not found or no longer accessible.")
    return board


def accessible_list(user, list_id):
    row = notes.lists_for(user).filter(pk=list_id).first()
    if row is None:
        raise PermissionDenied("List not found or no longer accessible.")
    return row


def item_for(user, board_id, item_id):
    row = notes.notes_for(user, board_id=board_id).filter(pk=item_id).first()
    if row is None:
        raise PermissionDenied("Item not found in this board or no longer accessible.")
    return row


def notification_for(user, notification_id):
    row = notifications.notifications_for(user).filter(pk=notification_id).first()
    if row is None:
        raise PermissionDenied("Notification not found or not yours.")
    return row


def execute(user, operation, **args):
    if operation == "list_boards":
        rows = notes.boards_for(user).order_by("id")
        if args["query"]:
            rows = rows.filter(name__icontains=args["query"])
        return page(rows, args["limit"], args["offset"], summary)
    if operation == "list_lists":
        return page(
            notes.lists_for(user, board_id=args["board_id"]),
            args["limit"],
            args["offset"],
            summary,
        )
    if operation == "get_board":
        return summary(board_for(user, args["board_id"]))
    if operation == "get_list":
        return summary(accessible_list(user, args["list_id"]))
    if operation == "get_items":
        note_list = accessible_list(user, args["list_id"])
        rows = notes.notes_for(user, board_id=note_list.board_id, list_id=note_list.pk)
        return page(
            rows,
            args["limit"],
            args["offset"],
            lambda row: item_result(row, note_list.pk),
        )
    if operation == "list_board_items":
        rows = notes.notes_for(user, board_id=args["board_id"]).order_by("id")
        return page(
            rows, args["limit"], args["offset"], lambda row: item_result(row, None)
        )
    if operation == "get_item":
        return item_result(item_for(user, args["board_id"], args["item_id"]), None)
    if operation == "get_board_collaborators":
        board = board_for(user, args["board_id"])
        return {
            "board_id": board.pk,
            "board_name": board.name,
            "sharing_level": "board",
            "can_manage_collaborators": board.owner_id == user.pk,
            "owner": dict(UserSummarySerializer(board.owner).data),
            **page(
                board.collaborators.order_by("username", "id"),
                args["limit"],
                args["offset"],
                lambda member: dict(UserSummarySerializer(member).data),
            ),
        }
    if operation == "list_notifications":
        rows = notifications.notifications_for(user)
        if args.get("unread_only"):
            rows = rows.filter(is_read=False)
        return page(rows, args["limit"], args["offset"], notification_result)
    if operation == "get_notification":
        return notification_result(notification_for(user, args["notification_id"]))
    raise ValueError("Unknown read operation.")
