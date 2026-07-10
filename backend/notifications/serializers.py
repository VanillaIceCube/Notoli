from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Notification

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "display_name")

    def get_display_name(self, obj):
        return obj.get_full_name() or obj.get_username() or obj.email


class NotificationSerializer(serializers.ModelSerializer):
    actor_details = UserSummarySerializer(source="actor", read_only=True)
    board_name = serializers.CharField(source="board.name", read_only=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "event_type",
            "title",
            "message",
            "is_read",
            "created_at",
            "read_at",
            "actor",
            "actor_details",
            "board",
            "board_name",
        )
        read_only_fields = (
            "id",
            "event_type",
            "title",
            "message",
            "created_at",
            "read_at",
            "actor",
            "actor_details",
            "board",
            "board_name",
        )
