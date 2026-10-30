"""Operator-only explicit account linking; never infer identity from email."""

from uuid import UUID

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from integrations.central_oauth import ISSUER
from integrations.models import MCPIdentityLink


class Command(BaseCommand):
    help = "Link one central MCP subject to an existing Notoli user ID."

    def add_arguments(self, parser):
        parser.add_argument("--subject", required=True)
        parser.add_argument("--user-id", required=True, type=int)
        action = parser.add_mutually_exclusive_group()
        action.add_argument("--disable", action="store_true")
        action.add_argument("--enable", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        subject = options["subject"]
        try:
            if str(UUID(subject)) != subject:
                raise ValueError
        except ValueError:
            raise CommandError(
                "Subject must be the exact immutable central UUID."
            ) from None
        user = (
            get_user_model()
            .objects.filter(pk=options["user_id"], is_active=True)
            .first()
        )
        if user is None:
            raise CommandError("An existing active local user ID is required.")
        link = (
            MCPIdentityLink.objects.select_for_update()
            .filter(issuer=ISSUER, subject=subject)
            .first()
        )
        if link is None:
            if options["disable"] or options["enable"]:
                raise CommandError("Identity is not linked.")
            MCPIdentityLink.objects.create(issuer=ISSUER, subject=subject, user=user)
        else:
            if link.user_id != user.pk:
                raise CommandError(
                    "Identity is already linked to another user; no rebinding performed."
                )
            if not options["disable"] and not options["enable"]:
                raise CommandError("Identity already linked; no change performed.")
            link.enabled = options["enable"]
            link.save(update_fields=["enabled", "updated_at"])
        self.stdout.write(
            "MCP identity link updated; no account or OAuth grant created."
        )
