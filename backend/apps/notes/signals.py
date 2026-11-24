from django.core.exceptions import ValidationError
from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from .models import List, Note


@receiver(m2m_changed, sender=List.notes.through)
def enforce_note_board_boundary(
    sender, instance, action, reverse, model, pk_set, **kwargs
):
    """Allow items to appear in multiple lists within the same board."""

    if action != "pre_add" or not pk_set:
        return

    if reverse:
        # instance is a Note; pk_set contains List IDs.
        item = instance
        if List.objects.filter(id__in=pk_set).exclude(board_id=item.board_id).exists():
            raise ValidationError("Cannot add a note to a list in a different board.")
        return

    # instance is a List; pk_set contains Note IDs.
    board_list = instance
    if (
        Note.objects.filter(id__in=pk_set)
        .exclude(board_id=board_list.board_id)
        .exists()
    ):
        raise ValidationError("Cannot add notes from a different board.")
