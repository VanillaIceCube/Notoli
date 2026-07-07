from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Board, Note
from .models import List as NoteList

User = get_user_model()


@receiver(post_save, sender=User)
def create_default_board(sender, instance, created, **kwargs):
    if not created:
        return
    if Board.objects.filter(owner=instance).exists():
        return
    username = (instance.get_username() or "").strip()
    fallback = (instance.email or "").split("@", 1)[0].strip()
    base_name = username or fallback or "My"
    Board.objects.create(
        name=f"{base_name}'s board",
        owner=instance,
        created_by=instance,
    )


@receiver(m2m_changed, sender=NoteList.notes.through)
def enforce_note_board_boundary(
    sender, instance, action, reverse, model, pk_set, **kwargs
):
    """
    Prevent cross-board links between Lists and Notes.

    The hard boundary is:
    - List belongs to exactly one Board
    - Note belongs to exactly one Board
    - A Note may appear in multiple Lists, but only within its Board
    """

    if action != "pre_add" or not pk_set:
        return

    if reverse:
        # instance is a Note; pk_set contains List IDs.
        note = instance
        if (
            NoteList.objects.filter(id__in=pk_set)
            .exclude(board_id=note.board_id)
            .exists()
        ):
            raise ValidationError(
                "Cannot add a note to a list in a different board."
            )
        return

    # instance is a List; pk_set contains Note IDs.
    note_list = instance
    if (
        Note.objects.filter(id__in=pk_set)
        .exclude(board_id=note_list.board_id)
        .exists()
    ):
        raise ValidationError("Cannot add notes from a different board.")
