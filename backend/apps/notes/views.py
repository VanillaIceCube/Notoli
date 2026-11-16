"""HTTP serialization around the shared notes domain operations."""

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import services
from .serializers import BoardSerializer, ListSerializer, NoteSerializer


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


class ListViewSet(viewsets.ModelViewSet):
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


class NoteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NoteSerializer

    def get_queryset(self):
        return services.notes_for(
            self.request.user,
            board_id=self.request.query_params.get("board"),
            list_id=self.request.query_params.get("list"),
        )

    def perform_create(self, serializer):
        serializer.instance = services.create_note(
            self.request.user, serializer.validated_data
        )

    def perform_update(self, serializer):
        serializer.instance = services.update_note(
            self.request.user, serializer.validated_data, serializer.instance
        )

    def perform_destroy(self, instance):
        services.delete_note(self.request.user, instance)

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request):
        rows = services.reorder_notes(
            request.user, request.data.get("list"), request.data.get("ordered_ids")
        )
        return Response(self.get_serializer(rows, many=True).data)
