"""List membership preserves item identity and immutable board boundaries."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Board, List, Note
from .helpers import ItemApiFixtures


class ItemMembershipTests(ItemApiFixtures, APITestCase):
    def test_list_notes_filters_by_list(self):
        other_list = List.objects.create(
            name="Other List",
            description="Other List Description",
            board=self.board,
            created_by=self.owner,
        )
        other_note = Note.objects.create(
            note="Other Note",
            description="Other Note Description",
            board=self.board,
            created_by=self.owner,
        )
        other_list.notes.add(other_note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?list={self.list.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered note list, got {response.status_code}: {response.data}",
        )
        response_ids = {item["id"] for item in response.data}
        self.assertIn(
            self.note.id,
            response_ids,
            f"Expected note from list to be listed: {response.data}",
        )
        self.assertEqual(
            len(response_ids),
            1,
            f"Expected only one note in filtered response, got {response.data}",
        )

    def test_note_can_belong_to_multiple_lists(self):
        other_list = List.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            board=self.board,
            created_by=self.owner,
        )
        other_list.notes.add(self.note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?list={other_list.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered note list, got {response.status_code}: {response.data}",
        )
        response_ids = {item["id"] for item in response.data}
        self.assertIn(
            self.note.id,
            response_ids,
            f"Expected note to be listed for secondary list: {response.data}",
        )

    def test_note_removed_from_list_not_in_filtered_results(self):
        other_list = List.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            board=self.board,
            created_by=self.owner,
        )
        other_list.notes.add(self.note)
        other_list.notes.remove(self.note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?list={other_list.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered note list, got {response.status_code}: {response.data}",
        )
        response_ids = {item["id"] for item in response.data}
        self.assertNotIn(
            self.note.id,
            response_ids,
            f"Expected note to be absent after removal: {response.data}",
        )

    def test_patch_note_list_attaches_within_board(self):
        other_list = List.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            board=self.board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"list": other_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 when attaching note to another list, got {response.status_code}: {response.data}",
        )
        self.assertTrue(
            other_list.notes.filter(id=self.note.id).exists(),
            "Expected note to be attached to the specified list.",
        )

    def test_patch_note_list_attach_requires_list_access(self):
        other_list = List.objects.create(
            name="Private List",
            description="Not shared with note-only collaborator",
            board=self.board,
            created_by=self.owner,
        )

        # Item-level note sharing no longer exists, so this user has no access.
        self.client.force_authenticate(user=self.note_only_collaborator)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"list": other_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when patching a note without access, got {response.status_code}: {response.data}",
        )

    def test_patch_note_list_cross_board_rejected(self):
        other_board = Board.objects.create(
            name="Other Board",
            description="Other Board Description",
            created_by=self.owner,
        )
        other_list = List.objects.create(
            name="Other List",
            description="Other List Description",
            board=other_board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"list": other_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attaching note to cross-board list, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("list"),
            ["List must be in the same board as the note."],
            f"Unexpected error body for cross-board list: {response.data}",
        )

    def test_note_cannot_change_board_after_create(self):
        other_board = Board.objects.create(
            name="Second Board",
            description="Second Board Description",
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"board": other_board.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when changing note board, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("board"),
            ["Cannot change board of an existing note."],
            f"Unexpected error body when changing note board: {response.data}",
        )

        self.note.refresh_from_db()
        self.assertEqual(
            self.note.board_id,
            self.board.id,
            "Note board unexpectedly changed.",
        )

    def test_note_board_immutability_error_precedes_list_validation(self):
        other_board = Board.objects.create(
            name="Second Board",
            description="Second Board Description",
            created_by=self.owner,
        )

        # If a client tries to change both `board` and `list`, the API should
        # report the board immutability error (clearer semantics) rather than a
        # derived board/list mismatch error.
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"board": other_board.id, "list": self.list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attempting to change note board, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("board"),
            ["Cannot change board of an existing note."],
            f"Unexpected error body when changing note board: {response.data}",
        )
        self.assertNotIn(
            "list",
            response.data,
            f"Expected board error to be raised first: {response.data}",
        )
