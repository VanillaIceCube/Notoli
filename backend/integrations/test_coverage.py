"""Product coverage and authorization boundaries for the expanded MCP tools."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import TestCase

from notes.models import Board, ListNote, Note
from notes.models import List as NoteList
from notifications.models import Notification

from .oauth import ConnectionPermissionDenied, required_scopes
from .tests import make_client, make_token
from .tools import execute


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
        self.first = NoteList.objects.create(
            name="First", board=self.board, created_by=self.owner
        )
        self.second = NoteList.objects.create(
            name="Second", board=self.board, created_by=self.owner, position=1
        )
        self.items = [
            Note.objects.create(
                board=self.board, created_by=self.owner, note=f"Task {i}"
            )
            for i in range(3)
        ]
        self.first.notes.add(*self.items[:2])
        self.second.notes.add(self.items[0])
        self.foreign_board = Board.objects.create(
            name="Private", owner=self.outsider, created_by=self.outsider
        )
        self.foreign_item = Note.objects.create(
            board=self.foreign_board, created_by=self.outsider, note="Secret"
        )

    def call(self, operation, token="owner", **arguments):
        return execute(token, operation, **arguments)

    def notification(self, user):
        return Notification.objects.create(
            recipient=user,
            actor=self.owner,
            board=self.board,
            board_name=self.board.name,
            event_type=Notification.EVENT_NOTE_UPDATED,
            title="Activity",
            message="Task updated",
        )

    def test_board_and_list_lifecycle_preserves_owner_and_notifications(self):
        board = self.call("create_board", name="Travel", description="Plans")
        saved = Board.objects.get(pk=board["id"])
        self.assertEqual(saved.owner, self.owner)
        self.assertEqual(saved.created_by, self.owner)
        self.assertEqual(self.call("get_board", board_id=saved.pk), board)
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
        self.assertEqual(NoteList.objects.get(pk=new_list["id"]).position, 2)
        self.assertEqual(self.call("get_list", list_id=new_list["id"]), new_list)
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
            ("delete_board", {"board_id": self.board.pk, "confirm": True}),
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
            ("delete_list", {"list_id": self.first.pk, "confirm": True}),
            (
                "reorder_lists",
                {
                    "board_id": self.board.pk,
                    "ordered_ids": [self.second.pk, self.first.pk],
                },
            ),
            ("list_board_items", {"board_id": self.board.pk, "limit": 50, "offset": 0}),
            (
                "delete_item",
                {
                    "board_id": self.board.pk,
                    "item_id": self.items[0].pk,
                    "confirm": True,
                },
            ),
            ("attach_item", {"list_id": self.first.pk, "item_id": self.items[2].pk}),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, token="outsider", **args)
        self.board.refresh_from_db()
        self.assertEqual(self.board.name, "Work")
        self.assertFalse(Notification.objects.exists())

    def test_board_wide_items_include_orphans_and_use_existing_update_service(self):
        result = self.call(
            "list_board_items", board_id=self.board.pk, limit=2, offset=0
        )
        self.assertEqual(result["next_offset"], 2)
        orphan = self.call(
            "list_board_items", board_id=self.board.pk, limit=2, offset=2
        )["results"][0]
        self.assertEqual(orphan["id"], self.items[2].pk)
        self.assertIsNone(orphan["list_id"])
        self.assertNotIn("/list/None", orphan["url"])
        created = self.call(
            "add_board_item",
            token="member",
            board_id=self.board.pk,
            note="Orphan",
            description="Details",
        )
        self.assertFalse(ListNote.objects.filter(note_id=created["id"]).exists())
        changed = self.call(
            "update_board_item",
            token="member",
            board_id=self.board.pk,
            item_id=created["id"],
            status="Complete",
        )
        self.assertEqual(changed["status"], "Complete")
        self.assertEqual(
            self.call("get_item", board_id=self.board.pk, item_id=created["id"]),
            changed,
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.owner, event_type=Notification.EVENT_NOTE_COMPLETED
            ).exists()
        )
        with self.assertRaises(PermissionDenied):
            self.call("get_item", board_id=self.board.pk, item_id=self.foreign_item.pk)
        with self.assertRaises(ValueError):
            self.call(
                "update_board_item",
                board_id=self.board.pk,
                item_id=self.items[0].pk,
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
            "reorder_items",
            list_id=self.first.pk,
            ordered_ids=[self.items[1].pk, self.items[0].pk],
        )
        self.assertEqual(
            list(
                ListNote.objects.filter(list=self.first).values_list(
                    "note_id", flat=True
                )
            ),
            [self.items[1].pk, self.items[0].pk],
        )
        self.assertEqual(
            list(self.second.notes.values_list("pk", flat=True)), [self.items[0].pk]
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
                "reorder_items",
                {"list_id": self.first.pk, "ordered_ids": [self.items[0].pk]},
            ),
            (
                "reorder_items",
                {
                    "list_id": self.first.pk,
                    "ordered_ids": [self.items[0].pk, self.foreign_item.pk],
                },
            ),
        ):
            with self.assertRaises(ValueError):
                self.call(operation, **args)

    def test_membership_replacement_keeps_items_and_rejects_cross_board_ids(self):
        self.call(
            "attach_item",
            token="member",
            list_id=self.first.pk,
            item_id=self.items[2].pk,
        )
        self.assertTrue(self.first.notes.filter(pk=self.items[2].pk).exists())
        self.call(
            "set_list_items",
            list_id=self.first.pk,
            item_ids=[self.items[2].pk, self.items[0].pk],
        )
        self.assertEqual(
            list(
                ListNote.objects.filter(list=self.first).values_list(
                    "note_id", flat=True
                )
            ),
            [self.items[2].pk, self.items[0].pk],
        )
        self.assertTrue(Note.objects.filter(pk=self.items[1].pk).exists())
        self.assertTrue(self.second.notes.filter(pk=self.items[0].pk).exists())
        for operation, args in (
            (
                "attach_item",
                {"list_id": self.first.pk, "item_id": self.foreign_item.pk},
            ),
            (
                "set_list_items",
                {"list_id": self.first.pk, "item_ids": [self.foreign_item.pk]},
            ),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, **args)
        with self.assertRaises(ValueError):
            self.call(
                "set_list_items", list_id=self.first.pk, item_ids=[self.items[0].pk] * 2
            )
        self.call("set_list_items", list_id=self.first.pk, item_ids=[])
        self.assertFalse(self.first.notes.exists())
        self.assertEqual(Note.objects.filter(board=self.board).count(), 3)

    def test_deletion_confirmation_and_distinct_cascade_effects(self):
        for operation, args in (
            ("delete_board", {"board_id": self.board.pk}),
            ("delete_list", {"list_id": self.first.pk}),
            ("delete_item", {"board_id": self.board.pk, "item_id": self.items[0].pk}),
        ):
            for confirmation in (None, False, "true", 1):
                with self.assertRaises(ValueError):
                    self.call(operation, confirm=confirmation, **args)
        self.call("delete_list", token="member", list_id=self.first.pk, confirm=True)
        self.assertEqual(Note.objects.filter(board=self.board).count(), 3)
        self.call(
            "delete_item",
            token="member",
            board_id=self.board.pk,
            item_id=self.items[0].pk,
            confirm=True,
        )
        self.assertFalse(self.second.notes.exists())
        self.assertFalse(Note.objects.filter(pk=self.items[0].pk).exists())
        self.call("delete_board", board_id=self.board.pk, confirm=True)
        self.assertFalse(Board.objects.filter(pk=self.board.pk).exists())
        self.assertFalse(NoteList.objects.filter(pk=self.second.pk).exists())
        self.assertFalse(Note.objects.filter(pk=self.items[2].pk).exists())
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
        self.assertEqual(self.call("get_notification", notification_id=own.pk), result)
        result = self.call("update_notification", notification_id=own.pk, is_read=False)
        self.assertIsNone(result["read_at"])
        self.assertEqual(self.call("mark_all_notifications_read")["count"], 1)
        other.refresh_from_db()
        self.assertFalse(other.is_read)
        for operation, args in (
            ("get_notification", {"notification_id": other.pk}),
            ("update_notification", {"notification_id": other.pk, "is_read": True}),
            ("delete_notification", {"notification_id": other.pk, "confirm": True}),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, **args)
        with self.assertRaises(ValueError):
            self.call("delete_notification", notification_id=own.pk, confirm=False)
        self.call("delete_notification", notification_id=own.pk, confirm=True)
        self.notification(self.owner)
        with self.assertRaises(ValueError):
            self.call("clear_notifications", confirm=False)
        self.assertEqual(self.call("clear_notifications", confirm=True)["count"], 1)
        self.assertTrue(Notification.objects.filter(pk=other.pk).exists())

    def test_existing_connections_cannot_gain_organization_notifications_or_deletion(
        self,
    ):
        notification = self.notification(self.owner)
        for operation, args in (
            ("create_board", {"name": "New", "description": ""}),
            ("update_list", {"list_id": self.first.pk, "name": "No"}),
            ("attach_item", {"list_id": self.first.pk, "item_id": self.items[2].pk}),
            (
                "reorder_items",
                {
                    "list_id": self.first.pk,
                    "ordered_ids": [n.pk for n in self.items[:2]],
                },
            ),
            ("list_notifications", {"limit": 50, "offset": 0}),
            (
                "update_notification",
                {"notification_id": notification.pk, "is_read": True},
            ),
            (
                "delete_item",
                {
                    "board_id": self.board.pk,
                    "item_id": self.items[0].pk,
                    "confirm": True,
                },
            ),
            ("clear_notifications", {"confirm": True}),
        ):
            with self.assertRaises(ConnectionPermissionDenied) as denied:
                self.call(operation, token="legacy", **args)
            self.assertEqual(denied.exception.oauth_error, "insufficient_scope")
        make_token(
            self.owner, self.app, "delete-only", scope="notoli:read notoli:delete"
        )
        with self.assertRaises(ConnectionPermissionDenied):
            self.call("clear_notifications", token="delete-only", confirm=True)
        self.assertEqual(
            required_scopes("clear_notifications"),
            ["notoli:read", "notoli:notifications", "notoli:delete"],
        )

    def test_removed_creator_loses_access_to_every_product_action(self):
        self.first.created_by = self.member
        self.first.save()
        self.items[0].created_by = self.member
        self.items[0].save()
        self.board.collaborators.remove(self.member)
        for operation, args in (
            ("get_list", {"list_id": self.first.pk}),
            ("update_list", {"list_id": self.first.pk, "name": "No"}),
            ("get_item", {"board_id": self.board.pk, "item_id": self.items[0].pk}),
            (
                "update_board_item",
                {"board_id": self.board.pk, "item_id": self.items[0].pk, "note": "No"},
            ),
            (
                "delete_item",
                {
                    "board_id": self.board.pk,
                    "item_id": self.items[0].pk,
                    "confirm": True,
                },
            ),
            ("set_list_items", {"list_id": self.first.pk, "item_ids": []}),
            (
                "reorder_items",
                {
                    "list_id": self.first.pk,
                    "ordered_ids": [n.pk for n in self.items[:2]],
                },
            ),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, token="member", **args)
