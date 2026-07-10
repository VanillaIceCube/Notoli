from django.contrib.auth import get_user_model

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


def notify_board_members(
    board, actor, event_type, title, message, exclude_user_ids=None
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
                event_type=event_type,
                title=title,
                message=message,
            )
            for recipient in recipients
        ]
    )
