"""Bounded domain-shaped responses retain pagination and committed outcomes."""

from types import SimpleNamespace
from unittest.mock import patch

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.notes.models import Board
from apps.notifications.models import Notification

from .. import operations, results, server
from ..services import execute
from .helpers import make_client, make_token


class BoundedResultTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "bounded", email="bounded@example.test"
        )
        self.token = make_token(
            self.user,
            make_client(),
            scope="notoli:read notoli:write notoli:organize notoli:notifications",
        )

    def test_multibyte_pages_bound_bytes_without_skipping_records(self):
        boards = [
            Board.objects.create(
                name=f"bounded-{index}",
                description="\U0001f419\u00e9" * 10000,
                owner=self.user,
                created_by=self.user,
            )
            for index in range(15)
        ]
        seen, offset = [], 0
        while offset is not None:
            output = execute(
                "test-access", "list_boards", query="bounded-", limit=100, offset=offset
            )
            self.assertLessEqual(results.encoded_size(output), results.MAX_RESULT_BYTES)
            self.assertTrue(output["truncated"])
            self.assertTrue(output["results"])
            seen.extend(row["id"] for row in output["results"])
            following = output["next_offset"]
            if following is not None:
                self.assertEqual(following, offset + len(output["results"]))
            offset = following
        self.assertEqual(seen, [board.pk for board in boards])

    def test_typed_tool_returns_success_after_large_mutation_and_preserves_full_text(
        self,
    ):
        description = "\U0001f419" * 9000
        registry = server.create_server()
        with patch.object(
            server,
            "get_access_token",
            return_value=SimpleNamespace(token="test-access"),
        ):
            output = async_to_sync(registry.call_tool)(
                "create_board", {"name": "Large result", "description": description}
            )
        self.assertFalse(output.is_error)
        data = output.structured_content
        self.assertTrue(data["truncated"])
        self.assertTrue(data["applied"])
        self.assertIn("Change completed", data["detail"])
        self.assertLessEqual(results.encoded_size(data), results.MAX_RESULT_BYTES)
        self.assertEqual(Board.objects.get(pk=data["id"]).description, description)
        self.assertEqual(
            Board.objects.filter(name="Large result", owner=self.user).count(), 1
        )

    def test_notification_update_preserves_success_with_unbounded_stored_message(self):
        notification = Notification.objects.create(
            recipient=self.user,
            event_type="board_updated",
            title="Activity",
            message="message " * 30000,
        )
        data = execute(
            "test-access",
            "update_notification",
            notification_id=notification.pk,
            is_read=True,
        )
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)
        self.assertTrue(data["applied"])
        self.assertTrue(data["truncated"])
        self.assertEqual(data["id"], notification.pk)
        self.assertLessEqual(results.encoded_size(data), results.MAX_RESULT_BYTES)

    def test_unexpected_structural_expansion_rolls_back_before_commit(self):
        original = operations.summary

        def expanded(row):
            value = original(row)
            value["unexpected"] = {
                "nested": {
                    "nested": {
                        "nested": {
                            "nested": {"nested": {"nested": {"nested": "value"}}}
                        }
                    }
                }
            }
            return value

        with patch.object(operations, "summary", side_effect=expanded):
            with self.assertRaises(results.ResultLimitExceeded):
                execute(
                    "test-access", "create_board", name="Rolled back", description=""
                )
        self.assertFalse(
            Board.objects.filter(name="Rolled back", owner=self.user).exists()
        )
