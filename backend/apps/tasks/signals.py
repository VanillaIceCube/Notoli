from django.core.exceptions import ValidationError
from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from .models import List, Task


@receiver(m2m_changed, sender=List.tasks.through)
def enforce_task_board_boundary(
    sender, instance, action, reverse, model, pk_set, **kwargs
):
    """Allow tasks to appear in multiple lists within the same board."""

    if action != "pre_add" or not pk_set:
        return

    if reverse:
        # instance is a Task; pk_set contains List IDs.
        task = instance
        if List.objects.filter(id__in=pk_set).exclude(board_id=task.board_id).exists():
            raise ValidationError("Cannot add a task to a list in a different board.")
        return

    # instance is a List; pk_set contains Task IDs.
    board_list = instance
    if (
        Task.objects.filter(id__in=pk_set)
        .exclude(board_id=board_list.board_id)
        .exists()
    ):
        raise ValidationError("Cannot add tasks from a different board.")
