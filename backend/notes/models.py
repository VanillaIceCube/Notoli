from django.conf import settings
from django.db import models
from django.db.models import Max, Q


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

    objects = WorkspaceQuerySet.as_manager()

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Workspace"
        verbose_name_plural = "Workspaces"


# TodoList: A singular TodoList within the Workspace
class TodoList(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Scope
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="todolists"
    )
    notes = models.ManyToManyField(
        "Note",
        blank=True,
        related_name="todolists",
        through="TodoListNote",
    )
    position = models.PositiveIntegerField(default=0)

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

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Todo List"
        verbose_name_plural = "Todo Lists"
        ordering = ["position", "created_at", "id"]


# Note: The actual TodoList item
class Note(models.Model):
    STATUS_NOT_STARTED = "Not Started"
    STATUS_IN_PROGRESS = "In Progress"
    STATUS_COMPLETE = "Complete"
    STATUS_CHOICES = [
        (STATUS_NOT_STARTED, "Not Started"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETE, "Complete"),
    ]

    # Attributes
    note = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_NOT_STARTED,
    )

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

    def __str__(self):
        return self.note

    class Meta:
        verbose_name = "Note"
        verbose_name_plural = "Notes"


class TodoListNote(models.Model):
    todolist = models.ForeignKey(
        TodoList, on_delete=models.CASCADE, related_name="note_memberships"
    )
    note = models.ForeignKey(
        Note, on_delete=models.CASCADE, related_name="todolist_memberships"
    )
    position = models.PositiveIntegerField(default=0)

    def save(self, *args, **kwargs):
        if self._state.adding and self.position == 0:
            max_position = (
                TodoListNote.objects.filter(todolist=self.todolist)
                .exclude(note=self.note)
                .aggregate(Max("position"))["position__max"]
            )
            if max_position is not None:
                self.position = max_position + 1
        super().save(*args, **kwargs)

    class Meta:
        db_table = "notes_todolist_notes"
        verbose_name = "Todo List Note"
        verbose_name_plural = "Todo List Notes"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["todolist", "note"], name="unique_todolist_note_membership"
            )
        ]
