from django.contrib import admin

from .models import Board, ListNote, Note
from .models import List as NoteList


def _summarize_users(users, limit: int = 3) -> str:
    users = list(users)
    if not users:
        return "-"

    shown = ", ".join(str(u) for u in users[:limit])
    remaining = len(users) - limit
    if remaining > 0:
        return f"{shown} (+{remaining} more)"
    return shown


def _summarize_items(items, limit: int = 3) -> str:
    items = list(items)
    if not items:
        return "-"

    shown = ", ".join(str(i) for i in items[:limit])
    remaining = len(items) - limit
    if remaining > 0:
        return f"{shown} (+{remaining} more)"
    return shown


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "owner",
        "collaborators_display",
        "created_at",
        "updated_at",
    )
    list_filter = ("owner", "created_at", "updated_at")
    search_fields = (
        "name",
        "description",
        "owner__username",
        "owner__email",
        "collaborators__username",
        "collaborators__email",
    )
    autocomplete_fields = ("owner", "collaborators", "created_by")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("name", "description")}),
        ("Ownership", {"fields": ("owner", "collaborators")}),
        ("Metadata", {"fields": ("created_by", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("owner", "created_by")
            .prefetch_related("collaborators")
        )

    @admin.display(description="Collaborators")
    def collaborators_display(self, obj):
        return _summarize_users(obj.collaborators.all())


@admin.register(NoteList)
class ListAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "board",
        "created_by",
        "created_at",
        "updated_at",
    )
    list_filter = ("board", "created_by", "created_at", "updated_at")
    search_fields = (
        "name",
        "description",
        "board__name",
        "created_by__username",
        "created_by__email",
    )
    autocomplete_fields = ("board", "created_by")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("name", "description")}),
        ("Scope", {"fields": ("board",)}),
        ("Metadata", {"fields": ("created_by", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("board", "created_by")


@admin.register(ListNote)
class ListNoteAdmin(admin.ModelAdmin):
    list_display = ("list", "note", "position")
    list_filter = ("list__board", "list")
    search_fields = ("list__name", "note__note")
    autocomplete_fields = ("list", "note")


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = (
        "note",
        "status",
        "lists_display",
        "board",
        "created_by",
        "created_at",
        "updated_at",
    )
    list_filter = ("status", "board", "created_by", "created_at", "updated_at")
    search_fields = (
        "note",
        "description",
        "board__name",
        "created_by__username",
        "created_by__email",
        "lists__name",
    )
    autocomplete_fields = ("board", "created_by")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("note", "description", "status")}),
        ("Scope", {"fields": ("board",)}),
        ("Metadata", {"fields": ("created_by", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("board", "created_by")
            .prefetch_related("lists")
        )

    @admin.display(description="Lists")
    def lists_display(self, obj):
        return _summarize_items(obj.lists.all())
