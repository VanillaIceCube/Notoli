from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Note, TodoList, Workspace
from .serializers import NoteSerializer, TodoListSerializer, WorkspaceSerializer

User = get_user_model()


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


class WorkspaceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        return Workspace.objects.accessible_to(self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, created_by=self.request.user)

    def perform_update(self, serializer):
        self._require_owner(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._require_owner(instance)
        instance.delete()

    def _require_owner(self, workspace):
        if workspace.owner_id != self.request.user.id:
            raise PermissionDenied("Only the workspace owner can manage access.")

    def _find_collaborator(self, identifier):
        identifier = identifier.strip() if isinstance(identifier, str) else ""
        if not identifier:
            return None
        return User.objects.filter(
            Q(username__iexact=identifier) | Q(email__iexact=identifier)
        ).first()

    @action(detail=True, methods=["post"], url_path="collaborators")
    def add_collaborator(self, request, pk=None):
        workspace = self.get_object()
        self._require_owner(workspace)
        user = self._find_collaborator(request.data.get("identifier"))
        if user is None:
            return Response(
                {"error": "No user found for that username or email."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if user.id == workspace.owner_id:
            return Response(
                {"error": "The workspace owner already has access."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if workspace.collaborators.filter(pk=user.pk).exists():
            return Response(
                {"error": "That user is already a collaborator."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        workspace.collaborators.add(user)
        serializer = self.get_serializer(workspace)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True, methods=["delete"], url_path="collaborators/(?P<user_id>[^/.]+)"
    )
    def remove_collaborator(self, request, pk=None, user_id=None):
        workspace = self.get_object()
        self._require_owner(workspace)
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "Invalid collaborator."}, status=status.HTTP_400_BAD_REQUEST
            )
        if user_id == workspace.owner_id:
            return Response(
                {"error": "The workspace owner cannot be removed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not workspace.collaborators.filter(pk=user_id).exists():
            return Response(
                {"error": "That user is not a collaborator."},
                status=status.HTTP_404_NOT_FOUND,
            )
        workspace.collaborators.remove(user_id)
        serializer = self.get_serializer(workspace)
        return Response(serializer.data, status=status.HTTP_200_OK)


class TodoListViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TodoListSerializer

    def get_queryset(self):
        user = self.request.user

        # Workspace membership is sufficient to see child lists; item-level
        # ownership/collaborators remain additive for lists shared outside the
        # workspace.
        queryset = TodoList.objects.filter(
            Q(owner=user)
            | Q(created_by=user)
            | Q(collaborators=user)
            | Q(workspace__owner=user)
            | Q(workspace__created_by=user)
            | Q(workspace__collaborators=user)
        )

        # Adding additional querying capabilities by ?workspace=ID
        workspace_id = self.request.query_params.get("workspace")
        if workspace_id:
            _require_workspace_filter_access(user, workspace_id, queryset)
            queryset = queryset.filter(workspace_id=workspace_id)

        return queryset.distinct()

    def perform_create(self, serializer):
        # Require workspace upon creation
        workspace_id = self.request.data.get("workspace")
        workspace = get_object_or_404(Workspace, pk=workspace_id)

        # Ensure user access to specified workspace
        if (
            not Workspace.objects.accessible_to(self.request.user)
            .filter(pk=workspace.pk)
            .exists()
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
            Q(owner=user)
            | Q(created_by=user)
            | Q(collaborators=user)
            | Q(workspace__owner=user)
            | Q(workspace__created_by=user)
            | Q(workspace__collaborators=user)
        )

        # Adding additional querying capabilities by ?workspace=ID
        workspace_id = self.request.query_params.get("workspace")
        if workspace_id:
            _require_workspace_filter_access(user, workspace_id, queryset)
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
            if not TodoList.objects.filter(
                Q(pk=todo_list.pk)
                & (
                    Q(owner=self.request.user)
                    | Q(created_by=self.request.user)
                    | Q(collaborators=self.request.user)
                    | Q(workspace__owner=self.request.user)
                    | Q(workspace__created_by=self.request.user)
                    | Q(workspace__collaborators=self.request.user)
                )
            ).exists():
                raise PermissionDenied("You cannot add notes to this todo-list.")

        # Ensure user access to specified workspace (when creating a workspace-scoped note).
        if todo_list is None and workspace is not None:
            if (
                not Workspace.objects.accessible_to(self.request.user)
                .filter(pk=workspace.pk)
                .exists()
            ):
                raise PermissionDenied("You cannot add notes to this workspace.")

        serializer.save(owner=self.request.user, created_by=self.request.user)
