"""Read-only Notoli queries and authoritative actor-scoped lookups."""

from django.core.exceptions import PermissionDenied
from rest_framework.exceptions import APIException

from apps.notes import services as notes
from apps.notes.models import Board, List, ListNote, Note
from apps.notes.serializers import UserSummarySerializer
from apps.notifications import services as notifications

from .results import item_result, json_value, notification_result, page, summary

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


def selected_rows(queryset):
    rows = list(queryset[:201])
    if len(rows) > 200:
        raise ValueError(
            "At most 200 affected records per collection can be approved. Use Notoli for larger changes."
        )
    return rows


def _profile(user):
    return {
        "id": user.pk,
        "username": user.get_username(),
        "email": user.email,
        "is_active": user.is_active,
    }


def snapshot(user, action, args, selected_ids):
    """Lock the board before reading its complete, never clipped impact."""
    if action in {"delete_notification", "clear_notifications"}:
        rows = notifications.notifications_for(user).select_for_update()
        ids = (
            [args["notification_id"]]
            if action == "delete_notification"
            else selected_ids
        )
        data = selected_rows(rows.filter(pk__in=ids).order_by("pk").values())
        if len(data) != len(ids):
            raise PermissionDenied(
                "Notification selection changed or is no longer yours."
            )
        return json_value({"notifications": data}, 262144)
    if "list_id" in args:
        note_list = accessible_list(user, args["list_id"])
        board_id = note_list.board_id
    else:
        board_id = args["board_id"]
    board = notes._locked_board(user, board_id)
    if action in {
        "delete_board",
        "add_board_collaborator",
        "remove_board_collaborator",
    }:
        notes.require_owner(user, board)
    current = {
        "board": Board.objects.values().get(pk=board.pk),
        "owner": _profile(board.owner),
        "collaborators": [
            _profile(row) for row in selected_rows(board.collaborators.order_by("pk"))
        ],
    }
    lists = List.objects.filter(board=board).order_by("pk")
    items = Note.objects.filter(board=board).order_by("pk")
    memberships = ListNote.objects.filter(list__board=board).order_by("pk")
    if action in {"delete_list", "set_list_items"}:
        lists = lists.filter(pk=args["list_id"])
        memberships = memberships.filter(list_id=args["list_id"])
        item_ids = list(memberships.values_list("note_id", flat=True)[:201])
        if action == "set_list_items":
            if len(args["item_ids"]) > 200:
                raise ValueError("Use Notoli for more than 200 replacement items.")
            if items.filter(pk__in=args["item_ids"]).count() != len(args["item_ids"]):
                raise PermissionDenied("Replacement items must belong to this board.")
            item_ids += args["item_ids"]
        items = items.filter(pk__in=item_ids)
    elif action == "delete_item":
        item_for(user, board.pk, args["item_id"])
        items = items.filter(pk=args["item_id"])
        memberships = memberships.filter(note_id=args["item_id"])
        lists = lists.filter(pk__in=memberships.values("list_id"))
    current.update(
        lists=selected_rows(lists.values()),
        items=selected_rows(items.values()),
        memberships=selected_rows(memberships.values()),
    )
    if action == "add_board_collaborator":
        try:
            target = notes.find_collaborator(args["identifier"])
        except APIException:
            from .operations import OperationError

            raise OperationError(
                "That username or email matches multiple accounts. Use an unambiguous username or email."
            ) from None
        if target is None:
            raise ValueError("No user found for that username or email.")
        target = type(target).objects.select_for_update().get(pk=target.pk)
        if (
            target.pk == board.owner_id
            or board.collaborators.filter(pk=target.pk).exists()
        ):
            raise ValueError("That account already has board access.")
        current["sharing_target"] = _profile(target)
    elif action == "remove_board_collaborator":
        target = (
            board.collaborators.select_for_update().filter(pk=args["user_id"]).first()
        )
        if target is None or target.pk == board.owner_id:
            raise ValueError("That account is not a removable collaborator.")
        current["sharing_target"] = _profile(target)
    return json_value(current, 262144)


def require_replay_access(user, action, output):
    """Cached shared-board data still requires present access, not an old grant."""
    if action in {"create_board", "update_board", "reorder_lists"}:
        board_for(user, output["id"])
    elif "board_id" in output and action not in {"update_notification"}:
        board_for(user, output["board_id"])
    elif action in {"reorder_items", "set_list_items"}:
        accessible_list(user, output["id"])


def removes_memberships(user, list_id, item_ids):
    """Check the live set after the writer/board lock, never a caller's preview."""
    note_list = accessible_list(user, list_id)
    notes._locked_board(user, note_list.board_id)
    note_list = accessible_list(user, list_id)
    return note_list.note_memberships.exclude(note_id__in=item_ids).exists()
