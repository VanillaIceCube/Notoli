"""Service entry points enforce domain rules without an HTTP request or view."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.notifications.models import Notification
from apps.tasks import services
from apps.tasks.models import Board, List, ListTask


class TaskDomainServiceTests(TestCase):
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
        self.board_list = services.create_list(
            self.member, {"board": self.board, "name": "Tasks"}
        )
        self.task = services.create_task(
            self.member, {"list": self.board_list, "text": "Do this"}
        )
        Notification.objects.all().delete()

    def test_removed_creator_loses_queries_and_stale_object_mutations(self):
        self.board.collaborators.remove(self.member)
        self.assertFalse(
            services.lists_for(self.member).filter(pk=self.board_list.pk).exists()
        )
        self.assertFalse(
            services.tasks_for(self.member).filter(pk=self.task.pk).exists()
        )
        for operation in (
            lambda: services.update_list(
                self.member, {"name": "Denied"}, self.board_list
            ),
            lambda: services.update_task(self.member, {"text": "Denied"}, self.task),
            lambda: services.delete_list(self.member, self.board_list),
            lambda: services.delete_task(self.member, self.task),
            lambda: services.create_task(
                self.member, {"list": self.board_list, "text": "Denied"}
            ),
        ):
            with self.subTest(operation=operation), self.assertRaises(PermissionDenied):
                operation()
        self.board_list.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.board_list.name, "Tasks")
        self.assertEqual(self.task.text, "Do this")
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
        foreign = services.create_task(self.owner, {"board": other, "text": "Foreign"})
        for operation in (
            lambda: services.update_list(self.owner, {"board": other}, self.board_list),
            lambda: services.update_task(self.owner, {"board": other}, self.task),
            lambda: services.update_list(
                self.owner, {"tasks": [foreign]}, self.board_list
            ),
            lambda: services.update_task(
                self.owner, {"list": self.board_list}, foreign
            ),
        ):
            with self.subTest(operation=operation), self.assertRaises(ValidationError):
                operation()
        self.assertEqual(list(self.board_list.tasks.all()), [self.task])

    def test_list_update_keeps_task_changes_when_activity_fails(self):
        other = services.create_task(
            self.owner, {"board": self.board, "text": "Replacement"}
        )
        Notification.objects.all().delete()

        def fail_after_writing_activity(*args, **kwargs):
            Notification.objects.create(
                recipient=self.owner, event_type="test", title="Partial activity"
            )
            raise RuntimeError("unavailable")

        with patch(
            "apps.tasks.services.notify_board_members",
            side_effect=fail_after_writing_activity,
        ):
            with self.assertLogs("apps.tasks.services", level="ERROR"):
                services.update_list(
                    self.member, {"name": "Changed", "tasks": [other]}, self.board_list
                )
        self.board_list.refresh_from_db()
        self.assertEqual(self.board_list.name, "Changed")
        self.assertEqual(list(self.board_list.tasks.all()), [other])
        self.assertFalse(Notification.objects.exists())

    def test_sharing_and_notifications_roll_back_together(self):
        with patch(
            "apps.tasks.services.notify_board_members",
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
            "apps.tasks.services.notify_board_members",
            side_effect=fail_notification_write,
        ):
            with self.assertLogs("apps.tasks.services", level="ERROR"):
                created = services.create_list(
                    self.owner, {"board": self.board, "name": "Saved"}
                )
        self.assertTrue(List.objects.filter(pk=created.pk, name="Saved").exists())
        self.assertEqual(
            list(Notification.objects.values_list("pk", flat=True)), [existing.pk]
        )

    def test_ordering_validates_complete_set_without_partial_writes(self):
        other = services.create_task(
            self.owner, {"list": self.board_list, "text": "Second"}
        )
        before = list(
            ListTask.objects.filter(list=self.board_list).values_list(
                "task_id", "position"
            )
        )
        with self.assertRaises(ValidationError):
            services.reorder_tasks(self.member, self.board_list.pk, [other.pk])
        self.assertEqual(
            list(
                ListTask.objects.filter(list=self.board_list).values_list(
                    "task_id", "position"
                )
            ),
            before,
        )
        self.assertEqual(
            [
                n.pk
                for n in services.reorder_tasks(
                    self.member, self.board_list.pk, [other.pk, self.task.pk]
                )
            ],
            [other.pk, self.task.pk],
        )

    def test_inactive_actor_cannot_mutate_through_services(self):
        self.member.is_active = False
        with self.assertRaises(PermissionDenied):
            services.create_list(self.member, {"board": self.board, "name": "Denied"})
        with self.assertRaises(PermissionDenied):
            services.update_task(self.member, {"text": "Denied"}, self.task)
