from django.contrib.auth import get_user_model
from django.db.models import Max
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from .models import Board, ListNote, Note
from .models import List as NoteList

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "display_name")

    def get_display_name(self, obj):
        return obj.get_full_name() or obj.get_username() or obj.email


class BoardSerializer(serializers.ModelSerializer):
    owner_details = UserSummarySerializer(source="owner", read_only=True)
    collaborators_details = UserSummarySerializer(
        source="collaborators", many=True, read_only=True
    )

    class Meta:
        model = Board
        fields = "__all__"
        # perform_create in models.py automatically sets owner & created_by upon creation
        # this is placed here to allow you to not have to pass in owner & created_by
        # but still requires them on the database level
        extra_kwargs = {"owner": {"required": False}, "created_by": {"required": False}}


class ListSerializer(serializers.ModelSerializer):
    notes = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Note.objects.all(),
        required=False,
    )

    class Meta:
        model = NoteList
        fields = "__all__"
        # perform_create in models.py automatically sets owner & created_by upon creation
        # this is placed here to allow you to not have to pass in owner & created_by
        # but still requires them on the database level
        extra_kwargs = {
            "created_by": {"required": False},
        }

    def validate(self, attrs):
        # Hard boundary: Lists cannot move between boards once created.
        if self.instance is not None and "board" in attrs:
            if attrs["board"].id != self.instance.board_id:
                raise serializers.ValidationError(
                    {"board": ["Cannot change board of a list."]}
                )

        board = attrs.get("board") or getattr(self.instance, "board", None)
        notes = attrs.get("notes")
        if board is not None and notes is not None:
            bad_note_ids = [n.id for n in notes if n.board_id != board.id]
            if bad_note_ids:
                raise serializers.ValidationError(
                    {
                        "notes": [
                            "All notes must belong to the same board as the list."
                        ]
                    }
                )

        return attrs

    def create(self, validated_data):
        notes = validated_data.pop("notes", None)
        note_list = super().create(validated_data)
        if notes is not None:
            self._set_notes(note_list, notes)
        return note_list

    def update(self, instance, validated_data):
        notes = validated_data.pop("notes", None)
        note_list = super().update(instance, validated_data)
        if notes is not None:
            self._set_notes(note_list, notes)
        return note_list

    def _set_notes(self, note_list, notes):
        ListNote.objects.filter(list=note_list).delete()
        ListNote.objects.bulk_create(
            [
                ListNote(list=note_list, note=note, position=position)
                for position, note in enumerate(notes)
            ]
        )


class NoteSerializer(serializers.ModelSerializer):
    list = serializers.PrimaryKeyRelatedField(
        queryset=NoteList.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Note
        fields = "__all__"
        # perform_create in models.py automatically sets owner & created_by upon creation
        # this is placed here to allow you to not have to pass in owner & created_by
        # but still requires them on the database level
        extra_kwargs = {
            "created_by": {"required": False},
            "board": {"required": False},
        }

    def validate(self, attrs):
        note_list = attrs.get("list")
        board = attrs.get("board")

        instance_board = getattr(self.instance, "board", None)

        # Enforce that attaching to a list via PATCH requires access to that list.
        # Otherwise a user who can edit a note could inject it into a list they can't access.
        if note_list is not None:
            request = self.context.get("request")
            user = getattr(request, "user", None)
            if user is not None and getattr(user, "is_authenticated", False):
                has_list_access = (
                    note_list.created_by_id == user.id
                    or note_list.board.owner_id == user.id
                    or note_list.board.created_by_id == user.id
                    or note_list.board.collaborators.filter(id=user.id).exists()
                )
                if not has_list_access:
                    raise PermissionDenied("You cannot add notes to this list.")

        # Hard boundary: Notes cannot move between boards once created.
        # Validate this first so clients get a clear immutability error even if they also send `list`.
        if self.instance is not None and "board" in attrs:
            if attrs["board"].id != self.instance.board_id:
                raise serializers.ValidationError(
                    {"board": ["Cannot change board of an existing note."]}
                )

        # For updates, the note's board is immutable, so always validate against the instance board.
        effective_board = (
            instance_board if self.instance is not None else board
        )

        # Creation requires scope. Updates can omit scope as long as the instance already has it.
        if note_list is None and board is None:
            if self.instance is None or instance_board is None:
                raise serializers.ValidationError(
                    {
                        "list": [
                            "This field is required when board is not provided."
                        ],
                    }
                )

        if note_list is not None and effective_board is not None:
            if note_list.board_id != effective_board.id:
                raise serializers.ValidationError(
                    {
                        "list": [
                            "List must be in the same board as the note."
                        ]
                    }
                )

        return attrs

    def create(self, validated_data):
        note_list = validated_data.pop("list", None)

        if validated_data.get("board") is None and note_list is not None:
            validated_data["board"] = note_list.board

        note = super().create(validated_data)

        if note_list is not None:
            self._attach_note_to_list(note_list, note)

        return note

    def update(self, instance, validated_data):
        # `list` is an API convenience for attaching a note to a list.
        # It is not a model field, so we must handle it explicitly on update.
        note_list = validated_data.pop("list", None)

        note = super().update(instance, validated_data)

        if note_list is not None:
            self._attach_note_to_list(note_list, note)

        return note

    def _attach_note_to_list(self, note_list, note):
        max_position = ListNote.objects.filter(list=note_list).aggregate(
            Max("position")
        )["position__max"]
        next_position = (max_position if max_position is not None else -1) + 1
        ListNote.objects.get_or_create(
            list=note_list,
            note=note,
            defaults={"position": next_position},
        )
