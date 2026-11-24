from django.contrib.auth import get_user_model
from rest_framework import serializers

from . import services
from .models import Board, List, Note

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
        # Domain creation supplies the authenticated owner and creator.
        extra_kwargs = {"owner": {"required": False}, "created_by": {"required": False}}


class ListSerializer(serializers.ModelSerializer):
    notes = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Note.objects.all(),
        required=False,
    )

    class Meta:
        model = List
        fields = "__all__"
        # Domain creation supplies the authenticated owner and creator.
        extra_kwargs = {
            "created_by": {"required": False},
        }

    def validate(self, attrs):
        services.validate_list_data(attrs, self.instance)
        return attrs


class NoteSerializer(serializers.ModelSerializer):
    list = serializers.PrimaryKeyRelatedField(
        queryset=List.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Note
        fields = "__all__"
        # Domain creation supplies the authenticated owner and creator.
        extra_kwargs = {
            "created_by": {"required": False},
            "board": {"required": False},
        }

    def validate(self, attrs):
        request = self.context.get("request")
        actor = self.context.get("actor") or getattr(request, "user", None)
        services.validate_note_data(actor, attrs, self.instance)
        return attrs
