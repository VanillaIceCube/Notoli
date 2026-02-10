from django.contrib import admin

from .models import Note, TodoList, Workspace


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


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "collaborators_display", "created_at", "updated_at")
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


@admin.register(TodoList)
class TodoListAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "workspace",
        "owner",
        "collaborators_display",
        "created_at",
        "updated_at",
    )
    list_filter = ("workspace", "owner", "created_at", "updated_at")
    search_fields = (
        "name",
        "description",
        "workspace__name",
        "owner__username",
        "owner__email",
        "collaborators__username",
        "collaborators__email",
    )
    autocomplete_fields = ("workspace", "notes", "owner", "collaborators", "created_by")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("name", "description")}),
        ("Scope", {"fields": ("workspace", "notes")}),
        ("Ownership", {"fields": ("owner", "collaborators")}),
        ("Metadata", {"fields": ("created_by", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("workspace", "owner", "created_by")
            .prefetch_related("collaborators")
        )

    @admin.display(description="Collaborators")
    def collaborators_display(self, obj):
        return _summarize_users(obj.collaborators.all())


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = (
        "note",
        "todolists_display",
        "workspace",
        "owner",
        "collaborators_display",
        "created_at",
        "updated_at",
    )
    list_filter = ("workspace", "owner", "created_at", "updated_at")
    search_fields = (
        "note",
        "description",
        "workspace__name",
        "owner__username",
        "owner__email",
        "collaborators__username",
        "collaborators__email",
        "todolists__name",
    )
    autocomplete_fields = ("workspace", "owner", "collaborators", "created_by")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("note", "description")}),
        ("Scope", {"fields": ("workspace",)}),
        ("Ownership", {"fields": ("owner", "collaborators")}),
        ("Metadata", {"fields": ("created_by", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("workspace", "owner", "created_by")
            .prefetch_related("collaborators", "todolists")
        )

    @admin.display(description="Todo Lists")
    def todolists_display(self, obj):
        return _summarize_items(obj.todolists.all())

    @admin.display(description="Collaborators")
    def collaborators_display(self, obj):
        return _summarize_users(obj.collaborators.all())
