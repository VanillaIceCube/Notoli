from django.contrib.auth.models import User
from django.db import models


# Workspace: A container or 'Master Todolist' containing all data
class Workspace(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="owned_workspaces"
    )
    collaborators = models.ManyToManyField(
        User, blank=True, related_name="collaborating_workspaces"
    )

    # Metadata
    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="created_workspaces"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    notes = models.ManyToManyField("Note", blank=True, related_name="todolists")

    # Ownership
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="owned_todolists"
    )
    collaborators = models.ManyToManyField(
        User, blank=True, related_name="collaborating_todolists"
    )

    # Metadata
    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="created_todolists"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Todo List"
        verbose_name_plural = "Todo Lists"


# Note: The actual TodoList item
class Note(models.Model):
    # Attributes
    note = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="owned_notes"
    )
    collaborators = models.ManyToManyField(
        User, blank=True, related_name="collaborating_notes"
    )

    # Metadata
    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="created_notes"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.note

    class Meta:
        verbose_name = "Note"
        verbose_name_plural = "Notes"
