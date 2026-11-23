"""Actor-scoped board, list and item operations shared by REST and MCP.

Callers validate transport fields with serializers. These services recheck live
board access and own mutations, memberships, ordering and activity events.
Items are stored as Note records and linked to lists through ListNote.
"""

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max, Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import (
    APIException,
    NotFound,
    PermissionDenied,
    ValidationError,
)

from apps.notifications.models import Notification
from apps.notifications.services import (
    board_path,
    display_name,
    first_item_list,
    list_path,
    notify_board_members,
)

from .models import Board, List, ListNote, Note

User = get_user_model()
logger = logging.getLogger(__name__)


class SharingChangeError(APIException):
    """An expected sharing rejection with the existing API error payload."""

    def __init__(self, message, status_code):
        self.status_code = status_code
        super().__init__({"error": message})


def _require_actor(actor):
    if not getattr(actor, "is_authenticated", False) or not getattr(
        actor, "is_active", False
    ):
        raise PermissionDenied("An active authenticated account is required.")


def _locked_board(actor, board_id):
    _require_actor(actor)
    board = get_object_or_404(Board.objects.select_for_update(), pk=board_id)
    require_board_access(actor, board.pk)
    return board


def _locked_instance(actor, instance, model):
    current = get_object_or_404(model, pk=instance.pk)
    _locked_board(actor, current.board_id)
    return get_object_or_404(
        model.objects.select_for_update(), pk=current.pk, board_id=current.board_id
    )


def boards_for(actor):
    _require_actor(actor)
    return Board.objects.accessible_to(actor)


def require_board_access(actor, board_id):
    try:
        board_id = int(board_id)
    except (TypeError, ValueError):
        raise NotFound("Board not found.")
    if not Board.objects.filter(pk=board_id).exists():
        raise NotFound("Board not found.")
    if not boards_for(actor).filter(pk=board_id).exists():
        raise PermissionDenied("You do not have access to this board.")


def lists_for(actor, *, board_id=None):
    board_lists = List.objects.filter(board__in=boards_for(actor))
    if board_id:
        require_board_access(actor, board_id)
        board_lists = board_lists.filter(board_id=board_id)
    return board_lists.distinct().order_by("position", "created_at", "id")


def notes_for(actor, *, board_id=None, list_id=None):
    items = Note.objects.filter(board__in=boards_for(actor))
    if board_id:
        require_board_access(actor, board_id)
        items = items.filter(board_id=board_id)
    if list_id:
        return (
            items.filter(list_memberships__list_id=list_id)
            .distinct()
            .order_by("list_memberships__position", "list_memberships__id", "id")
        )
    return items.distinct()


def require_owner(actor, board, message="Only the board owner can manage access."):
    if board.owner_id != actor.id:
        raise PermissionDenied(message)


def _notify_board_activity(board, actor, event_type, title, message, **context):
    """Roll back failed activity notifications independently of the edit."""
    try:
        with transaction.atomic():
            notify_board_members(board, actor, event_type, title, message, **context)
    except Exception:
        logger.error(
            "Could not save %s activity notification for board_id=%s",
            event_type,
            board.pk,
        )


def _replace_list_items(board_list, items):
    ListNote.objects.filter(list=board_list).delete()
    ListNote.objects.bulk_create(
        [
            ListNote(list=board_list, note=item, position=position)
            for position, item in enumerate(items)
        ]
    )


def _add_item_to_list(board_list, item):
    max_position = ListNote.objects.filter(list=board_list).aggregate(Max("position"))[
        "position__max"
    ]
    ListNote.objects.get_or_create(
        list=board_list,
        note=item,
        defaults={"position": (max_position if max_position is not None else -1) + 1},
    )


def validate_list_data(data, board_list=None):
    if (
        board_list is not None
        and "board" in data
        and data["board"].pk != board_list.board_id
    ):
        raise ValidationError({"board": ["Cannot change board of a list."]})
    board = data.get("board") or getattr(board_list, "board", None)
    items = data.get("notes")
    if items is not None and len(items) > 1000:
        raise ValidationError({"notes": ["Use at most 1000 ids."]})
    if items is not None and len({item.pk for item in items}) != len(items):
        raise ValidationError({"notes": ["Duplicate ids are not allowed."]})
    if board is not None and items is not None:
        if any(item.board_id != board.pk for item in items):
            raise ValidationError(
                {"notes": ["All notes must belong to the same board as the list."]}
            )


def validate_note_data(actor, data, item=None):
    board_list = data.get("list")
    requested_board = data.get("board")
    item_board = getattr(item, "board", None)
    if board_list is not None and actor is not None:
        if not lists_for(actor).filter(pk=board_list.pk).exists():
            raise PermissionDenied("You cannot add notes to this list.")
    if item is not None and "board" in data and data["board"].pk != item.board_id:
        raise ValidationError({"board": ["Cannot change board of an existing note."]})
    board = item_board if item is not None else requested_board
    if board_list is None and requested_board is None and item_board is None:
        raise ValidationError(
            {"list": ["This field is required when board is not provided."]}
        )
    if board_list is not None and board is not None and board_list.board_id != board.pk:
        raise ValidationError({"list": ["List must be in the same board as the note."]})


@transaction.atomic
def add_collaborator(actor, board_id, identifier, *, expected_user_id=None):
    board = _locked_board(actor, board_id)
    require_owner(actor, board)
    user = find_collaborator(identifier)
    if user is None:
        raise SharingChangeError("No user found for that username or email.", 404)
    if expected_user_id is not None and user.pk != expected_user_id:
        raise SharingChangeError(
            "The requested collaborator changed. Review the action again.", 400
        )
    if user.id == board.owner_id:
        raise SharingChangeError("The board owner already has access.", 400)
    if board.collaborators.filter(pk=user.pk).exists():
        raise SharingChangeError("That user is already a collaborator.", 400)
    board.collaborators.add(user)
    Notification.objects.create(
        recipient=user,
        actor=actor,
        board=board,
        board_name=board.name,
        event_type=Notification.EVENT_COLLABORATOR_ADDED,
        title=f"You were added to {board.name}",
        message=f"{display_name(actor)} added you as a collaborator.",
        target_path=board_path(board),
    )
    notify_board_members(
        board,
        actor,
        Notification.EVENT_COLLABORATOR_ADDED,
        f"Collaborator added to {board.name}",
        f'{display_name(actor)} added {display_name(user)} to "{board.name}".',
        exclude_user_ids={user.id},
        target_path=board_path(board),
    )
    return board


@transaction.atomic
def remove_collaborator(actor, board_id, user_id):
    board = _locked_board(actor, board_id)
    require_owner(actor, board)
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise SharingChangeError("Invalid collaborator.", 400)
    if user_id == board.owner_id:
        raise SharingChangeError("The board owner cannot be removed.", 400)
    if not board.collaborators.filter(pk=user_id).exists():
        raise SharingChangeError("That user is not a collaborator.", 404)
    removed_user = User.objects.get(pk=user_id)
    board.collaborators.remove(user_id)
    Notification.objects.create(
        recipient=removed_user,
        actor=actor,
        board=board,
        board_name=board.name,
        event_type=Notification.EVENT_COLLABORATOR_REMOVED,
        title=f"You were removed from {board.name}",
        message=f"{display_name(actor)} removed you from this board.",
        target_path=board_path(board),
    )
    notify_board_members(
        board,
        actor,
        Notification.EVENT_COLLABORATOR_REMOVED,
        f"Collaborator removed from {board.name}",
        f'{display_name(actor)} removed {display_name(removed_user)} from "{board.name}".',
        target_path=board_path(board),
    )
    return board


def find_collaborator(identifier):
    identifier = identifier.strip() if isinstance(identifier, str) else ""
    if not identifier:
        return None
    # An exact value can match one account's username and another's email,
    # or case variants of usernames. Never choose a recipient by row order.
    matches = list(
        User.objects.filter(
            Q(username__iexact=identifier) | Q(email__iexact=identifier)
        )[:2]
    )
    if len(matches) > 1:
        raise ValidationError(
            {
                "error": "That username or email matches multiple accounts. Use an unambiguous username or email."
            }
        )
    return matches[0] if matches else None


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
    database = board._state.db
    for list_position, (list_name, item_titles) in enumerate(
        DEFAULT_PERSONAL_BOARD_CONTENT
    ):
        board_list, _ = List.objects.using(database).get_or_create(
            board=board,
            name=list_name,
            defaults={
                "created_by": user,
                "position": list_position,
            },
        )

        for item_position, item_title in enumerate(item_titles):
            item, _ = Note.objects.using(database).get_or_create(
                board=board,
                note=item_title,
                defaults={"created_by": user},
            )
            ListNote.objects.using(database).get_or_create(
                list=board_list,
                note=item,
                defaults={"position": item_position},
            )


def create_starter_board(user):
    """Create the personal board within account setup and return it."""
    boards = Board.objects.using(user._state.db)
    board = boards.filter(owner=user).order_by("id").first()
    if board is None:
        board = boards.create(
            name=f"{_default_board_base_name(user)}'s Board",
            owner=user,
            created_by=user,
        )
        seed_default_personal_board(board, user)
    return board


@transaction.atomic
def create_board(actor, data):
    _require_actor(actor)
    fields = {**data, "owner": actor, "created_by": actor}
    collaborators = fields.pop("collaborators", None)
    board = Board.objects.create(**fields)
    if collaborators is not None:
        board.collaborators.set(collaborators)
    return board


@transaction.atomic
def update_board(actor, data, instance):
    board = _locked_board(actor, instance.pk)
    require_owner(actor, board, "Only the board owner can update this board.")
    previous_name = board.name

    fields = dict(data)
    collaborators = fields.pop("collaborators", None)
    for field, value in fields.items():
        setattr(board, field, value)
    board.save()
    if collaborators is not None:
        board.collaborators.set(collaborators)

    if board.name != previous_name:
        _notify_board_activity(
            board,
            actor,
            Notification.EVENT_BOARD_UPDATED,
            f"Board renamed: {board.name}",
            f'{display_name(actor)} renamed "{previous_name}" to "{board.name}".',
        )
    return board


@transaction.atomic
def delete_board(actor, instance):
    board = _locked_board(actor, instance.pk)
    require_owner(actor, board, "Only the board owner can delete this board.")
    _notify_board_activity(
        board,
        actor,
        Notification.EVENT_BOARD_DELETED,
        f"Board deleted: {board.name}",
        f'{display_name(actor)} deleted the shared board "{board.name}".',
    )
    board.delete()


@transaction.atomic
def create_list(actor, data):
    _require_actor(actor)
    validate_list_data(data)
    board = get_object_or_404(Board.objects.select_for_update(), pk=data["board"].pk)

    # Ensure user access to specified board
    if not Board.objects.accessible_to(actor).filter(pk=board.pk).exists():
        raise PermissionDenied("You cannot add lists to this board.")

    max_position = List.objects.filter(board=board).aggregate(Max("position"))[
        "position__max"
    ]
    next_position = (max_position if max_position is not None else -1) + 1

    fields = {**data, "created_by": actor, "board": board, "position": next_position}
    items = fields.pop("notes", None)
    board_list = List.objects.create(**fields)
    if items is not None:
        _replace_list_items(board_list, items)

    _notify_board_activity(
        board,
        actor,
        Notification.EVENT_LIST_CREATED,
        f"New list in {board.name}",
        f'{display_name(actor)} created the list "{board_list.name}".',
        note_list=board_list,
        target_path=list_path(board_list),
    )
    return board_list


@transaction.atomic
def update_list(actor, data, instance):
    board_list = _locked_instance(actor, instance, List)
    validate_list_data(data, board_list)
    fields = dict(data)
    items = fields.pop("notes", None)
    for field, value in fields.items():
        setattr(board_list, field, value)
    board_list.save()
    if items is not None:
        _replace_list_items(board_list, items)

    _notify_board_activity(
        board_list.board,
        actor,
        Notification.EVENT_LIST_UPDATED,
        f"List updated in {board_list.board.name}",
        f'{display_name(actor)} updated the list "{board_list.name}".',
        note_list=board_list,
        target_path=list_path(board_list),
    )
    return board_list


@transaction.atomic
def delete_list(actor, instance):
    board_list = _locked_instance(actor, instance, List)
    board = board_list.board
    _notify_board_activity(
        board,
        actor,
        Notification.EVENT_LIST_DELETED,
        f"List deleted in {board.name}",
        f'{display_name(actor)} deleted the list "{board_list.name}".',
        target_path=board_path(board),
    )
    board_list.delete()


@transaction.atomic
def create_note(actor, data):
    validate_note_data(actor, data)
    fields = {**data, "created_by": actor}
    board_list = fields.pop("list", None)
    board_id = board_list.board_id if board_list is not None else fields["board"].pk
    board = _locked_board(actor, board_id)
    fields["board"] = board
    item = Note.objects.create(**fields)
    if board_list is not None:
        _add_item_to_list(board_list, item)

    _notify_board_activity(
        board,
        actor,
        Notification.EVENT_NOTE_CREATED,
        f"New note in {board.name}",
        f'{display_name(actor)} created "{item.note}".',
        note_list=board_list,
        note=item,
        target_path=list_path(board_list)
        if board_list is not None
        else board_path(board),
    )
    return item


@transaction.atomic
def update_note(actor, data, instance):
    item = _locked_instance(actor, instance, Note)
    validate_note_data(actor, data, item)
    previous_status = item.status
    fields = dict(data)
    board_list = fields.pop("list", None)
    for field, value in fields.items():
        setattr(item, field, value)
    item.save()
    if board_list is not None:
        _add_item_to_list(board_list, item)

    board = item.board
    board_list = board_list or first_item_list(item)
    if previous_status != Note.STATUS_COMPLETE and item.status == Note.STATUS_COMPLETE:
        event_type = Notification.EVENT_NOTE_COMPLETED
        title = f"Item completed in {board.name}"
        action = "completed"
    else:
        event_type = Notification.EVENT_NOTE_UPDATED
        title = f"Note updated in {board.name}"
        action = "updated"
    _notify_board_activity(
        board,
        actor,
        event_type,
        title,
        f'{display_name(actor)} {action} "{item.note}".',
        note_list=board_list,
        note=item,
        target_path=list_path(board_list)
        if board_list is not None
        else board_path(board),
    )
    return item


@transaction.atomic
def delete_note(actor, instance):
    item = _locked_instance(actor, instance, Note)
    board = item.board
    _notify_board_activity(
        board,
        actor,
        Notification.EVENT_NOTE_DELETED,
        f"Note deleted in {board.name}",
        f'{display_name(actor)} deleted "{item.note}".',
        target_path=board_path(board),
    )
    item.delete()


def ordered_ids(value):
    if not isinstance(value, list) or not value:
        raise ValidationError({"ordered_ids": ["Provide a non-empty list of ids."]})
    if len(value) > 1000:
        raise ValidationError({"ordered_ids": ["Use at most 1000 ids."]})
    try:
        value = [int(item_id) for item_id in value]
    except (TypeError, ValueError):
        raise ValidationError({"ordered_ids": ["All ids must be integers."]})
    if len(value) != len(set(value)):
        raise ValidationError({"ordered_ids": ["Duplicate ids are not allowed."]})
    return value


@transaction.atomic
def reorder_lists(actor, board_id, ids):
    if board_id is None:
        raise ValidationError({"board": ["This field is required."]})
    ids = ordered_ids(ids)
    _locked_board(actor, board_id)
    board_lists = lists_for(actor, board_id=board_id)
    if set(ids) != set(board_lists.values_list("id", flat=True)):
        raise ValidationError(
            {
                "ordered_ids": [
                    "Ordered ids must include every accessible list in the board."
                ]
            }
        )
    for position, list_id in enumerate(ids):
        board_lists.filter(pk=list_id).update(position=position)
    return board_lists.order_by("position", "created_at", "id")


@transaction.atomic
def reorder_notes(actor, list_id, ids):
    if list_id is None:
        raise ValidationError({"list": ["This field is required."]})
    ids = ordered_ids(ids)
    board_list = get_object_or_404(List, pk=list_id)
    try:
        board_list = _locked_instance(actor, board_list, List)
    except PermissionDenied:
        raise PermissionDenied("You do not have access to this list.") from None
    items = notes_for(actor)
    memberships = ListNote.objects.filter(list=board_list, note__in=items)
    if set(ids) != set(memberships.values_list("note_id", flat=True)):
        raise ValidationError(
            {
                "ordered_ids": [
                    "Ordered ids must include every accessible note in the list."
                ]
            }
        )
    for position, item_id in enumerate(ids):
        memberships.filter(note_id=item_id).update(position=position)
    items_by_id = {item.pk: item for item in items.filter(pk__in=ids)}
    return [items_by_id[item_id] for item_id in ids]
