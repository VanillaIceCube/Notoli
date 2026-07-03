from django.conf import settings
from django.db import models
from django.db.models import Q


class WorkspaceQuerySet(models.QuerySet):
    def accessible_to(self, user):
        return self.filter(
            Q(owner=user) | Q(created_by=user) | Q(collaborators=user)
        ).distinct()


# Workspace: A container or 'Master Todolist' containing all data
class Workspace(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_workspaces",
    )
    collaborators = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="collaborating_workspaces"
    )

    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_workspaces",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    position = models.PositiveIntegerField(default=0)

    objects = WorkspaceQuerySet.as_manager()

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Workspace"
        verbose_name_plural = "Workspaces"
        ordering = ["position", "created_at", "id"]


# TodoList: A singular TodoList within the Workspace
class TodoList(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Scope
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="todolists"
    )
    notes = models.ManyToManyField("Note", blank=True, related_name="todolists")

    # Ownership
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_todolists",
    )
    collaborators = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="collaborating_todolists"
    )

    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_todolists",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    position = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Todo List"
        verbose_name_plural = "Todo Lists"
        ordering = ["position", "created_at", "id"]


class TodoListNotePosition(models.Model):
    todo_list = models.ForeignKey(
        TodoList, on_delete=models.CASCADE, related_name="note_positions"
    )
    note = models.ForeignKey(
        "Note", on_delete=models.CASCADE, related_name="todo_list_positions"
    )
    position = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["todo_list", "note"], name="unique_todolist_note_position"
            )
        ]
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.todo_list_id}:{self.note_id} @ {self.position}"


# Note: The actual TodoList item
class Note(models.Model):
    # Attributes
    note = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Scope
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="notes"
    )

    # Ownership
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_notes"
    )
    collaborators = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="collaborating_notes"
    )

    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_notes"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    position = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.note

    class Meta:
        verbose_name = "Note"
        verbose_name_plural = "Notes"
        ordering = ["position", "created_at", "id"]
