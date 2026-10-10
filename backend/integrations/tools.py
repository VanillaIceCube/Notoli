"""Small MCP boundary around Notoli's existing querysets and write services."""

from types import SimpleNamespace

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.db import transaction
from rest_framework.exceptions import APIException

from notes.models import Board
from notes.views import BoardViewSet, ListViewSet, NoteViewSet

from .oauth import ConnectionPermissionDenied, resolve_token


def view_for(view_class, user, data=None, query=None):
    view = view_class()
    view.request = SimpleNamespace(user=user, data=data or {}, query_params=query or {})
    view.format_kwarg = None
    return view


def accessible_list(user, list_id):
    # Recheck board membership even for an item's original creator after removal.
    result = (
        view_for(ListViewSet, user)
        .get_queryset()
        .filter(pk=list_id, board__in=Board.objects.accessible_to(user))
        .first()
    )
    if result is None:
        raise PermissionDenied("List not found or no longer accessible.")
    return result


def item_result(note, list_id):
    return {
        "id": note.pk,
        "list_id": list_id,
        "board_id": note.board_id,
        "note": note.note,
        "description": note.description,
        "status": note.status,
        "updated_at": note.updated_at.isoformat(),
        "url": f"{settings.FRONTEND_BASE_URL.rstrip('/')}/board/{note.board_id}/list/{list_id}",
    }


def page(queryset, limit, offset, serialize):
    results = list(queryset[offset : offset + limit + 1])
    return {
        "results": [serialize(row) for row in results[:limit]],
        "next_offset": offset + limit if len(results) > limit else None,
    }


def execute(raw_token, operation, **arguments):
    scope = (
        "notoli:write" if operation in {"add_item", "update_item"} else "notoli:read"
    )
    with transaction.atomic():
        token = resolve_token(raw_token)
        if not token.is_valid([scope]):
            raise ConnectionPermissionDenied(
                "This connection does not have write permission. Reconnect with notoli:write.",
                "insufficient_scope",
            )
        user = token.user
        if operation == "list_boards":
            rows = view_for(BoardViewSet, user).get_queryset().order_by("id")
            if arguments["query"]:
                rows = rows.filter(name__icontains=arguments["query"])
            return page(
                rows,
                arguments["limit"],
                arguments["offset"],
                lambda b: {
                    "id": b.pk,
                    "name": b.name,
                    "description": b.description,
                },
            )
        if operation == "list_lists":
            board_id = arguments["board_id"]
            if not Board.objects.accessible_to(user).filter(pk=board_id).exists():
                raise PermissionDenied("Board not found or no longer accessible.")
            rows = view_for(ListViewSet, user, query={"board": board_id}).get_queryset()
            return page(
                rows,
                arguments["limit"],
                arguments["offset"],
                lambda row: {
                    "id": row.pk,
                    "board_id": row.board_id,
                    "name": row.name,
                    "description": row.description,
                },
            )
        note_list = accessible_list(user, arguments["list_id"])
        view = view_for(
            NoteViewSet, user, query={"list": note_list.pk, "board": note_list.board_id}
        )
        if operation == "get_items":
            rows = view.get_queryset()
            return page(
                rows,
                arguments["limit"],
                arguments["offset"],
                lambda row: item_result(row, note_list.pk),
            )
        if operation == "add_item":
            data = {
                "list": note_list.pk,
                "note": arguments["note"],
                "description": arguments["description"],
            }
            view.request.data = data
            serializer = view.get_serializer(data=data)
            save = view.perform_create
        elif operation == "update_item":
            item = view.get_queryset().filter(pk=arguments["item_id"]).first()
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
                raise ValueError("Provide note, description, or status to update.")
            view.request.data = data
            serializer = view.get_serializer(item, data=data, partial=True)
            save = view.perform_update
        else:
            raise ValueError("Unknown tool.")
        try:
            serializer.is_valid(raise_exception=True)
            save(serializer)
        except APIException as error:
            raise ValueError(f"Notoli rejected the change: {error.detail}") from None
        return item_result(serializer.instance, note_list.pk)
