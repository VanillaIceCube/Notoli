"""HTTP serialization around the shared board, list, and task domain operations."""

from collections.abc import Mapping

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response

from . import services
from .serializers import BoardSerializer, ListSerializer, TaskSerializer


class RejectRetiredTaskFields:
    """Reject retired task fields before REST writes can change records."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method in SAFE_METHODS or not isinstance(request.data, Mapping):
            return

        errors = {
            field: ["This field has been removed."]
            for field in ("note", "notes", "note_text")
            if field in request.data
        }
        if errors:
            raise ValidationError(errors)


class BoardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BoardSerializer

    def get_queryset(self):
        return services.boards_for(self.request.user)

    def perform_create(self, serializer):
        serializer.instance = services.create_board(
            self.request.user, serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.update_board(
            self.request.user, serializer.validated_data, serializer.instance
        )

    def perform_destroy(self, instance):
        services.delete_board(self.request.user, instance)

    @action(detail=True, methods=["post"], url_path="collaborators")
    def add_collaborator(self, request, pk=None):
        board = services.add_collaborator(
            request.user, self.get_object().pk, request.data.get("identifier")
        )
        return Response(self.get_serializer(board).data)

    @action(
        detail=True, methods=["delete"], url_path="collaborators/(?P<user_id>[^/.]+)"
    )
    def remove_collaborator(self, request, pk=None, user_id=None):
        board = services.remove_collaborator(
            request.user, self.get_object().pk, user_id
        )
        return Response(self.get_serializer(board).data)


class ListViewSet(RejectRetiredTaskFields, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ListSerializer

    def get_queryset(self):
        return services.lists_for(
            self.request.user, board_id=self.request.query_params.get("board")
        )

    def perform_create(self, serializer):
        serializer.instance = services.create_list(
            self.request.user, serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.update_list(
            self.request.user, serializer.validated_data, serializer.instance
        )

    def perform_destroy(self, instance):
        services.delete_list(self.request.user, instance)

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request):
        rows = services.reorder_lists(
            request.user, request.data.get("board"), request.data.get("ordered_ids")
        )
        return Response(self.get_serializer(rows, many=True).data)


class TaskViewSet(RejectRetiredTaskFields, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TaskSerializer

    def get_queryset(self):
        return services.tasks_for(
            self.request.user,
            board_id=self.request.query_params.get("board"),
            list_id=self.request.query_params.get("list"),
        )

    def perform_create(self, serializer):
        serializer.instance = services.create_task(
            self.request.user, serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.update_task(
            self.request.user, serializer.validated_data, serializer.instance
        )

    def perform_destroy(self, instance):
        services.delete_task(self.request.user, instance)

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request):
        rows = services.reorder_tasks(
            request.user, request.data.get("list"), request.data.get("ordered_ids")
        )
        return Response(self.get_serializer(rows, many=True).data)
