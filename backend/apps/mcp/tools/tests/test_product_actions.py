"""Board, list, task and notification tool actions preserve domain rules."""

# ruff: noqa: E402 -- skip before importing optional OAuth ORM models.
from unittest import SkipTest

from django.conf import settings

if not settings.MCP_ENABLED:
    raise SkipTest("Run the enabled app-owned OAuth profile")


from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import Client, TestCase
from django.utils import timezone
from oauth2_provider.models import AccessToken, Application
from rest_framework_simplejwt.tokens import AccessToken as JWTToken

from apps.mcp.framework.errors import ConnectionPermissionDenied
from apps.notifications.models import Notification
from apps.tasks.models import Board, ListTask, Task
from apps.tasks.models import List as TaskList

from .. import queries, services
from ..models import Confirmation, Execution
from ..permissions import required_scopes
from .helpers import execute_action as execute
from .helpers import make_client, make_token


class ProductToolTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(
            "product-owner", email="product-owner@example.com"
        )
        self.member = get_user_model().objects.create_user(
            "product-member", email="product-member@example.com"
        )
        self.outsider = get_user_model().objects.create_user(
            "product-outsider", email="product-outsider@example.com"
        )
        self.app = make_client()
        for user, token in (
            (self.owner, "owner"),
            (self.member, "member"),
            (self.outsider, "outsider"),
        ):
            make_token(
                user,
                self.app,
                token,
                scope=" ".join(settings.OAUTH2_PROVIDER["SCOPES"]),
            )
        make_token(
            self.owner,
            self.app,
            "legacy",
            scope="notoli:read notoli:write notoli:share",
        )
        self.board = Board.objects.create(
            name="Work", owner=self.owner, created_by=self.owner
        )
        self.board.collaborators.add(self.member)
        self.first = TaskList.objects.create(
            name="First", board=self.board, created_by=self.owner
        )
        self.second = TaskList.objects.create(
            name="Second", board=self.board, created_by=self.owner, position=1
        )
        self.tasks = [
            Task.objects.create(
                board=self.board, created_by=self.owner, text=f"Task {i}"
            )
            for i in range(3)
        ]
        self.first.tasks.add(*self.tasks[:2])
        self.second.tasks.add(self.tasks[0])
        self.foreign_board = Board.objects.create(
            name="Private", owner=self.outsider, created_by=self.outsider
        )
        self.foreign_task = Task.objects.create(
            board=self.foreign_board, created_by=self.outsider, text="Secret"
        )

    def call(self, operation, token="owner", **arguments):
        return execute(token, operation, **arguments)

    def notification(self, user):
        return Notification.objects.create(
            recipient=user,
            actor=self.owner,
            board=self.board,
            board_name=self.board.name,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Activity",
            message="Task updated",
        )

    def test_board_and_list_lifecycle_preserves_owner_and_notifications(self):
        board = self.call("create_board", name="Travel", description="Plans")
        saved = Board.objects.get(pk=board["id"])
        self.assertEqual(saved.owner, self.owner)
        self.assertEqual(saved.created_by, self.owner)
        self.assertEqual(
            self.call("get_board", board_id=saved.pk),
            {key: board[key] for key in ("id", "name", "description")},
        )
        result = self.call("update_board", board_id=self.board.pk, name="Team")
        self.assertEqual(result["name"], "Team")
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.member, event_type=Notification.EVENT_BOARD_UPDATED
            ).exists()
        )
        new_list = self.call(
            "create_list",
            token="member",
            board_id=self.board.pk,
            name="Third",
            description="Next",
        )
        self.assertEqual(TaskList.objects.get(pk=new_list["id"]).position, 2)
        self.assertEqual(
            self.call("get_list", list_id=new_list["id"]),
            {key: new_list[key] for key in ("id", "name", "description", "board_id")},
        )
        changed = self.call(
            "update_list", token="member", list_id=new_list["id"], description="Updated"
        )
        self.assertEqual(changed["description"], "Updated")
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.owner, event_type=Notification.EVENT_LIST_UPDATED
            ).exists()
        )
        with self.assertRaises(ValueError):
            self.call("update_board", board_id=self.board.pk)
        with self.assertRaises(ValueError):
            self.call("update_list", list_id=self.first.pk, name="")

    def test_board_mutations_remain_owner_only_and_outsiders_are_denied(self):
        for operation, args in (
            ("update_board", {"board_id": self.board.pk, "name": "No"}),
            ("delete_board", {"board_id": self.board.pk}),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, token="member", **args)
        for operation, args in (
            ("get_board", {"board_id": self.board.pk}),
            (
                "create_list",
                {"board_id": self.board.pk, "name": "No", "description": ""},
            ),
            ("update_list", {"list_id": self.first.pk, "name": "No"}),
            ("delete_list", {"list_id": self.first.pk}),
            (
                "reorder_lists",
                {
                    "board_id": self.board.pk,
                    "ordered_ids": [self.second.pk, self.first.pk],
                },
            ),
            ("list_board_tasks", {"board_id": self.board.pk, "limit": 50, "offset": 0}),
            (
                "delete_task",
                {
                    "board_id": self.board.pk,
                    "task_id": self.tasks[0].pk,
                },
            ),
            ("attach_task", {"list_id": self.first.pk, "task_id": self.tasks[2].pk}),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, token="outsider", **args)
        self.board.refresh_from_db()
        self.assertEqual(self.board.name, "Work")
        self.assertFalse(Notification.objects.exists())

    def test_board_wide_tasks_include_orphans_and_use_existing_update_service(self):
        result = self.call(
            "list_board_tasks", board_id=self.board.pk, limit=2, offset=0
        )
        self.assertEqual(result["next_offset"], 2)
        orphan = self.call(
            "list_board_tasks", board_id=self.board.pk, limit=2, offset=2
        )["results"][0]
        self.assertEqual(orphan["id"], self.tasks[2].pk)
        self.assertIsNone(orphan["list_id"])
        self.assertNotIn("/list/None", orphan["url"])
        created = self.call(
            "add_board_task",
            token="member",
            board_id=self.board.pk,
            text="Orphan",
            description="Details",
        )
        self.assertFalse(ListTask.objects.filter(task_id=created["id"]).exists())
        changed = self.call(
            "update_board_task",
            token="member",
            board_id=self.board.pk,
            task_id=created["id"],
            status="Complete",
        )
        self.assertEqual(changed["status"], "Complete")
        self.assertEqual(
            self.call("get_task", board_id=self.board.pk, task_id=created["id"]),
            {
                key: value
                for key, value in changed.items()
                if key not in {"request_id", "execution_status", "applied", "replayed"}
            },
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.owner, event_type=Notification.EVENT_TASK_COMPLETED
            ).exists()
        )
        with self.assertRaises(PermissionDenied):
            self.call("get_task", board_id=self.board.pk, task_id=self.foreign_task.pk)
        with self.assertRaises(ValueError):
            self.call(
                "update_board_task",
                board_id=self.board.pk,
                task_id=self.tasks[0].pk,
                status="Invalid",
            )

    def test_reordering_requires_complete_unique_sets_and_is_per_list(self):
        self.call(
            "reorder_lists",
            token="member",
            board_id=self.board.pk,
            ordered_ids=[self.second.pk, self.first.pk],
        )
        self.assertEqual(
            list(self.board.lists.values_list("pk", flat=True)),
            [self.second.pk, self.first.pk],
        )
        self.call(
            "reorder_tasks",
            list_id=self.first.pk,
            ordered_ids=[self.tasks[1].pk, self.tasks[0].pk],
        )
        self.assertEqual(
            list(
                ListTask.objects.filter(list=self.first).values_list(
                    "task_id", flat=True
                )
            ),
            [self.tasks[1].pk, self.tasks[0].pk],
        )
        self.assertEqual(
            list(self.second.tasks.values_list("pk", flat=True)), [self.tasks[0].pk]
        )
        for operation, args in (
            (
                "reorder_lists",
                {"board_id": self.board.pk, "ordered_ids": [self.first.pk]},
            ),
            (
                "reorder_lists",
                {
                    "board_id": self.board.pk,
                    "ordered_ids": [self.first.pk, self.first.pk],
                },
            ),
            (
                "reorder_tasks",
                {"list_id": self.first.pk, "ordered_ids": [self.tasks[0].pk]},
            ),
            (
                "reorder_tasks",
                {
                    "list_id": self.first.pk,
                    "ordered_ids": [self.tasks[0].pk, self.foreign_task.pk],
                },
            ),
        ):
            with self.assertRaises(ValueError):
                self.call(operation, **args)

    def test_membership_replacement_keeps_tasks_and_rejects_cross_board_ids(self):
        self.call(
            "attach_task",
            token="member",
            list_id=self.first.pk,
            task_id=self.tasks[2].pk,
        )
        self.assertTrue(self.first.tasks.filter(pk=self.tasks[2].pk).exists())
        self.call(
            "set_list_tasks",
            list_id=self.first.pk,
            task_ids=[self.tasks[2].pk, self.tasks[0].pk],
        )
        self.assertEqual(
            list(
                ListTask.objects.filter(list=self.first).values_list(
                    "task_id", flat=True
                )
            ),
            [self.tasks[2].pk, self.tasks[0].pk],
        )
        self.assertTrue(Task.objects.filter(pk=self.tasks[1].pk).exists())
        self.assertTrue(self.second.tasks.filter(pk=self.tasks[0].pk).exists())
        for operation, args in (
            (
                "attach_task",
                {"list_id": self.first.pk, "task_id": self.foreign_task.pk},
            ),
            (
                "set_list_tasks",
                {"list_id": self.first.pk, "task_ids": [self.foreign_task.pk]},
            ),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, **args)
        with self.assertRaises(ValueError):
            self.call(
                "set_list_tasks", list_id=self.first.pk, task_ids=[self.tasks[0].pk] * 2
            )
        self.call("set_list_tasks", list_id=self.first.pk, task_ids=[])
        self.assertFalse(self.first.tasks.exists())
        self.assertEqual(Task.objects.filter(board=self.board).count(), 3)

    def test_deletion_confirmation_and_distinct_cascade_effects(self):
        for operation, args in (
            ("delete_board", {"board_id": self.board.pk}),
            ("delete_list", {"list_id": self.first.pk}),
            ("delete_task", {"board_id": self.board.pk, "task_id": self.tasks[0].pk}),
        ):
            for confirmation in (None, False, True, "true", 1):
                with self.assertRaises(ValueError):
                    self.call(operation, confirm=confirmation, **args)
        self.call("delete_list", token="member", list_id=self.first.pk)
        self.assertEqual(Task.objects.filter(board=self.board).count(), 3)
        self.call(
            "delete_task",
            token="member",
            board_id=self.board.pk,
            task_id=self.tasks[0].pk,
        )
        self.assertFalse(self.second.tasks.exists())
        self.assertFalse(Task.objects.filter(pk=self.tasks[0].pk).exists())
        self.call("delete_board", board_id=self.board.pk)
        self.assertFalse(Board.objects.filter(pk=self.board.pk).exists())
        self.assertFalse(TaskList.objects.filter(pk=self.second.pk).exists())
        self.assertFalse(Task.objects.filter(pk=self.tasks[2].pk).exists())
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.member,
                event_type=Notification.EVENT_BOARD_DELETED,
                board_name="Work",
            ).exists()
        )

    def test_notifications_are_recipient_only_and_preserve_read_timestamps(self):
        own = self.notification(self.owner)
        other = self.notification(self.member)
        result = self.call("list_notifications", limit=1, offset=0, unread_only=True)
        self.assertEqual([n["id"] for n in result["results"]], [own.pk])
        self.assertIsNone(result["next_offset"])
        result = self.call("update_notification", notification_id=own.pk, is_read=True)
        self.assertIsNotNone(result["read_at"])
        self.assertEqual(
            self.call("get_notification", notification_id=own.pk),
            {
                key: value
                for key, value in result.items()
                if key not in {"request_id", "execution_status", "applied", "replayed"}
            },
        )
        result = self.call("update_notification", notification_id=own.pk, is_read=False)
        self.assertIsNone(result["read_at"])
        self.assertEqual(self.call("mark_all_notifications_read")["count"], 1)
        other.refresh_from_db()
        self.assertFalse(other.is_read)
        for operation, args in (
            ("get_notification", {"notification_id": other.pk}),
            ("update_notification", {"notification_id": other.pk, "is_read": True}),
            ("delete_notification", {"notification_id": other.pk}),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, **args)
        with self.assertRaises(ValueError):
            self.call("delete_notification", notification_id=own.pk, confirm=False)
        self.call("delete_notification", notification_id=own.pk)
        self.notification(self.owner)
        with self.assertRaises(ValueError):
            self.call("clear_notifications", confirm=False)
        self.assertEqual(self.call("clear_notifications")["count"], 1)
        self.assertTrue(Notification.objects.filter(pk=other.pk).exists())

    def test_existing_connections_cannot_gain_organization_notifications_or_deletion(
        self,
    ):
        notification = self.notification(self.owner)
        for operation, args in (
            ("create_board", {"name": "New", "description": ""}),
            ("update_list", {"list_id": self.first.pk, "name": "No"}),
            ("attach_task", {"list_id": self.first.pk, "task_id": self.tasks[2].pk}),
            (
                "reorder_tasks",
                {
                    "list_id": self.first.pk,
                    "ordered_ids": [n.pk for n in self.tasks[:2]],
                },
            ),
            ("list_notifications", {"limit": 50, "offset": 0}),
            (
                "update_notification",
                {"notification_id": notification.pk, "is_read": True},
            ),
            (
                "delete_task",
                {
                    "board_id": self.board.pk,
                    "task_id": self.tasks[0].pk,
                },
            ),
            ("clear_notifications", {}),
        ):
            with self.assertRaises(ConnectionPermissionDenied) as denied:
                self.call(operation, token="legacy", **args)
            self.assertEqual(denied.exception.oauth_error, "insufficient_scope")
        make_token(
            self.owner, self.app, "delete-only", scope="notoli:read notoli:delete"
        )
        with self.assertRaises(ConnectionPermissionDenied):
            self.call("clear_notifications", token="delete-only")
        self.assertEqual(
            required_scopes("clear_notifications"),
            ["notoli:read", "notoli:notifications", "notoli:delete"],
        )

    def test_removed_creator_loses_access_to_every_product_action(self):
        self.first.created_by = self.member
        self.first.save()
        self.tasks[0].created_by = self.member
        self.tasks[0].save()
        self.board.collaborators.remove(self.member)
        for operation, args in (
            ("get_list", {"list_id": self.first.pk}),
            ("update_list", {"list_id": self.first.pk, "name": "No"}),
            ("get_task", {"board_id": self.board.pk, "task_id": self.tasks[0].pk}),
            (
                "update_board_task",
                {"board_id": self.board.pk, "task_id": self.tasks[0].pk, "text": "No"},
            ),
            (
                "delete_task",
                {
                    "board_id": self.board.pk,
                    "task_id": self.tasks[0].pk,
                },
            ),
            ("set_list_tasks", {"list_id": self.first.pk, "task_ids": []}),
            (
                "reorder_tasks",
                {
                    "list_id": self.first.pk,
                    "ordered_ids": [n.pk for n in self.tasks[:2]],
                },
            ),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, token="member", **args)

    def prepare_action(self, action="delete_board", token="owner", **arguments):
        if not arguments:
            arguments = {"board_id": self.board.pk}
        return services.execute(token, action, request_id=str(uuid4()), **arguments)

    def approval_client(self, user=None):
        return Client(
            HTTP_AUTHORIZATION=f"Bearer {JWTToken.for_user(user or self.owner)}"
        )

    def approve_action(self, prepared, decision="allow", *, user=None):
        client = self.approval_client(user)
        response = client.get(
            "/auth/mcp/action-approval/",
            {"approval_id": prepared["result"]["confirmation_id"]},
        )
        self.assertEqual(response.status_code, 200, response.content)
        response = client.post(
            "/auth/mcp/action-approval/",
            {"ticket": response.json()["ticket"], "decision": decision},
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def confirm_action(self, prepared, token="owner"):
        return services.confirm_change(
            token, prepared["request_id"], prepared["result"]["confirmation_id"]
        )

    def test_retired_task_receipt_keeps_its_uuid_reserved(self):
        request_id = str(uuid4())
        arguments = {"list_id": self.first.pk, "text": "Already added"}
        services.execute("owner", "add_task", request_id=request_id, **arguments)
        old_arguments = {
            "list_id": self.first.pk,
            "note": "Already added",
            "description": "",
        }
        Execution.objects.filter(pk=request_id).update(
            action="add_item",
            request_digest=services._digest(
                {"action": "add_item", "arguments": old_arguments}
            ),
        )

        with self.assertRaisesMessage(ValueError, "different action arguments"):
            services.execute("owner", "add_task", request_id=request_id, **arguments)
        self.assertTrue(
            Execution.objects.filter(pk=request_id, state="completed").exists()
        )
        self.assertEqual(Task.objects.filter(text="Already added").count(), 1)

    def test_retired_task_approval_cannot_delete_a_task(self):
        target = self.tasks[0]
        prepared = self.prepare_action(
            "delete_task", board_id=self.board.pk, task_id=target.pk
        )
        request_id = prepared["request_id"]
        reference = prepared["result"]["confirmation_id"]
        arguments = {"board_id": self.board.pk, "item_id": target.pk}
        Execution.objects.filter(pk=request_id).update(
            action="delete_item",
            state="approved",
            request_digest=services._digest(
                {"action": "delete_item", "arguments": arguments}
            ),
        )
        Confirmation.objects.filter(pk=reference).update(
            action="delete_item", payload=arguments
        )
        with self.assertRaisesMessage(
            ValueError, "original sensitive action identifiers"
        ):
            self.confirm_action(prepared)
        preview = self.approval_client().get(
            "/auth/mcp/action-approval/", {"approval_id": reference}
        )
        self.assertEqual(preview.json()["approval"]["status"], "cancelled")
        self.assertNotIn("ticket", preview.json())
        self.assertTrue(Task.objects.filter(pk=target.pk).exists())

    def test_old_fingerprint_cannot_approve_current_notification_deletion(self):
        notification = self.notification(self.owner)
        arguments = {"notification_id": notification.pk}
        prepared = self.prepare_action("delete_notification", **arguments)
        self.approve_action(prepared)
        snapshot = queries.snapshot(self.owner, "delete_notification", arguments, [])
        row = snapshot["notifications"][0]
        row["note_id"] = row.pop("task_id")
        row["event_type"] = "note_updated"
        Confirmation.objects.filter(pk=prepared["result"]["confirmation_id"]).update(
            fingerprint=services._digest(snapshot)
        )
        self.assertEqual(self.confirm_action(prepared)["status"], "cancelled")
        self.assertTrue(Notification.objects.filter(pk=notification.pk).exists())

    def test_routine_uuid_receipt_preserves_status_and_prevents_duplicate_creation(
        self,
    ):
        request_id = str(uuid4())
        args = {"list_id": self.first.pk, "text": "Once", "description": ""}
        with self.assertRaises(ValueError):
            services.execute("owner", "add_task", **args)
        first = services.execute("owner", "add_task", request_id=request_id, **args)
        replay = services.execute("owner", "add_task", request_id=request_id, **args)
        self.assertEqual(first["status"], "Not Started")
        self.assertEqual(first["execution_status"], "completed")
        self.assertEqual(replay, dict(first, replayed=True))
        self.assertEqual(Task.objects.filter(text="Once").count(), 1)
        self.assertFalse(Confirmation.objects.exists())
        with self.assertRaises(ValueError):
            services.execute(
                "owner", "add_task", request_id=request_id, **dict(args, text="Changed")
            )
        with self.assertRaises(PermissionDenied):
            services.execute("member", "add_task", request_id=request_id, **args)
        app = Application.objects.create(
            client_id="other-client",
            client_type="public",
            authorization_grant_type="authorization-code",
        )
        make_token(self.owner, app, "other-client", scope="notoli:read notoli:write")
        with self.assertRaises(PermissionDenied):
            services.execute("other-client", "add_task", request_id=request_id, **args)
        AccessToken.objects.filter(token="owner").update(scope="notoli:read")
        with self.assertRaises(ConnectionPermissionDenied):
            services.execute("owner", "add_task", request_id=request_id, **args)

    def test_routine_receipt_failure_rolls_back_mutation_and_notifications(self):
        before = Notification.objects.count()
        with patch.object(
            Execution, "save", side_effect=RuntimeError("receipt failed")
        ):
            with self.assertRaises(RuntimeError):
                services.execute(
                    "owner",
                    "add_task",
                    request_id=str(uuid4()),
                    list_id=self.first.pk,
                    text="Rollback",
                    description="",
                )
        self.assertFalse(Task.objects.filter(text="Rollback").exists())
        self.assertEqual(Notification.objects.count(), before)
        self.assertFalse(Execution.objects.exists())

    def test_separate_jwt_approval_cancel_and_tampered_tickets_never_mutate(self):
        prepared = self.prepare_action()
        self.assertEqual(self.confirm_action(prepared)["status"], "prepared")
        self.assertTrue(Board.objects.filter(pk=self.board.pk).exists())
        url, args = (
            "/auth/mcp/action-approval/",
            {"approval_id": prepared["result"]["confirmation_id"]},
        )
        self.assertEqual(
            Client(HTTP_AUTHORIZATION="Bearer owner").get(url, args).status_code, 401
        )
        cookie = Client()
        cookie.force_login(self.owner)
        self.assertEqual(cookie.get(url, args).status_code, 401)
        self.assertEqual(
            self.approval_client(self.outsider).get(url, args).status_code, 404
        )
        client = self.approval_client()
        preview = client.get(url, args).json()
        self.assertEqual(preview["approval"]["current"]["board"]["id"], self.board.pk)
        self.assertEqual(
            client.post(
                url, {"ticket": preview["ticket"] + "x", "decision": "allow"}
            ).status_code,
            400,
        )
        approved = self.approve_action(prepared)
        cancelled = client.post(
            url, {"ticket": approved["ticket"], "decision": "cancel"}
        )
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(self.confirm_action(prepared)["status"], "cancelled")
        self.assertTrue(Board.objects.filter(pk=self.board.pk).exists())
        self.assertFalse(Confirmation.objects.exists())

    def test_stale_content_collaborators_memberships_and_payload_cancel_actions(self):
        prepared = self.prepare_action(
            "delete_task", board_id=self.board.pk, task_id=self.tasks[0].pk
        )
        Task.objects.filter(pk=self.tasks[0].pk).update(description="Changed content")
        self.assertEqual(self.confirm_action(prepared)["status"], "cancelled")
        prepared = self.prepare_action(
            "set_list_tasks", list_id=self.first.pk, task_ids=[]
        )
        self.first.tasks.add(self.tasks[2])
        self.assertEqual(self.confirm_action(prepared)["status"], "cancelled")
        prepared = self.prepare_action()
        self.board.collaborators.add(self.outsider)
        self.assertEqual(self.confirm_action(prepared)["status"], "cancelled")
        prepared = self.prepare_action("delete_list", list_id=self.first.pk)
        Confirmation.objects.filter(pk=prepared["result"]["confirmation_id"]).update(
            payload={"list_id": self.second.pk}
        )
        self.assertEqual(self.confirm_action(prepared)["status"], "cancelled")
        self.assertTrue(self.first.tasks.exists())
        self.assertTrue(Board.objects.filter(pk=self.board.pk).exists())
        for args in (
            {"tasks": []},
            {"board": self.foreign_board.pk},
            {"owner": self.outsider.pk},
        ):
            with self.assertRaises(ValueError):
                services.execute(
                    "owner",
                    "update_list",
                    request_id=str(uuid4()),
                    list_id=self.first.pk,
                    **args,
                )

    def test_frozen_bulk_selection_and_completed_delete_replay(self):
        original = self.notification(self.owner)
        prepared = services.execute(
            "owner", "clear_notifications", request_id=str(uuid4())
        )
        self.approve_action(prepared)
        incoming = self.notification(self.owner)
        done = self.confirm_action(prepared)
        self.assertEqual(done["status"], "completed")
        self.assertEqual(done["result"]["count"], 1)
        self.assertFalse(Notification.objects.filter(pk=original.pk).exists())
        self.assertTrue(Notification.objects.filter(pk=incoming.pk).exists())
        self.assertEqual(self.confirm_action(prepared), dict(done, replayed=True))
        prepared = self.prepare_action()
        self.approve_action(prepared)
        done = self.confirm_action(prepared)
        self.assertFalse(Board.objects.filter(pk=self.board.pk).exists())
        self.assertEqual(self.confirm_action(prepared), dict(done, replayed=True))

    def test_original_token_expiry_and_actual_stored_scopes_are_required(self):
        prepared = self.prepare_action()
        make_token(
            self.owner, self.app, "replacement", scope="notoli:read notoli:delete"
        )
        with self.assertRaises(PermissionDenied):
            self.confirm_action(prepared, "replacement")
        self.approve_action(prepared)
        AccessToken.objects.filter(token="owner").update(scope="notoli:read")
        with self.assertRaises(ConnectionPermissionDenied) as failure:
            self.confirm_action(prepared)
        self.assertIn("notoli:delete", failure.exception.required_scopes)
        AccessToken.objects.filter(token="owner").update(
            scope="notoli:read notoli:delete"
        )
        Confirmation.objects.filter(pk=prepared["result"]["confirmation_id"]).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(self.confirm_action(prepared)["status"], "expired")
        self.assertTrue(Board.objects.filter(pk=self.board.pk).exists())

    def test_pending_caps_purge_private_data_and_preview_budget_fail_closed(self):
        for _ in range(10):
            self.prepare_action()
        with self.assertRaises(ValueError):
            self.prepare_action()
        Confirmation.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.prepare_action()
        self.assertEqual(Confirmation.objects.count(), 1)
        self.assertEqual(Execution.objects.filter(state="expired").count(), 10)
        before = Execution.objects.count()
        Board.objects.filter(pk=self.board.pk).update(description="x" * 262145)
        with self.assertRaises(ValueError):
            self.prepare_action()
        self.assertEqual(Execution.objects.count(), before)
        self.assertTrue(Board.objects.filter(pk=self.board.pk).exists())
        Board.objects.filter(pk=self.board.pk).update(description="x" * 240000)
        prepared = self.prepare_action()
        preview = self.approval_client().get(
            "/auth/mcp/action-approval/",
            {"approval_id": prepared["result"]["confirmation_id"]},
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(
            len(preview.json()["approval"]["current"]["board"]["description"]), 240000
        )

    def test_routine_replay_requires_live_shared_board_membership(self):
        request_id = str(uuid4())
        args = {"list_id": self.first.pk, "text": "Member action", "description": ""}
        services.execute("member", "add_task", request_id=request_id, **args)
        self.board.collaborators.remove(self.member)
        with self.assertRaises(PermissionDenied):
            services.execute("member", "add_task", request_id=request_id, **args)
        self.assertEqual(Task.objects.filter(text="Member action").count(), 1)

    def test_deferred_collaborator_addition_is_cancelled_before_it_can_grant_access(
        self,
    ):
        arguments = {"board_id": self.board.pk, "identifier": self.outsider.email}
        prepared = self.prepare_action()
        request_id = prepared["request_id"]
        reference = prepared["result"]["confirmation_id"]
        Execution.objects.filter(pk=request_id).update(
            action="add_board_collaborator",
            request_digest=services._digest(
                {"action": "add_board_collaborator", "arguments": arguments}
            ),
        )
        Confirmation.objects.filter(pk=reference).update(
            action="add_board_collaborator", payload=arguments
        )
        retry = services.execute(
            "owner", "add_board_collaborator", request_id=request_id, **arguments
        )
        self.assertEqual(retry["status"], "cancelled")
        self.assertFalse(self.board.collaborators.filter(pk=self.outsider.pk).exists())
        direct = self.prepare_action("add_board_collaborator", **arguments)
        self.assertEqual(direct["status"], "completed")
        self.assertTrue(self.board.collaborators.filter(pk=self.outsider.pk).exists())

    def test_membership_additions_and_reorders_are_direct_but_omissions_prepare(self):
        args = {
            "list_id": self.first.pk,
            "task_ids": [row.pk for row in reversed(self.tasks)],
        }
        request_id = str(uuid4())
        output = services.execute(
            "member", "set_list_tasks", request_id=request_id, **args
        )
        self.assertEqual(output["status"], "completed")
        self.assertEqual(output["result"]["ordered_ids"], args["task_ids"])
        self.assertTrue(
            services.execute("member", "set_list_tasks", request_id=request_id, **args)[
                "replayed"
            ]
        )
        self.assertFalse(Confirmation.objects.exists())
        removed = self.prepare_action(
            "set_list_tasks", list_id=self.first.pk, task_ids=[self.tasks[0].pk]
        )
        self.assertEqual(removed["status"], "prepared")
        self.assertEqual(self.first.tasks.count(), 3)
        self.board.collaborators.remove(self.member)
        with self.assertRaises(PermissionDenied):
            services.execute("member", "set_list_tasks", request_id=request_id, **args)
        self.assertEqual(self.confirm_action(removed)["status"], "cancelled")
        removed = self.prepare_action(
            "set_list_tasks", list_id=self.first.pk, task_ids=[self.tasks[0].pk]
        )
        self.approve_action(removed)
        self.confirm_action(removed)
        self.assertEqual(
            list(self.first.tasks.values_list("pk", flat=True)), [self.tasks[0].pk]
        )

    def test_completed_membership_receipt_requires_current_board_access(self):
        prepared = self.prepare_action(
            "set_list_tasks", token="member", list_id=self.first.pk, task_ids=[]
        )
        self.approve_action(prepared, user=self.member)
        self.assertEqual(self.confirm_action(prepared, "member")["status"], "completed")
        self.board.collaborators.remove(self.member)
        with self.assertRaises(PermissionDenied):
            self.confirm_action(prepared, "member")

    def test_membership_policy_reads_live_set_after_board_lock(
        self,
    ):
        locked_board = queries.tasks._locked_board

        def add_before_lock_returns(actor, board_id):
            board = locked_board(actor, board_id)
            self.first.tasks.add(self.tasks[2])
            return board

        with patch.object(
            queries.tasks, "_locked_board", side_effect=add_before_lock_returns
        ):
            pending = self.prepare_action(
                "set_list_tasks",
                list_id=self.first.pk,
                task_ids=[task.pk for task in self.tasks[:2]],
            )
        self.assertEqual(pending["status"], "prepared")
        self.assertTrue(self.first.tasks.filter(pk=self.tasks[2].pk).exists())

    def test_pending_membership_additions_cannot_execute_as_removals(self):
        prepared = self.prepare_action(
            "set_list_tasks", list_id=self.first.pk, task_ids=[]
        )
        # Both requests cover the same list, tasks and memberships. The saved
        # fingerprint still matches, but the old request would remove nothing.
        members = [task.pk for task in self.tasks[:2]]
        arguments = {"list_id": self.first.pk, "task_ids": list(reversed(members))}
        Execution.objects.filter(pk=prepared["request_id"]).update(
            state="approved",
            request_digest=services._digest(
                {"action": "set_list_tasks", "arguments": arguments}
            ),
        )
        Confirmation.objects.filter(pk=prepared["result"]["confirmation_id"]).update(
            payload=arguments
        )
        self.assertEqual(self.confirm_action(prepared)["status"], "cancelled")
        self.assertEqual(
            list(
                self.first.task_memberships.order_by("position").values_list(
                    "task_id", flat=True
                )
            ),
            members,
        )
