from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "recipient",
        "actor",
        "board",
        "list",
        "note",
        "event_type",
        "is_read",
        "created_at",
    )
    list_filter = ("event_type", "is_read", "board", "created_at")
    search_fields = (
        "title",
        "message",
        "recipient__username",
        "recipient__email",
        "actor__username",
        "actor__email",
        "board__name",
        "list__name",
        "note__note",
    )
    autocomplete_fields = ("recipient", "actor", "board", "list", "note")
    readonly_fields = ("created_at", "read_at")

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("recipient", "actor", "board", "list", "note")
        )
