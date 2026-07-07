from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max, Q
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Board, ListNote, Note
from .models import List as NoteList
from .serializers import BoardSerializer, ListSerializer, NoteSerializer

User = get_user_model()


def _require_board_access(user, board_id):
    try:
        board_id = int(board_id)
    except (TypeError, ValueError):
        raise NotFound("Board not found.")

    # Prefer 404 for non-existent boards and 403 for existing-but-inaccessible boards.
    if not Board.objects.filter(pk=board_id).exists():
        raise NotFound("Board not found.")

    accessible_boards = Board.objects.accessible_to(user)
    if not accessible_boards.filter(pk=board_id).exists():
        raise PermissionDenied("You do not have access to this board.")


def _require_board_filter_access(user, board_id, _base_queryset=None):
    """
    Allow `?board=` only when the board exists and the user is a
    board-level member.
    """
    try:
        board_id = int(board_id)
    except (TypeError, ValueError):
        raise NotFound("Board not found.")

    if not Board.objects.filter(pk=board_id).exists():
        raise NotFound("Board not found.")

    if Board.objects.accessible_to(user).filter(pk=board_id).exists():
        return

    raise PermissionDenied("You do not have access to this board.")


def _ordered_ids_from_request(request):
    ordered_ids = request.data.get("ordered_ids")
    if not isinstance(ordered_ids, list) or not ordered_ids:
        return None, Response(
            {"ordered_ids": ["Provide a non-empty list of ids."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        ordered_ids = [int(item_id) for item_id in ordered_ids]
    except (TypeError, ValueError):
        return None, Response(
            {"ordered_ids": ["All ids must be integers."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(ordered_ids) != len(set(ordered_ids)):
        return None, Response(
            {"ordered_ids": ["Duplicate ids are not allowed."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return ordered_ids, None


class BoardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BoardSerializer

    def get_queryset(self):
        return Board.objects.accessible_to(self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, created_by=self.request.user)

    def perform_update(self, serializer):
        self._require_owner(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._require_owner(instance)
        instance.delete()

    def _require_owner(self, board):
        if board.owner_id != self.request.user.id:
            raise PermissionDenied("Only the board owner can manage access.")

    def _find_collaborator(self, identifier):
        identifier = identifier.strip() if isinstance(identifier, str) else ""
        if not identifier:
            return None
        return User.objects.filter(
            Q(username__iexact=identifier) | Q(email__iexact=identifier)
        ).first()

    @action(detail=True, methods=["post"], url_path="collaborators")
    def add_collaborator(self, request, pk=None):
        board = self.get_object()
        self._require_owner(board)
        user = self._find_collaborator(request.data.get("identifier"))
        if user is None:
            return Response(
                {"error": "No user found for that username or email."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if user.id == board.owner_id:
            return Response(
                {"error": "The board owner already has access."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if board.collaborators.filter(pk=user.pk).exists():
            return Response(
                {"error": "That user is already a collaborator."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        board.collaborators.add(user)
        serializer = self.get_serializer(board)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True, methods=["delete"], url_path="collaborators/(?P<user_id>[^/.]+)"
    )
    def remove_collaborator(self, request, pk=None, user_id=None):
        board = self.get_object()
        self._require_owner(board)
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "Invalid collaborator."}, status=status.HTTP_400_BAD_REQUEST
            )
        if user_id == board.owner_id:
            return Response(
                {"error": "The board owner cannot be removed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not board.collaborators.filter(pk=user_id).exists():
            return Response(
                {"error": "That user is not a collaborator."},
                status=status.HTTP_404_NOT_FOUND,
            )
        board.collaborators.remove(user_id)
        serializer = self.get_serializer(board)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ListViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ListSerializer

    def get_queryset(self):
        user = self.request.user

        queryset = NoteList.objects.filter(
            Q(created_by=user)
            | Q(board__owner=user)
            | Q(board__created_by=user)
            | Q(board__collaborators=user)
        )

        # Adding additional querying capabilities by ?board=ID
        board_id = self.request.query_params.get("board")
        if board_id:
            _require_board_filter_access(user, board_id, queryset)
            queryset = queryset.filter(board_id=board_id)

        return queryset.distinct().order_by("position", "created_at", "id")

    def perform_create(self, serializer):
        # Require board upon creation
        board_id = self.request.data.get("board")
        board = get_object_or_404(Board, pk=board_id)

        # Ensure user access to specified board
        if (
            not Board.objects.accessible_to(self.request.user)
            .filter(pk=board.pk)
            .exists()
        ):
            raise PermissionDenied("You cannot add lists to this board.")

        max_position = NoteList.objects.filter(board=board).aggregate(
            Max("position")
        )["position__max"]
        next_position = (max_position if max_position is not None else -1) + 1

        serializer.save(
            created_by=self.request.user,
            board=board,
            position=next_position,
        )

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request):
        board_id = request.data.get("board")
        if board_id is None:
            return Response(
                {"board": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ordered_ids, error_response = _ordered_ids_from_request(request)
        if error_response is not None:
            return error_response

        accessible_queryset = self.get_queryset()
        _require_board_filter_access(
            request.user, board_id, accessible_queryset
        )
        scoped_queryset = accessible_queryset.filter(board_id=board_id)
        current_ids = list(scoped_queryset.values_list("id", flat=True))

        if set(ordered_ids) != set(current_ids):
            return Response(
                {
                    "ordered_ids": [
                        "Ordered ids must include every accessible list in the board."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for position, list_id in enumerate(ordered_ids):
                NoteList.objects.filter(
                    pk=list_id, board_id=board_id
                ).update(position=position)

        serializer = self.get_serializer(
            scoped_queryset.order_by("position", "created_at", "id"), many=True
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class NoteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NoteSerializer

    def get_queryset(self):
        user = self.request.user

        queryset = Note.objects.filter(
            Q(created_by=user)
            | Q(board__owner=user)
            | Q(board__created_by=user)
            | Q(board__collaborators=user)
        )

        # Adding additional querying capabilities by ?board=ID
        board_id = self.request.query_params.get("board")
        if board_id:
            _require_board_filter_access(user, board_id, queryset)
            queryset = queryset.filter(board_id=board_id)

        # Adding additional querying capabilities by ?list=ID
        list_id = self.request.query_params.get("list")
        if list_id:
            queryset = queryset.filter(list_memberships__list_id=list_id)
            return queryset.distinct().order_by(
                "list_memberships__position",
                "list_memberships__id",
                "id",
            )

        return queryset.distinct()

    def perform_create(self, serializer):
        note_list = serializer.validated_data.get("list")
        board = serializer.validated_data.get("board")

        # Ensure user access to specified list (when provided).
        if note_list is not None:
            if not NoteList.objects.filter(
                Q(pk=note_list.pk)
                & (
                    Q(created_by=self.request.user)
                    | Q(board__owner=self.request.user)
                    | Q(board__created_by=self.request.user)
                    | Q(board__collaborators=self.request.user)
                )
            ).exists():
                raise PermissionDenied("You cannot add notes to this list.")

        # Ensure user access to specified board (when creating a board-scoped note).
        if note_list is None and board is not None:
            if (
                not Board.objects.accessible_to(self.request.user)
                .filter(pk=board.pk)
                .exists()
            ):
                raise PermissionDenied("You cannot add notes to this board.")

        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request):
        list_id = request.data.get("list")
        if list_id is None:
            return Response(
                {"list": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ordered_ids, error_response = _ordered_ids_from_request(request)
        if error_response is not None:
            return error_response

        note_list = get_object_or_404(NoteList, pk=list_id)
        has_list_access = (
            NoteList.objects.filter(pk=note_list.pk)
            .filter(
                Q(created_by=request.user)
                | Q(board__owner=request.user)
                | Q(board__created_by=request.user)
                | Q(board__collaborators=request.user)
            )
            .exists()
        )
        if not has_list_access:
            raise PermissionDenied("You do not have access to this list.")

        accessible_notes = self.get_queryset()
        memberships = ListNote.objects.filter(
            list=note_list, note__in=accessible_notes
        )
        current_ids = list(
            memberships.order_by("position", "id").values_list("note_id", flat=True)
        )

        if set(ordered_ids) != set(current_ids):
            return Response(
                {
                    "ordered_ids": [
                        "Ordered ids must include every accessible note in the list."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for position, note_id in enumerate(ordered_ids):
                ListNote.objects.filter(list=note_list, note_id=note_id).update(
                    position=position
                )

        ordered_notes = list(Note.objects.filter(id__in=ordered_ids))
        ordered_notes.sort(key=lambda note: ordered_ids.index(note.id))
        serializer = self.get_serializer(ordered_notes, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
