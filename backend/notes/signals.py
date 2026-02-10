from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Note, TodoList, Workspace

User = get_user_model()


@receiver(post_save, sender=User)
def create_default_workspace(sender, instance, created, **kwargs):
    if not created:
        return
    if Workspace.objects.filter(owner=instance).exists():
        return
    Workspace.objects.create(
        name="My Workspace",
        owner=instance,
        created_by=instance,
    )


@receiver(m2m_changed, sender=TodoList.notes.through)
def enforce_note_workspace_boundary(
    sender, instance, action, reverse, model, pk_set, **kwargs
):
    """
    Prevent cross-workspace links between TodoLists and Notes.

    The hard boundary is:
    - TodoList belongs to exactly one Workspace
    - Note belongs to exactly one Workspace
    - A Note may appear in multiple TodoLists, but only within its Workspace
    """

    if action != "pre_add" or not pk_set:
        return

    if reverse:
        # instance is a Note; pk_set contains TodoList IDs.
        note = instance
        if (
            TodoList.objects.filter(id__in=pk_set)
            .exclude(workspace_id=note.workspace_id)
            .exists()
        ):
            raise ValidationError(
                "Cannot add a note to a todo list in a different workspace."
            )
        return

    # instance is a TodoList; pk_set contains Note IDs.
    todo_list = instance
    if (
        Note.objects.filter(id__in=pk_set)
        .exclude(workspace_id=todo_list.workspace_id)
        .exists()
    ):
        raise ValidationError("Cannot add notes from a different workspace.")
