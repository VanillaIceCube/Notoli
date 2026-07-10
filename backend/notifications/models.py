from django.conf import settings
from django.db import models

from notes.models import Board


class Notification(models.Model):
    EVENT_COLLABORATOR_ADDED = "collaborator_added"
    EVENT_LIST_CREATED = "list_created"
    EVENT_NOTE_CREATED = "note_created"
    EVENT_NOTE_UPDATED = "note_updated"
    EVENT_CHOICES = [
        (EVENT_COLLABORATOR_ADDED, "Collaborator added"),
        (EVENT_LIST_CREATED, "List created"),
        (EVENT_NOTE_CREATED, "Note created"),
        (EVENT_NOTE_UPDATED, "Note updated"),
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
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES)
    title = models.CharField(max_length=160)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.title

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]
