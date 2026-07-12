from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Board, ListNote, Note
from .models import List as NoteList

User = get_user_model()

DEFAULT_PERSONAL_BOARD_CONTENT = [
    (
        "Grocery List",
        [
            "Large Tortillas",
            "Carne Asada",
            "Fries",
            "Shredded Mexican Cheese",
            "Sour Cream",
            "Guac",
        ],
    ),
    (
        "Chores List",
        [
            "Sweep up the beach sand somehow still in the house",
            "Wipe down the entire condo, shouldn't take long",
            "Throw away the cold brew collection from every coffee shop nearby",
        ],
    ),
    (
        "Todo List",
        [
            "Volleyball",
            "Build Furniture",
            "Oceanside Hike",
            "Date Night with the wifey :)",
            "More Volleyball",
        ],
    ),
]


def _capitalize_first(value):
    if not value:
        return value
    return value[0].upper() + value[1:]


def _default_board_base_name(user):
    username = (user.get_username() or "").strip()
    fallback = (user.email or "").split("@", 1)[0].strip()
    if username and username != fallback:
        return username
    return _capitalize_first(fallback or username) or "My"


def seed_default_personal_board(board, user):
    for list_position, (list_name, note_texts) in enumerate(
        DEFAULT_PERSONAL_BOARD_CONTENT
    ):
        note_list, _ = NoteList.objects.get_or_create(
            board=board,
            name=list_name,
            defaults={
                "created_by": user,
                "position": list_position,
            },
        )

        for note_position, note_text in enumerate(note_texts):
            note, _ = Note.objects.get_or_create(
                board=board,
                note=note_text,
                defaults={"created_by": user},
            )
            ListNote.objects.get_or_create(
                list=note_list,
                note=note,
                defaults={"position": note_position},
            )


@receiver(post_save, sender=User)
def create_default_board(sender, instance, created, **kwargs):
    if not created:
        return
    if Board.objects.filter(owner=instance).exists():
        return
    base_name = _default_board_base_name(instance)
    with transaction.atomic():
        board = Board.objects.create(
            name=f"{base_name}'s Board",
            owner=instance,
            created_by=instance,
        )
        seed_default_personal_board(board, instance)


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
            raise ValidationError("Cannot add a note to a list in a different board.")
        return

    # instance is a List; pk_set contains Note IDs.
    note_list = instance
    if Note.objects.filter(id__in=pk_set).exclude(board_id=note_list.board_id).exists():
        raise ValidationError("Cannot add notes from a different board.")
