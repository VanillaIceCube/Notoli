from django.conf import settings
from django.db import models
from django.db.models import Max, Q


class BoardQuerySet(models.QuerySet):
    def accessible_to(self, user):
        return self.filter(
            Q(owner=user) | Q(created_by=user) | Q(collaborators=user)
        ).distinct()


# Board: A container for lists and tasks.
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
    tasks = models.ManyToManyField(
        "Task",
        blank=True,
        related_name="lists",
        through="ListTask",
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


# A task can belong to multiple lists on its board.
class Task(models.Model):
    STATUS_NOT_STARTED = "Not Started"
    STATUS_IN_PROGRESS = "In Progress"
    STATUS_COMPLETE = "Complete"
    STATUS_CHOICES = [
        (STATUS_NOT_STARTED, "Not Started"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETE, "Complete"),
    ]

    # Attributes
    text = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_NOT_STARTED,
    )

    # Scope
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="tasks")

    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_tasks"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.text

    class Meta:
        verbose_name = "Task"
        verbose_name_plural = "Tasks"


class ListTask(models.Model):
    list = models.ForeignKey(
        List, on_delete=models.CASCADE, related_name="task_memberships"
    )
    task = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="list_memberships"
    )
    position = models.PositiveIntegerField(default=0)

    def save(self, *args, **kwargs):
        if self._state.adding and self.position == 0:
            max_position = (
                ListTask.objects.filter(list=self.list)
                .exclude(task=self.task)
                .aggregate(Max("position"))["position__max"]
            )
            if max_position is not None:
                self.position = max_position + 1
        super().save(*args, **kwargs)

    class Meta:
        db_table = "notes_list_tasks"
        verbose_name = "List Task"
        verbose_name_plural = "List Tasks"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["list", "task"], name="unique_list_task_membership"
            )
        ]
