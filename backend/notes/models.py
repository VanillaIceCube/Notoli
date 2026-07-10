from django.conf import settings
from django.db import models
from django.db.models import Max, Q


class BoardQuerySet(models.QuerySet):
    def accessible_to(self, user):
        return self.filter(
            Q(owner=user) | Q(created_by=user) | Q(collaborators=user)
        ).distinct()


# Board: A container for lists and notes.
class Board(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_boards",
    )
    collaborators = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="collaborating_boards"
    )

    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_boards",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = BoardQuerySet.as_manager()

    def save(self, *args, **kwargs):
        if self.owner_id is None and self.created_by_id is not None:
            self.owner = self.created_by
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Board"
        verbose_name_plural = "Boards"


# List: A singular List within the Board
class List(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Scope
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="lists")
    notes = models.ManyToManyField(
        "Note",
        blank=True,
        related_name="lists",
        through="ListNote",
    )
    position = models.PositiveIntegerField(default=0)

    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_lists",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "List"
        verbose_name_plural = "Lists"
        ordering = ["position", "created_at", "id"]


# Note: The actual List item
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
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="notes")

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


class ListNote(models.Model):
    list = models.ForeignKey(
        List, on_delete=models.CASCADE, related_name="note_memberships"
    )
    note = models.ForeignKey(
        Note, on_delete=models.CASCADE, related_name="list_memberships"
    )
    position = models.PositiveIntegerField(default=0)

    def save(self, *args, **kwargs):
        if self._state.adding and self.position == 0:
            max_position = (
                ListNote.objects.filter(list=self.list)
                .exclude(note=self.note)
                .aggregate(Max("position"))["position__max"]
            )
            if max_position is not None:
                self.position = max_position + 1
        super().save(*args, **kwargs)

    class Meta:
        db_table = "notes_list_notes"
        verbose_name = "List Note"
        verbose_name_plural = "List Notes"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["list", "note"], name="unique_list_note_membership"
            )
        ]
