from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Workspace

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
