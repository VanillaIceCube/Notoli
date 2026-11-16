"""Pure domain-shaped formatting, bounded text and adaptive result pages."""

import json

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder


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


MAX_RESULT_BYTES = 32768
MAX_PAGE_BYTES = 24576  # Leave space for collaborator-page board/owner metadata.
MAX_TEXT_BYTES = 4096
MAX_NODES = 6000
MAX_DEPTH = 6


class ResultLimitExceeded(ValueError):
    def __init__(self):
        super().__init__(
            "Result exceeds the MCP detail budget. Narrow the request or review full details in Notoli."
        )


def encoded_size(value):
    return len(json.dumps(value, allow_nan=False).encode("utf-8"))


def bounded_result(value, *, mutation=False, maximum=MAX_RESULT_BYTES, shrink=True):
    """Retain required domain fields; mark clipped text without losing success.

    Domain shapes are shallow and contain at most 1,000 ordered IDs. Unexpected
    structural expansion fails before the invocation transaction can commit.
    """
    for text_limit in [MAX_TEXT_BYTES, 1024, 256] if shrink else [MAX_TEXT_BYTES]:
        nodes = 0
        truncated = bool(value.get("truncated", False))

        def trim(item, depth=0):
            nonlocal nodes, truncated
            nodes += 1
            if nodes > MAX_NODES or depth > MAX_DEPTH:
                raise ResultLimitExceeded()
            if isinstance(item, str):
                # Slice before encoding so oversized database text cannot create
                # a second unbounded temporary string during representation.
                clipped = (
                    item[:text_limit]
                    .encode("utf-8")[:text_limit]
                    .decode("utf-8", errors="ignore")
                )
                truncated |= clipped != item
                return clipped
            if isinstance(item, dict):
                if len(item) > 32:
                    raise ResultLimitExceeded()
                return {key: trim(child, depth + 1) for key, child in item.items()}
            if isinstance(item, (list, tuple)):
                if len(item) > 1000:
                    raise ResultLimitExceeded()
                return [trim(child, depth + 1) for child in item]
            return item

        output = trim(value)
        if truncated:
            output.update(
                truncated=True,
                detail=(
                    "Change completed. Some returned text is truncated; inspect the existing record in Notoli. Do not repeat the mutation to recover detail."
                    if mutation
                    else "Some returned text is truncated. Review full details in Notoli before editing; follow next_offset for remaining records."
                ),
            )
            if mutation:
                output["applied"] = True
        if encoded_size(output) <= maximum:
            return output
    raise ResultLimitExceeded()


def page(queryset, limit, offset, serialize):
    if (
        type(limit) is not int
        or not 1 <= limit <= 100
        or type(offset) is not int
        or offset < 0
    ):
        raise ValueError("Use a valid bounded page.")
    records = list(queryset[offset : offset + limit + 1])
    selected = records[:limit]
    while True:
        output = {
            "results": [serialize(row) for row in selected],
            "next_offset": offset + len(selected)
            if len(records) > len(selected)
            else None,
        }
        try:
            return bounded_result(
                output, maximum=MAX_PAGE_BYTES, shrink=len(selected) <= 1
            )
        except ResultLimitExceeded:
            if len(selected) <= 1:
                raise
            selected = selected[: max(1, len(selected) // 2)]


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


def json_value(value, maximum=65536):
    encoded = json.dumps(
        value,
        cls=DjangoJSONEncoder,
        sort_keys=True,
        allow_nan=False,
        ensure_ascii=False,
    )
    if len(encoded.encode()) > maximum:
        raise ValueError(
            "Exact action exceeds the preview budget. Use Notoli to review this change."
        )
    return json.loads(encoded)
