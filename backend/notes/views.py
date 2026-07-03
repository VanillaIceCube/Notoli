from django.db.models import IntegerField, OuterRef, Q, Subquery, Value
from django.db import transaction
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Note, TodoList, TodoListNotePosition, Workspace
from .serializers import NoteSerializer, TodoListSerializer, WorkspaceSerializer


def _require_workspace_access(user, workspace_id):
    try:
        workspace_id = int(workspace_id)
    except (TypeError, ValueError):
        raise NotFound("Workspace not found.")

    # Prefer 404 for non-existent workspaces and 403 for existing-but-inaccessible workspaces.
    if not Workspace.objects.filter(pk=workspace_id).exists():
        raise NotFound("Workspace not found.")

    accessible_workspaces = Workspace.objects.accessible_to(user)
    if not accessible_workspaces.filter(pk=workspace_id).exists():
        raise PermissionDenied("You do not have access to this workspace.")


def _require_workspace_filter_access(user, workspace_id, base_queryset):
    """
    Workspace filters should not be stricter than item-level permissions.

    Allow `?workspace=` if:
    - The workspace exists AND the user is a workspace-level member (owner/creator/collaborator), OR
    - The user has any item-level access within that workspace (e.g., note/todolist collaborator).
    """
    try:
        workspace_id = int(workspace_id)
    except (TypeError, ValueError):
        raise NotFound("Workspace not found.")

    if not Workspace.objects.filter(pk=workspace_id).exists():
        raise NotFound("Workspace not found.")

    if Workspace.objects.accessible_to(user).filter(pk=workspace_id).exists():
        return

    if base_queryset.filter(workspace_id=workspace_id).exists():
        return

    raise PermissionDenied("You do not have access to this workspace.")


def _ordered_ids_from_request(request):
    ordered_ids = request.data.get("ordered_ids")
    if not isinstance(ordered_ids, list) or not ordered_ids:
        return None, Response(
            {"ordered_ids": ["This field must be a non-empty list."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        return [int(item_id) for item_id in ordered_ids], None
    except (TypeError, ValueError):
        return None, Response(
            {"ordered_ids": ["All ids must be integers."]},
            status=status.HTTP_400_BAD_REQUEST,
        )


def _bulk_reorder(queryset, ordered_ids):
    scoped_items = list(queryset)
    scoped_ids = {item.id for item in scoped_items}
    if scoped_ids != set(ordered_ids):
        return Response(
            {
                "ordered_ids": [
                    "ordered_ids must include every id in this reorder scope."
                ]
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    item_by_id = {item.id: item for item in scoped_items}
    with transaction.atomic():
        for index, item_id in enumerate(ordered_ids):
            item = item_by_id[item_id]
            item.position = index
            item.save(update_fields=["position", "updated_at"])
    return None


def _order_notes_for_todolist(queryset, todo_list_id):
    note_position = TodoListNotePosition.objects.filter(
        todo_list_id=todo_list_id, note_id=OuterRef("pk")
    ).values("position")[:1]
    return queryset.filter(todolists__id=todo_list_id).annotate(
        todo_list_position=Coalesce(
            Subquery(note_position, output_field=IntegerField()),
            Value(999999),
        )
    )


def _bulk_reorder_todolist_notes(todo_list_id, queryset, ordered_ids):
    scoped_items = list(queryset)
    scoped_ids = {item.id for item in scoped_items}
    if scoped_ids != set(ordered_ids):
        return Response(
            {
                "ordered_ids": [
                    "ordered_ids must include every id in this reorder scope."
                ]
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        for index, note_id in enumerate(ordered_ids):
            TodoListNotePosition.objects.update_or_create(
                todo_list_id=todo_list_id,
                note_id=note_id,
                defaults={"position": index},
            )
    return None


def _ensure_todolist_note_position(todo_list, note):
    next_position = TodoListNotePosition.objects.filter(todo_list=todo_list).count()
    TodoListNotePosition.objects.get_or_create(
        todo_list=todo_list,
        note=note,
        defaults={"position": next_position},
    )


class WorkspaceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        return Workspace.objects.accessible_to(self.request.user)

    def perform_create(self, serializer):
        next_position = self.get_queryset().count()
        serializer.save(
            owner=self.request.user,
            created_by=self.request.user,
            position=next_position,
        )

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request):
        ordered_ids, error_response = _ordered_ids_from_request(request)
        if error_response is not None:
            return error_response
        queryset = self.get_queryset()
        error_response = _bulk_reorder(queryset, ordered_ids)
        if error_response is not None:
            return error_response
        serializer = self.get_serializer(
            queryset.filter(id__in=ordered_ids).order_by(
                "position", "created_at", "id"
            ),
            many=True,
        )
        return Response(serializer.data)


class TodoListViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TodoListSerializer

    def get_queryset(self):
        user = self.request.user

        # Base queryset. Lists what the user owner/creator/collaborators on
        queryset = TodoList.objects.filter(
            Q(owner=user) | Q(created_by=user) | Q(collaborators=user)
        )

        # Adding additional querying capabilities by ?workspace=ID
        workspace_id = self.request.query_params.get("workspace")
        if workspace_id:
            _require_workspace_filter_access(user, workspace_id, queryset)
            queryset = queryset.filter(workspace_id=workspace_id)

        return queryset.distinct().order_by("position", "created_at", "id")

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request):
        workspace_id = request.data.get("workspace") or request.query_params.get(
            "workspace"
        )
        if not workspace_id:
            return Response(
                {"workspace": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _require_workspace_filter_access(
            request.user, workspace_id, self.get_queryset()
        )
        ordered_ids, error_response = _ordered_ids_from_request(request)
        if error_response is not None:
            return error_response
        queryset = self.get_queryset().filter(workspace_id=workspace_id)
        error_response = _bulk_reorder(queryset, ordered_ids)
        if error_response is not None:
            return error_response
        serializer = self.get_serializer(
            queryset.filter(id__in=ordered_ids).order_by(
                "position", "created_at", "id"
            ),
            many=True,
        )
        return Response(serializer.data)

    def perform_create(self, serializer):
        # Require workspace upon creation
        workspace_id = self.request.data.get("workspace")
        workspace = get_object_or_404(Workspace, pk=workspace_id)

        # Ensure user access to specified workspace
        if not (
            workspace.owner == self.request.user
            or self.request.user in workspace.collaborators.all()
        ):
            raise PermissionDenied("You cannot add todo-lists to this workspace.")

        next_position = TodoList.objects.filter(workspace=workspace).count()
        serializer.save(
            owner=self.request.user,
            created_by=self.request.user,
            workspace=workspace,
            position=next_position,
        )


class NoteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NoteSerializer

    # Base queryset. Lists what the user owner/creator/collaborators on
    def get_queryset(self):
        user = self.request.user

        queryset = Note.objects.filter(
            Q(owner=user) | Q(created_by=user) | Q(collaborators=user)
        )

        # Adding additional querying capabilities by ?workspace=ID
        workspace_id = self.request.query_params.get("workspace")
        if workspace_id:
            _require_workspace_filter_access(user, workspace_id, queryset)
            queryset = queryset.filter(workspace_id=workspace_id)

        # Adding additional querying capabilities by ?todolist=ID
        todo_list_id = self.request.query_params.get("todo_list")
        if todo_list_id:
            queryset = _order_notes_for_todolist(queryset, todo_list_id)
            return queryset.distinct().order_by(
                "todo_list_position", "position", "created_at", "id"
            )

        return queryset.distinct().order_by("position", "created_at", "id")

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request):
        todo_list_id = request.data.get("todo_list") or request.query_params.get(
            "todo_list"
        )
        if not todo_list_id:
            return Response(
                {"todo_list": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ordered_ids, error_response = _ordered_ids_from_request(request)
        if error_response is not None:
            return error_response
        queryset = _order_notes_for_todolist(self.get_queryset(), todo_list_id)
        error_response = _bulk_reorder_todolist_notes(
            todo_list_id, queryset, ordered_ids
        )
        if error_response is not None:
            return error_response
        serializer = self.get_serializer(
            queryset.filter(id__in=ordered_ids).order_by(
                "todo_list_position", "position", "created_at", "id"
            ),
            many=True,
        )
        return Response(serializer.data)

    def perform_create(self, serializer):
        todo_list = serializer.validated_data.get("todo_list")
        workspace = serializer.validated_data.get("workspace")

        # Ensure user access to specified todo-list (when provided).
        if todo_list is not None:
            if not (
                todo_list.owner == self.request.user
                or self.request.user in todo_list.collaborators.all()
            ):
                raise PermissionDenied("You cannot add notes to this todo-list.")

        # Ensure user access to specified workspace (when creating a workspace-scoped note).
        if todo_list is None and workspace is not None:
            if not (
                workspace.owner == self.request.user
                or self.request.user in workspace.collaborators.all()
            ):
                raise PermissionDenied("You cannot add notes to this workspace.")

        effective_workspace = workspace or getattr(todo_list, "workspace", None)
        scope_queryset = Note.objects.filter(workspace=effective_workspace)
        if todo_list is not None:
            scope_queryset = scope_queryset.filter(todolists=todo_list)
        next_position = scope_queryset.count()
        note = serializer.save(
            owner=self.request.user,
            created_by=self.request.user,
            position=next_position,
        )
        if todo_list is not None:
            _ensure_todolist_note_position(todo_list, note)
