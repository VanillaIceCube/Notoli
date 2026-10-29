"""Shared adapters to existing REST services and bounded MCP results."""

from types import SimpleNamespace

from django.conf import settings
from django.core.exceptions import PermissionDenied

from notes.models import Board
from notes.views import ListViewSet


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
        "url": f"{settings.FRONTEND_BASE_URL.rstrip('/')}/board/{note.board_id}"
        + (f"/list/{list_id}" if list_id is not None else ""),
    }


def page(queryset, limit, offset, serialize):
    results = list(queryset[offset : offset + limit + 1])
    return {
        "results": [serialize(row) for row in results[:limit]],
        "next_offset": offset + limit if len(results) > limit else None,
    }
