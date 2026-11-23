"""Service entry points enforce domain rules without an HTTP request or view."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.notes import services
from apps.notes.models import Board, List, ListNote
from apps.notifications.models import Notification


class NotesDomainServiceTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.owner = users.objects.create_user(
            username="domain-owner", email="domain-owner@example.com"
        )
        self.member = users.objects.create_user(
            username="domain-member", email="domain-member@example.com"
        )
        self.outsider = users.objects.create_user(
            username="domain-outsider", email="domain-outsider@example.com"
        )
        self.board = services.create_board(self.owner, {"name": "Shared"})
        self.board.collaborators.add(self.member)
        self.note_list = services.create_list(
            self.member, {"board": self.board, "name": "Tasks"}
        )
        self.item = services.create_note(
            self.member, {"list": self.note_list, "note": "Do this"}
        )
        Notification.objects.all().delete()

    def test_removed_creator_loses_queries_and_stale_object_mutations(self):
        self.board.collaborators.remove(self.member)
        self.assertFalse(
            services.lists_for(self.member).filter(pk=self.note_list.pk).exists()
        )
        self.assertFalse(
            services.notes_for(self.member).filter(pk=self.item.pk).exists()
        )
        for operation in (
            lambda: services.update_list(
                self.member, {"name": "Denied"}, self.note_list
            ),
            lambda: services.update_note(self.member, {"note": "Denied"}, self.item),
            lambda: services.delete_list(self.member, self.note_list),
            lambda: services.delete_note(self.member, self.item),
            lambda: services.create_note(
                self.member, {"list": self.note_list, "note": "Denied"}
            ),
        ):
            with self.subTest(operation=operation), self.assertRaises(PermissionDenied):
                operation()
        self.note_list.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(self.note_list.name, "Tasks")
        self.assertEqual(self.item.note, "Do this")
        self.assertFalse(Notification.objects.exists())

    def test_owner_is_reloaded_before_board_update_and_sharing(self):
        Board.objects.filter(pk=self.board.pk).update(owner=self.member)
        # The in-memory board still claims that the caller is the owner.
        with self.assertRaises(PermissionDenied):
            services.update_board(self.owner, {"name": "Denied"}, self.board)
        with self.assertRaises(PermissionDenied):
            services.add_collaborator(self.owner, self.board.pk, self.outsider.username)
        self.assertFalse(self.board.collaborators.filter(pk=self.outsider.pk).exists())
        self.assertFalse(Notification.objects.exists())

    def test_domain_enforces_immutable_board_and_same_board_memberships(self):
        other = services.create_board(self.owner, {"name": "Other"})
        foreign = services.create_note(self.owner, {"board": other, "note": "Foreign"})
        for operation in (
            lambda: services.update_list(self.owner, {"board": other}, self.note_list),
            lambda: services.update_note(self.owner, {"board": other}, self.item),
            lambda: services.update_list(
                self.owner, {"notes": [foreign]}, self.note_list
            ),
            lambda: services.update_note(self.owner, {"list": self.note_list}, foreign),
        ):
            with self.subTest(operation=operation), self.assertRaises(ValidationError):
                operation()
        self.assertEqual(list(self.note_list.notes.all()), [self.item])

    def test_list_update_keeps_item_changes_when_activity_fails(self):
        other = services.create_note(
            self.owner, {"board": self.board, "note": "Replacement"}
        )
        Notification.objects.all().delete()

        def fail_after_writing_activity(*args, **kwargs):
            Notification.objects.create(
                recipient=self.owner, event_type="test", title="Partial activity"
            )
            raise RuntimeError("unavailable")

        with patch(
            "apps.notes.services.notify_board_members",
            side_effect=fail_after_writing_activity,
        ):
            with self.assertLogs("apps.notes.services", level="ERROR"):
                services.update_list(
                    self.member, {"name": "Changed", "notes": [other]}, self.note_list
                )
        self.note_list.refresh_from_db()
        self.assertEqual(self.note_list.name, "Changed")
        self.assertEqual(list(self.note_list.notes.all()), [other])
        self.assertFalse(Notification.objects.exists())

    def test_sharing_and_notifications_roll_back_together(self):
        with patch(
            "apps.notes.services.notify_board_members",
            side_effect=RuntimeError("unavailable"),
        ):
            with self.assertRaises(RuntimeError):
                services.add_collaborator(
                    self.owner, self.board.pk, self.outsider.username
                )
        self.assertFalse(self.board.collaborators.filter(pk=self.outsider.pk).exists())
        self.assertFalse(Notification.objects.exists())

    def test_list_creation_keeps_success_when_notification_database_write_fails(self):
        existing = Notification.objects.create(
            recipient=self.owner, event_type="test", title="Existing"
        )

        def fail_notification_write(*args, **kwargs):
            # A real constraint error marks the transaction for rollback unless
            # activity delivery runs inside its own savepoint.
            Notification.objects.create(
                pk=existing.pk,
                recipient=self.owner,
                event_type="test",
                title="Duplicate",
            )

        with patch(
            "apps.notes.services.notify_board_members",
            side_effect=fail_notification_write,
        ):
            with self.assertLogs("apps.notes.services", level="ERROR"):
                created = services.create_list(
                    self.owner, {"board": self.board, "name": "Saved"}
                )
        self.assertTrue(List.objects.filter(pk=created.pk, name="Saved").exists())
        self.assertEqual(
            list(Notification.objects.values_list("pk", flat=True)), [existing.pk]
        )

    def test_ordering_validates_complete_set_without_partial_writes(self):
        other = services.create_note(
            self.owner, {"list": self.note_list, "note": "Second"}
        )
        before = list(
            ListNote.objects.filter(list=self.note_list).values_list(
                "note_id", "position"
            )
        )
        with self.assertRaises(ValidationError):
            services.reorder_notes(self.member, self.note_list.pk, [other.pk])
        self.assertEqual(
            list(
                ListNote.objects.filter(list=self.note_list).values_list(
                    "note_id", "position"
                )
            ),
            before,
        )
        self.assertEqual(
            [
                n.pk
                for n in services.reorder_notes(
                    self.member, self.note_list.pk, [other.pk, self.item.pk]
                )
            ],
            [other.pk, self.item.pk],
        )

    def test_inactive_actor_cannot_mutate_through_services(self):
        self.member.is_active = False
        with self.assertRaises(PermissionDenied):
            services.create_list(self.member, {"board": self.board, "name": "Denied"})
        with self.assertRaises(PermissionDenied):
            services.update_note(self.member, {"note": "Denied"}, self.item)
