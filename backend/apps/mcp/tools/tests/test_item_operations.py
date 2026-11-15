"""Core item tools enforce scopes, access, validation and pagination."""

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import TestCase
from oauth2_provider.models import AccessToken

from apps.notes.models import Board, ListNote, Note
from apps.notes.models import List as NoteList
from apps.notifications.models import Notification

from ..services import execute
from .helpers import make_client, make_token


class ItemToolTests(TestCase):
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
        self.note_list = NoteList.objects.create(
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
            self.note_list.pk,
        )
        item = self.call(
            "add_item",
            list_id=self.note_list.pk,
            note="Buy milk",
            description="Two cartons",
        )
        self.assertEqual(Note.objects.get(pk=item["id"]).created_by, self.user)
        self.assertTrue(
            ListNote.objects.filter(list=self.note_list, note_id=item["id"]).exists()
        )
        updated = self.call(
            "update_item",
            list_id=self.note_list.pk,
            item_id=item["id"],
            note=None,
            description=None,
            status="Complete",
        )
        self.assertEqual(updated["status"], "Complete")
        self.assertEqual(
            self.call("get_items", list_id=self.note_list.pk, limit=50, offset=0)[
                "results"
            ][0]["id"],
            item["id"],
        )
        events = set(
            Notification.objects.filter(
                recipient=self.other, note_id=item["id"]
            ).values_list("event_type", flat=True)
        )
        self.assertEqual(
            events, {Notification.EVENT_NOTE_CREATED, Notification.EVENT_NOTE_COMPLETED}
        )

    def test_cross_user_removed_collaborator_and_scope_blocked(self):
        outsider_list = (
            NoteList.objects.filter(board__owner=self.other)
            .exclude(pk=self.note_list.pk)
            .first()
        )
        with self.assertRaises(PermissionDenied):
            self.call("get_items", list_id=outsider_list.pk, limit=50, offset=0)
        self.board.collaborators.remove(self.user)
        for operation in ("get_items", "add_item"):
            with self.assertRaises(PermissionDenied):
                self.call(
                    operation,
                    list_id=self.note_list.pk,
                    limit=50,
                    offset=0,
                    note="Forbidden",
                    description="",
                )
        self.board.collaborators.add(self.user)
        AccessToken.objects.filter(user=self.user).update(scope="notoli:read")
        with self.assertRaises(PermissionDenied):
            self.call(
                "add_item", list_id=self.note_list.pk, note="Forbidden", description=""
            )

    def test_validation_pagination_and_membership(self):
        for index in range(3):
            self.call(
                "add_item",
                list_id=self.note_list.pk,
                note=f"Item {index}",
                description="",
            )
        page = self.call("get_items", list_id=self.note_list.pk, limit=2, offset=0)
        self.assertEqual(page["next_offset"], 2)
        self.assertEqual(
            len(
                self.call("get_items", list_id=self.note_list.pk, limit=2, offset=2)[
                    "results"
                ]
            ),
            1,
        )
        before = Note.objects.count()
        with self.assertRaises(ValueError):
            self.call(
                "add_item", list_id=self.note_list.pk, note="x" * 256, description=""
            )
        self.assertEqual(Note.objects.count(), before)
        foreign = (
            Note.objects.filter(board__owner=self.other)
            .exclude(board=self.board)
            .first()
        )
        with self.assertRaises(PermissionDenied):
            self.call(
                "update_item",
                list_id=self.note_list.pk,
                item_id=foreign.pk,
                note=None,
                description=None,
                status="Complete",
            )
