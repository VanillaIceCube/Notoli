"""Sharing tools preserve ownership, membership and notification boundaries."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import TestCase
from oauth2_provider.models import AccessToken

from apps.notes.models import Board
from apps.notes.models import List as NoteList
from apps.notifications.models import Notification

from ..tools import execute
from .helpers import make_client, make_token


class SharingToolTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(
            "sharing-owner", email="owner@example.com"
        )
        self.member = get_user_model().objects.create_user(
            "sharing-member", email="member@example.com"
        )
        self.target = get_user_model().objects.create_user(
            "sharing-target", email="target@example.com"
        )
        self.outsider = get_user_model().objects.create_user("sharing-outsider")
        self.app = make_client()
        self.board = Board.objects.create(
            name="Team", owner=self.owner, created_by=self.owner
        )
        self.board.collaborators.add(self.member)
        self.lists = [
            NoteList.objects.create(
                name=f"Team list {index}", board=self.board, created_by=self.owner
            )
            for index in range(2)
        ]
        self.owner_token = make_token(
            self.owner, self.app, "owner-sharing", scope="notoli:read notoli:share"
        )
        make_token(
            self.member,
            self.app,
            "member-sharing",
            scope="notoli:read notoli:write notoli:share",
        )
        make_token(
            self.outsider,
            self.app,
            "outsider-sharing",
            scope="notoli:read notoli:share",
        )
        make_token(self.target, self.app, "target-reading", scope="notoli:read")

    def call(self, operation, token="owner-sharing", **arguments):
        return execute(token, operation, board_id=self.board.pk, **arguments)

    def test_member_can_read_owner_and_paginated_collaborators(self):
        self.board.collaborators.add(self.target)
        result = self.call(
            "get_board_collaborators", token="member-sharing", limit=1, offset=0
        )
        self.assertEqual(result["owner"]["id"], self.owner.pk)
        self.assertEqual(result["sharing_level"], "board")
        self.assertFalse(result["can_manage_collaborators"])
        self.assertEqual(result["results"][0]["email"], self.member.email)
        self.assertEqual(result["next_offset"], 1)
        next_page = self.call(
            "get_board_collaborators", token="member-sharing", limit=1, offset=1
        )
        self.assertEqual(next_page["results"][0]["id"], self.target.pk)
        self.assertIsNone(next_page["next_offset"])
        self.board.collaborators.remove(self.member)
        for token in ("member-sharing", "outsider-sharing"):
            with self.assertRaises(PermissionDenied):
                self.call("get_board_collaborators", token=token, limit=50, offset=0)

    def test_owner_adds_by_email_shares_all_lists_and_preserves_notifications(self):
        result = self.call("add_board_collaborator", identifier=" TARGET@EXAMPLE.COM ")
        self.assertEqual(result["action"], "added")
        self.assertEqual(result["sharing_level"], "board")
        self.assertTrue(self.board.collaborators.filter(pk=self.target.pk).exists())
        self.assertEqual(
            {
                row["id"]
                for row in execute(
                    "target-reading",
                    "list_lists",
                    board_id=self.board.pk,
                    limit=50,
                    offset=0,
                )["results"]
            },
            {note_list.pk for note_list in self.lists},
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.target,
                board=self.board,
                event_type=Notification.EVENT_COLLABORATOR_ADDED,
            ).exists()
        )

        self.assertTrue(
            Notification.objects.filter(
                recipient=self.member,
                board=self.board,
                event_type=Notification.EVENT_COLLABORATOR_ADDED,
            ).exists()
        )

    def test_ambiguous_sharing_identity_is_rejected_without_side_effects(self):
        before = Notification.objects.count()
        for username in (self.target.email.upper(), self.target.username.upper()):
            with self.subTest(username=username):
                collision = get_user_model().objects.create_user(
                    username, email="collision@example.com"
                )
                with self.assertRaisesRegex(ValueError, "multiple accounts"):
                    self.call(
                        "add_board_collaborator", identifier=f" {username.lower()} "
                    )
                self.assertFalse(
                    self.board.collaborators.filter(
                        pk__in=[self.target.pk, collision.pk]
                    ).exists()
                )
                self.assertEqual(Notification.objects.count(), before)
                collision.delete()
        # Matching both fields of one user is one identity, not ambiguous.
        self.target.username = self.target.email
        self.target.save(update_fields=["username"])
        self.call("add_board_collaborator", identifier=self.target.email.upper())
        self.assertTrue(self.board.collaborators.filter(pk=self.target.pk).exists())

    def test_owner_removes_collaborator_and_access_ends_immediately(self):
        self.call("add_board_collaborator", identifier=self.target.username)
        result = self.call("remove_board_collaborator", user_id=self.target.pk)
        self.assertEqual(result["action"], "removed")
        self.assertFalse(self.board.collaborators.filter(pk=self.target.pk).exists())
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.target,
                board=self.board,
                event_type=Notification.EVENT_COLLABORATOR_REMOVED,
            ).exists()
        )
        for note_list in self.lists:
            with self.assertRaises(PermissionDenied):
                execute(
                    "target-reading",
                    "get_items",
                    list_id=note_list.pk,
                    limit=50,
                    offset=0,
                )
        with self.assertRaises(PermissionDenied):
            self.call(
                "get_board_collaborators", token="target-reading", limit=50, offset=0
            )

    def test_nonowners_cannot_manage_members_even_with_sharing_scope(self):
        before = Notification.objects.count()
        for token in ("member-sharing", "outsider-sharing"):
            for operation, arguments in (
                ("add_board_collaborator", {"identifier": self.target.email}),
                ("remove_board_collaborator", {"user_id": self.member.pk}),
            ):
                with self.assertRaises(PermissionDenied):
                    self.call(operation, token=token, **arguments)
        self.assertFalse(self.board.collaborators.filter(pk=self.target.pk).exists())
        self.assertTrue(self.board.collaborators.filter(pk=self.member.pk).exists())
        self.assertEqual(Notification.objects.count(), before)

    def test_existing_read_write_tokens_cannot_change_sharing(self):
        AccessToken.objects.filter(pk=self.owner_token.pk).update(
            scope="notoli:read notoli:write"
        )
        result = self.call("get_board_collaborators", limit=50, offset=0)
        self.assertEqual(result["owner"]["id"], self.owner.pk)
        self.assertTrue(result["can_manage_collaborators"])
        for operation, arguments in (
            ("add_board_collaborator", {"identifier": self.target.email}),
            ("remove_board_collaborator", {"user_id": self.member.pk}),
        ):
            with self.assertRaises(PermissionDenied):
                self.call(operation, **arguments)
        self.assertTrue(self.board.collaborators.filter(pk=self.member.pk).exists())
        self.assertFalse(self.board.collaborators.filter(pk=self.target.pk).exists())

    def test_duplicates_unknown_users_and_owner_removal_are_rejected_without_changes(
        self,
    ):
        before = Notification.objects.count()
        for operation, arguments in (
            ("add_board_collaborator", {"identifier": self.owner.email}),
            ("add_board_collaborator", {"identifier": self.member.username}),
            ("add_board_collaborator", {"identifier": "missing@example.com"}),
            ("add_board_collaborator", {"identifier": " "}),
            ("remove_board_collaborator", {"user_id": self.owner.pk}),
            ("remove_board_collaborator", {"user_id": self.target.pk}),
        ):
            with self.assertRaises(ValueError):
                self.call(operation, **arguments)
        self.assertEqual(Notification.objects.count(), before)
        self.assertEqual(
            list(self.board.collaborators.values_list("pk", flat=True)),
            [self.member.pk],
        )

    def test_notification_failure_rolls_back_membership(self):
        with patch(
            "apps.notes.views.notify_board_members",
            side_effect=RuntimeError("notification failure"),
        ):
            with self.assertRaises(RuntimeError):
                self.call("add_board_collaborator", identifier=self.target.email)
        self.assertFalse(self.board.collaborators.filter(pk=self.target.pk).exists())
        self.assertFalse(
            Notification.objects.filter(
                recipient=self.target, board=self.board
            ).exists()
        )
