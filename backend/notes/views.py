from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated

from .models import Note, TodoList, Workspace
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


class WorkspaceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        return Workspace.objects.accessible_to(self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, created_by=self.request.user)


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
            _require_workspace_access(user, workspace_id)
            queryset = queryset.filter(workspace_id=workspace_id)

        return queryset.distinct()

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

        serializer.save(
            owner=self.request.user, created_by=self.request.user, workspace=workspace
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
            _require_workspace_access(user, workspace_id)
            queryset = queryset.filter(workspace_id=workspace_id)

        # Adding additional querying capabilities by ?todolist=ID
        todo_list_id = self.request.query_params.get("todo_list")
        if todo_list_id:
            queryset = queryset.filter(todolists__id=todo_list_id)

        return queryset.distinct()

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

        serializer.save(owner=self.request.user, created_by=self.request.user)
