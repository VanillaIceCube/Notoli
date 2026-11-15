from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from .models import Notification

User = get_user_model()


def display_name(user):
    return user.get_full_name() or user.get_username() or user.email


def board_recipients(board, actor, exclude_user_ids=None):
    exclude_user_ids = set(exclude_user_ids or [])
    user_ids = {board.owner_id, *board.collaborators.values_list("id", flat=True)}
    user_ids.discard(actor.id)
    user_ids.difference_update(exclude_user_ids)
    return User.objects.filter(id__in=user_ids)


def board_path(board):
    return f"/board/{board.id}"


def list_path(note_list):
    return f"/board/{note_list.board_id}/list/{note_list.id}"


def first_note_list(note):
    membership = (
        note.list_memberships.select_related("list", "list__board")
        .order_by("position", "id")
        .first()
    )
    if membership is None:
        return None
    return membership.list


def notify_board_members(
    board,
    actor,
    event_type,
    title,
    message,
    exclude_user_ids=None,
    note_list=None,
    note=None,
    target_path="",
):
    recipients = list(board_recipients(board, actor, exclude_user_ids))
    if not recipients:
        return

    Notification.objects.bulk_create(
        [
            Notification(
                recipient=recipient,
                actor=actor,
                board=board,
                board_name=board.name,
                list=note_list,
                note=note,
                event_type=event_type,
                title=title,
                message=message,
                target_path=target_path,
            )
            for recipient in recipients
        ]
    )


def notifications_for(actor):
    if not getattr(actor, "is_authenticated", False) or not getattr(
        actor, "is_active", False
    ):
        raise PermissionDenied("An active authenticated account is required.")
    return (
        Notification.objects.filter(recipient=actor)
        .select_related("actor", "board", "list", "note")
        .order_by("-created_at", "-id")
    )


@transaction.atomic
def update_notification(actor, data, instance):
    notification = (
        notifications_for(actor).select_for_update().filter(pk=instance.pk).first()
    )
    if notification is None:
        raise PermissionDenied("Notification not found or not yours.")
    is_read = data.get("is_read")
    if is_read is True and not notification.read_at:
        notification.read_at = timezone.now()
    elif is_read is False:
        notification.read_at = None
    if "is_read" in data:
        notification.is_read = is_read
    notification.save()
    return notification


@transaction.atomic
def delete_notification(actor, instance):
    notification = (
        notifications_for(actor).select_for_update().filter(pk=instance.pk).first()
    )
    if notification is None:
        raise PermissionDenied("Notification not found or not yours.")
    notification.delete()


@transaction.atomic
def mark_all_read(actor):
    return (
        notifications_for(actor)
        .filter(is_read=False)
        .update(is_read=True, read_at=timezone.now())
    )


@transaction.atomic
def clear_all(actor):
    deleted, _ = notifications_for(actor).delete()
    return deleted
