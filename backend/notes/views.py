from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q
from django.shortcuts import get_object_or_404
from .models import Workspace, TodoList, Note
from .serializers import WorkspaceSerializer, TodoListSerializer, NoteSerializer


class WorkspaceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        user = self.request.user
        return Workspace.objects.filter(
            Q(owner=user) | Q(created_by=user) | Q(collaborators=user)
        ).distinct()

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, created_by=self.request.user)


class TodoListViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TodoListSerializer

    def get_queryset(self):
        user = self.request.user

        # Base queryset. Lists what the user ownes/created/collaborates on
        queryset = TodoList.objects.filter(
            Q(owner=user) | Q(created_by=user) | Q(collaborators=user)
        ).distinct()

        # Adding additional querying capabilities by ?workspace=ID
        workspace_id = self.request.query_params.get('workspace')
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)

        return queryset.distinct()

    def perform_create(self, serializer):
        # Require workspace upon creation
        workspace_id = self.request.data.get('workspace')
        workspace = get_object_or_404(Workspace, pk=workspace_id)

        # Ensure user access to specified workspace
        if not (
            workspace.owner == self.request.user
            or self.request.user in workspace.collaborators.all()
        ):
            raise PermissionDenied("You cannot add todo-lists to this worspace.")

        serializer.save(owner=self.request.user, created_by=self.request.user, workspace=workspace)


class NoteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NoteSerializer

    def get_queryset(self):
        user = self.request.user
        return Note.objects.filter(
            Q(owner=user) | Q(created_by=user) | Q(collaborators=user)
        ).distinct()

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, created_by=self.request.user)
