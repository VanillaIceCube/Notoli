"""Small MCP boundary around Notoli's existing querysets and write services."""

from django.core.exceptions import PermissionDenied
from django.db import transaction
from rest_framework.exceptions import APIException

from notes.models import Board
from notes.serializers import UserSummarySerializer
from notes.views import BoardViewSet, ListViewSet, NoteViewSet

from .adapters import accessible_list, item_result, page, view_for
from .coverage import OPERATIONS, execute_feature
from .oauth import ConnectionPermissionDenied, required_scopes, resolve_token


def execute(raw_token, operation, **arguments):
    scopes = required_scopes(operation)
    with transaction.atomic():
        token = resolve_token(raw_token)
        if not token.is_valid(scopes):
            raise ConnectionPermissionDenied(
                f"This connection lacks required permissions. Reconnect with {' '.join(scopes)}.",
                "insufficient_scope",
            )
        user = token.user
        if operation in OPERATIONS:
            return execute_feature(user, operation, arguments)
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
        if operation in {
            "get_board_collaborators",
            "add_board_collaborator",
            "remove_board_collaborator",
        }:
            board = (
                Board.objects.accessible_to(user)
                .select_related("owner")
                .filter(pk=arguments["board_id"])
                .first()
            )
            if board is None:
                raise PermissionDenied("Board not found or no longer accessible.")
            if operation == "get_board_collaborators":
                return {
                    "board_id": board.pk,
                    "board_name": board.name,
                    "sharing_level": "board",
                    "can_manage_collaborators": board.owner_id == user.pk,
                    "owner": dict(UserSummarySerializer(board.owner).data),
                    **page(
                        board.collaborators.order_by("username", "id"),
                        arguments["limit"],
                        arguments["offset"],
                        lambda member: dict(UserSummarySerializer(member).data),
                    ),
                }
            view = view_for(
                BoardViewSet, user, data={"identifier": arguments.get("identifier")}
            )
            view.kwargs = {"pk": board.pk}
            try:
                if operation == "add_board_collaborator":
                    response = view.add_collaborator(view.request, pk=board.pk)
                else:
                    response = view.remove_collaborator(
                        view.request, pk=board.pk, user_id=arguments["user_id"]
                    )
            except APIException as error:
                if error.status_code == 400:
                    raise ValueError(
                        f"Notoli rejected the sharing change: {error.detail}"
                    ) from None
                raise PermissionDenied(str(error.detail)) from None
            if response.status_code >= 400:
                raise ValueError(
                    response.data.get("error", "Notoli rejected the sharing change.")
                )
            return {
                "board_id": board.pk,
                "board_name": board.name,
                "sharing_level": "board",
                "action": "added"
                if operation == "add_board_collaborator"
                else "removed",
            }
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
