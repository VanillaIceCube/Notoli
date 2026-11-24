"""Core task tools enforce scopes, access, validation and pagination."""

# ruff: noqa: E402 -- skip before importing optional OAuth ORM models.
from unittest import SkipTest

from django.conf import settings

if not settings.MCP_ENABLED:
    raise SkipTest("Run the enabled app-owned OAuth profile")


from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import TestCase
from oauth2_provider.models import AccessToken

from apps.notifications.models import Notification
from apps.tasks.models import Board, ListTask, Task
from apps.tasks.models import List as TaskList

from .helpers import execute_action as execute
from .helpers import make_client, make_token


class TaskToolTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "tool-user", email="tools@example.com"
        )
        self.other = get_user_model().objects.create_user(
            "other-user", email="other@example.com"
        )
        self.app = make_client()
        make_token(self.user, self.app)
        self.board = Board.objects.create(
            name="Shared", owner=self.other, created_by=self.other
        )
        self.board.collaborators.add(self.user)
        self.board_list = TaskList.objects.create(
            name="Groceries", board=self.board, created_by=self.user
        )

    def call(self, operation, **arguments):
        return execute("test-access", operation, **arguments)

    def test_discovery_create_complete_and_notifications(self):
        boards = self.call("list_boards", query="Shared", limit=1, offset=0)["results"]
        self.assertEqual([board["id"] for board in boards], [self.board.pk])
        self.assertNotIn("collaborators_details", boards[0])
        self.assertEqual(
            self.call("list_lists", board_id=self.board.pk, limit=50, offset=0)[
                "results"
            ][0]["id"],
            self.board_list.pk,
        )
        task = self.call(
            "add_task",
            list_id=self.board_list.pk,
            text="Buy milk",
            description="Two cartons",
        )
        self.assertEqual(Task.objects.get(pk=task["id"]).created_by, self.user)
        self.assertTrue(
            ListTask.objects.filter(list=self.board_list, task_id=task["id"]).exists()
        )
        updated = self.call(
            "update_task",
            list_id=self.board_list.pk,
            task_id=task["id"],
            text=None,
            description=None,
            status="Complete",
        )
        self.assertEqual(updated["status"], "Complete")
        self.assertEqual(
            self.call("get_tasks", list_id=self.board_list.pk, limit=50, offset=0)[
                "results"
            ][0]["id"],
            task["id"],
        )
        events = set(
            Notification.objects.filter(
                recipient=self.other, task_id=task["id"]
            ).values_list("event_type", flat=True)
        )
        self.assertEqual(
            events, {Notification.EVENT_TASK_CREATED, Notification.EVENT_TASK_COMPLETED}
        )

    def test_cross_user_removed_collaborator_and_scope_blocked(self):
        outsider_list = (
            TaskList.objects.filter(board__owner=self.other)
            .exclude(pk=self.board_list.pk)
            .first()
        )
        with self.assertRaises(PermissionDenied):
            self.call("get_tasks", list_id=outsider_list.pk, limit=50, offset=0)
        self.board.collaborators.remove(self.user)
        for operation in ("get_tasks", "add_task"):
            with self.assertRaises(PermissionDenied):
                self.call(
                    operation,
                    list_id=self.board_list.pk,
                    **(
                        {"limit": 50, "offset": 0}
                        if operation == "get_tasks"
                        else {"text": "Forbidden", "description": ""}
                    ),
                )
        self.board.collaborators.add(self.user)
        AccessToken.objects.filter(user=self.user).update(scope="notoli:read")
        with self.assertRaises(PermissionDenied):
            self.call(
                "add_task", list_id=self.board_list.pk, text="Forbidden", description=""
            )

    def test_validation_pagination_and_membership(self):
        for index in range(3):
            self.call(
                "add_task",
                list_id=self.board_list.pk,
                text=f"Task {index}",
                description="",
            )
        page = self.call("get_tasks", list_id=self.board_list.pk, limit=2, offset=0)
        self.assertEqual(page["next_offset"], 2)
        self.assertEqual(
            len(
                self.call("get_tasks", list_id=self.board_list.pk, limit=2, offset=2)[
                    "results"
                ]
            ),
            1,
        )
        before = Task.objects.count()
        with self.assertRaises(ValueError):
            self.call(
                "add_task", list_id=self.board_list.pk, text="x" * 256, description=""
            )
        self.assertEqual(Task.objects.count(), before)
        foreign = (
            Task.objects.filter(board__owner=self.other)
            .exclude(board=self.board)
            .first()
        )
        with self.assertRaises(PermissionDenied):
            self.call(
                "update_task",
                list_id=self.board_list.pk,
                task_id=foreign.pk,
                text=None,
                description=None,
                status="Complete",
            )
