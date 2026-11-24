from django.conf import settings
from django.db import models

from apps.tasks.models import Board, List, Task


class Notification(models.Model):
    EVENT_COLLABORATOR_ADDED = "collaborator_added"
    EVENT_COLLABORATOR_REMOVED = "collaborator_removed"
    EVENT_LIST_CREATED = "list_created"
    EVENT_LIST_UPDATED = "list_updated"
    EVENT_LIST_DELETED = "list_deleted"
    EVENT_TASK_CREATED = "task_created"
    EVENT_TASK_UPDATED = "task_updated"
    EVENT_TASK_COMPLETED = "task_completed"
    EVENT_TASK_DELETED = "task_deleted"
    EVENT_BOARD_UPDATED = "board_updated"
    EVENT_BOARD_DELETED = "board_deleted"
    EVENT_CHOICES = [
        (EVENT_COLLABORATOR_ADDED, "Collaborator added"),
        (EVENT_COLLABORATOR_REMOVED, "Collaborator removed"),
        (EVENT_LIST_CREATED, "List created"),
        (EVENT_LIST_UPDATED, "List updated"),
        (EVENT_LIST_DELETED, "List deleted"),
        (EVENT_TASK_CREATED, "Task created"),
        (EVENT_TASK_UPDATED, "Task updated"),
        (EVENT_TASK_COMPLETED, "Task completed"),
        (EVENT_TASK_DELETED, "Task deleted"),
        (EVENT_BOARD_UPDATED, "Board updated"),
        (EVENT_BOARD_DELETED, "Board deleted"),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_notifications",
    )
    board = models.ForeignKey(
        Board,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    board_name = models.CharField(max_length=255, blank=True)
    list = models.ForeignKey(
        List,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    task = models.ForeignKey(
        Task,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES)
    title = models.CharField(max_length=160)
    message = models.TextField()
    target_path = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.board_name and self.board_id is not None:
            self.board_name = self.board.name
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]
