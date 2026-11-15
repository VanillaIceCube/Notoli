"""Actor-scoped board, list and item operations shared by REST and MCP.

Callers validate transport fields with serializers. These services recheck live
board access and own mutations, memberships, ordering and activity events.
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
    first_note_list,
    list_path,
    notify_board_members,
)

from .models import Board, ListNote, Note
from .models import List as NoteList

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
    if model is Board:
        return _locked_board(actor, instance.pk)
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
    rows = NoteList.objects.filter(board__in=boards_for(actor))
    if board_id:
        require_board_access(actor, board_id)
        rows = rows.filter(board_id=board_id)
    return rows.distinct().order_by("position", "created_at", "id")


def notes_for(actor, *, board_id=None, list_id=None):
    rows = Note.objects.filter(board__in=boards_for(actor))
    if board_id:
        require_board_access(actor, board_id)
        rows = rows.filter(board_id=board_id)
    if list_id:
        return (
            rows.filter(list_memberships__list_id=list_id)
            .distinct()
            .order_by("list_memberships__position", "list_memberships__id", "id")
        )
    return rows.distinct()


def require_owner(actor, board, message="Only the board owner can manage access."):
    if board.owner_id != actor.id:
        raise PermissionDenied(message)


def _save(model, instance, data):
    data = dict(data)
    # Board collaborators are the sole direct many-to-many model input.
    collaborators = data.pop("collaborators", None)
    if instance is None:
        instance = model.objects.create(**data)
    else:
        for field, value in data.items():
            setattr(instance, field, value)
        instance.save()
    if collaborators is not None:
        instance.collaborators.set(collaborators)
    return instance


def _set_notes(note_list, notes):
    ListNote.objects.filter(list=note_list).delete()
    ListNote.objects.bulk_create(
        [
            ListNote(list=note_list, note=note, position=position)
            for position, note in enumerate(notes)
        ]
    )


def _attach_note(note_list, note):
    max_position = ListNote.objects.filter(list=note_list).aggregate(Max("position"))[
        "position__max"
    ]
    ListNote.objects.get_or_create(
        list=note_list,
        note=note,
        defaults={"position": (max_position if max_position is not None else -1) + 1},
    )


def validate_list_data(data, instance=None):
    if (
        instance is not None
        and "board" in data
        and data["board"].pk != instance.board_id
    ):
        raise ValidationError({"board": ["Cannot change board of a list."]})
    board = data.get("board") or getattr(instance, "board", None)
    notes = data.get("notes")
    if notes is not None and len(notes) > 1000:
        raise ValidationError({"notes": ["Use at most 1000 ids."]})
    if notes is not None and len({note.pk for note in notes}) != len(notes):
        raise ValidationError({"notes": ["Duplicate ids are not allowed."]})
    if board is not None and notes is not None:
        if any(note.board_id != board.pk for note in notes):
            raise ValidationError(
                {"notes": ["All notes must belong to the same board as the list."]}
            )


def validate_note_data(actor, data, instance=None):
    note_list = data.get("list")
    board = data.get("board")
    instance_board = getattr(instance, "board", None)
    if note_list is not None and actor is not None:
        if not lists_for(actor).filter(pk=note_list.pk).exists():
            raise PermissionDenied("You cannot add notes to this list.")
    if (
        instance is not None
        and "board" in data
        and data["board"].pk != instance.board_id
    ):
        raise ValidationError({"board": ["Cannot change board of an existing note."]})
    effective_board = instance_board if instance is not None else board
    if (
        note_list is None
        and board is None
        and (instance is None or instance_board is None)
    ):
        raise ValidationError(
            {"list": ["This field is required when board is not provided."]}
        )
    if (
        note_list is not None
        and effective_board is not None
        and note_list.board_id != effective_board.pk
    ):
        raise ValidationError({"list": ["List must be in the same board as the note."]})


@transaction.atomic
def add_collaborator(actor, board_id, identifier):
    board = _locked_board(actor, board_id)
    require_owner(actor, board)
    user = find_collaborator(identifier)
    if user is None:
        raise SharingChangeError("No user found for that username or email.", 404)
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


@transaction.atomic
def create_board(actor, data):
    _require_actor(actor)
    data = {**data, "owner": actor, "created_by": actor}
    return _save(Board, None, data)


@transaction.atomic
def update_board(actor, data, instance):
    instance = _locked_instance(actor, instance, Board)
    require_owner(actor, instance, "Only the board owner can update this board.")
    previous_name = instance.name
    board = _save(Board, instance, data)
    if board.name != previous_name:
        notify_board_members(
            board,
            actor,
            Notification.EVENT_BOARD_UPDATED,
            f"Board renamed: {board.name}",
            f'{display_name(actor)} renamed "{previous_name}" to "{board.name}".',
        )
    return board


@transaction.atomic
def delete_board(actor, instance):
    instance = _locked_instance(actor, instance, Board)
    require_owner(actor, instance, "Only the board owner can delete this board.")
    notify_board_members(
        instance,
        actor,
        Notification.EVENT_BOARD_DELETED,
        f"Board deleted: {instance.name}",
        f'{display_name(actor)} deleted the shared board "{instance.name}".',
    )
    instance.delete()


@transaction.atomic
def create_list(actor, data):
    _require_actor(actor)
    validate_list_data(data, None)
    board = get_object_or_404(Board.objects.select_for_update(), pk=data["board"].pk)

    # Ensure user access to specified board
    if not Board.objects.accessible_to(actor).filter(pk=board.pk).exists():
        raise PermissionDenied("You cannot add lists to this board.")

    max_position = NoteList.objects.filter(board=board).aggregate(Max("position"))[
        "position__max"
    ]
    next_position = (max_position if max_position is not None else -1) + 1

    note_list = _persist_list(
        None, {**data, "created_by": actor, "board": board, "position": next_position}
    )
    try:
        with transaction.atomic():
            notify_board_members(
                board,
                actor,
                Notification.EVENT_LIST_CREATED,
                f"New list in {board.name}",
                f'{display_name(actor)} created the list "{note_list.name}".',
                note_list=note_list,
                target_path=list_path(note_list),
            )
    except Exception:
        # A notification failure must not turn a successful list write into a
        # misleading 500 response. The list is already persisted, so log the
        # failure and let the API return the created resource.
        logger.exception(
            "List creation notification failed for list_id=%s", note_list.pk
        )
    return note_list


@transaction.atomic
def update_list(actor, data, instance):
    instance = _locked_instance(actor, instance, NoteList)
    validate_list_data(data, instance)
    note_list = _persist_list(instance, data)
    notify_board_members(
        note_list.board,
        actor,
        Notification.EVENT_LIST_UPDATED,
        f"List updated in {note_list.board.name}",
        f'{display_name(actor)} updated the list "{note_list.name}".',
        note_list=note_list,
        target_path=list_path(note_list),
    )
    return note_list


@transaction.atomic
def delete_list(actor, instance):
    instance = _locked_instance(actor, instance, NoteList)
    board = instance.board
    list_name = instance.name
    notify_board_members(
        board,
        actor,
        Notification.EVENT_LIST_DELETED,
        f"List deleted in {board.name}",
        f'{display_name(actor)} deleted the list "{list_name}".',
        target_path=board_path(board),
    )
    instance.delete()


@transaction.atomic
def create_note(actor, data):
    validate_note_data(actor, data)
    _locked_board(
        actor,
        (
            data.get("list").board_id
            if data.get("list") is not None
            else data["board"].pk
        ),
    )
    note_list = data.get("list")

    note = _persist_note(None, {**data, "created_by": actor})
    notify_board_members(
        note.board,
        actor,
        Notification.EVENT_NOTE_CREATED,
        f"New note in {note.board.name}",
        f'{display_name(actor)} created "{note.note}".',
        note_list=note_list,
        note=note,
        target_path=list_path(note_list)
        if note_list is not None
        else board_path(note.board),
    )
    return note


@transaction.atomic
def update_note(actor, data, instance):
    instance = _locked_instance(actor, instance, Note)
    validate_note_data(actor, data, instance)
    previous_status = instance.status
    note = _persist_note(instance, data)
    note_list = data.get("list") or first_note_list(note)
    target_path = (
        list_path(note_list) if note_list is not None else board_path(note.board)
    )
    if previous_status != Note.STATUS_COMPLETE and note.status == Note.STATUS_COMPLETE:
        notify_board_members(
            note.board,
            actor,
            Notification.EVENT_NOTE_COMPLETED,
            f"Item completed in {note.board.name}",
            f'{display_name(actor)} completed "{note.note}".',
            note_list=note_list,
            note=note,
            target_path=target_path,
        )
        return note

    notify_board_members(
        note.board,
        actor,
        Notification.EVENT_NOTE_UPDATED,
        f"Note updated in {note.board.name}",
        f'{display_name(actor)} updated "{note.note}".',
        note_list=note_list,
        note=note,
        target_path=target_path,
    )
    return note


@transaction.atomic
def delete_note(actor, instance):
    instance = _locked_instance(actor, instance, Note)
    board = instance.board
    note_text = instance.note
    notify_board_members(
        board,
        actor,
        Notification.EVENT_NOTE_DELETED,
        f"Note deleted in {board.name}",
        f'{display_name(actor)} deleted "{note_text}".',
        target_path=board_path(board),
    )
    instance.delete()


def _persist_list(instance, data):
    data = dict(data)
    notes = data.pop("notes", None)
    note_list = _save(NoteList, instance, data)
    if notes is not None:
        _set_notes(note_list, notes)
    return note_list


def _persist_note(instance, data):
    data = dict(data)
    note_list = data.pop("list", None)
    if instance is None and data.get("board") is None and note_list is not None:
        data["board"] = note_list.board
    note = _save(Note, instance, data)
    if note_list is not None:
        _attach_note(note_list, note)
    return note


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
    rows = lists_for(actor, board_id=board_id)
    if set(ids) != set(rows.values_list("id", flat=True)):
        raise ValidationError(
            {
                "ordered_ids": [
                    "Ordered ids must include every accessible list in the board."
                ]
            }
        )
    for position, list_id in enumerate(ids):
        rows.filter(pk=list_id).update(position=position)
    return rows.order_by("position", "created_at", "id")


@transaction.atomic
def reorder_notes(actor, list_id, ids):
    if list_id is None:
        raise ValidationError({"list": ["This field is required."]})
    ids = ordered_ids(ids)
    note_list = get_object_or_404(NoteList, pk=list_id)
    try:
        note_list = _locked_instance(actor, note_list, NoteList)
    except PermissionDenied:
        raise PermissionDenied("You do not have access to this list.") from None
    memberships = ListNote.objects.filter(list=note_list, note__in=notes_for(actor))
    if set(ids) != set(memberships.values_list("note_id", flat=True)):
        raise ValidationError(
            {
                "ordered_ids": [
                    "Ordered ids must include every accessible note in the list."
                ]
            }
        )
    for position, note_id in enumerate(ids):
        memberships.filter(note_id=note_id).update(position=position)
    by_id = {note.pk: note for note in notes_for(actor).filter(pk__in=ids)}
    return [by_id[pk] for pk in ids]
