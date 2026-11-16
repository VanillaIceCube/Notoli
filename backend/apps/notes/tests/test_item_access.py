"""Item access follows current board membership and excludes outsiders."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Board, Note
from .helpers import ItemApiFixtures


class ItemAccessTests(ItemApiFixtures, APITestCase):
    def test_board_collaborator_can_retrieve_owner_created_note_without_item_share(
        self,
    ):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/notes/{self.note.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected board collaborator to retrieve owner-created note, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), self.note.id)

    def test_owner_can_retrieve_collaborator_created_note_in_list_without_item_share(
        self,
    ):
        collaborator_note = Note.objects.create(
            note="Collaborator Created Note",
            description="Shared through board list",
            board=self.board,
            created_by=self.collaborator,
        )
        self.list.notes.add(collaborator_note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/{collaborator_note.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected board owner to retrieve collaborator-created note, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), collaborator_note.id)

    def test_board_membership_does_not_leak_notes_from_other_boards(self):
        other_board = Board.objects.create(
            name="Other Shared Board",
            description="Separate sharing boundary",
            created_by=self.outsider,
        )
        other_note = Note.objects.create(
            note="Other Board Note",
            description="Should not leak",
            board=other_board,
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/notes/{other_note.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected no access to another board's note, got {response.status_code}: {response.data}",
        )

    def test_create_note_requires_list_access(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            "/api/notes/",
            {
                "note": "Outsider Note",
                "description": "No Access",
                "list": self.list.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when creating note without access, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("detail"),
            "You cannot add notes to this list.",
            f"Unexpected error detail for note access denial: {response.data}",
        )

    def test_list_notes_filters_by_board_denied_for_outsider_board(self):
        other_board = Board.objects.create(
            name="Other Board",
            description="Other Board Description",
            created_by=self.outsider,
        )
        Note.objects.create(
            note="Outsider Note",
            description="Should not be accessible",
            board=other_board,
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?board={other_board.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when filtering notes by board without access, got {response.status_code}: {response.data}",
        )

    def test_list_notes_filters_by_board_denied_for_item_only_collaborator(self):
        self.client.force_authenticate(user=self.note_only_collaborator)
        response = self.client.get(f"/api/notes/?board={self.board.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 for non-member board filter, got {response.status_code}: {response.data}",
        )

    def test_retrieve_note_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/notes/{self.note.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 for outsider note access, got {response.status_code}: {response.data}",
        )

    def test_update_note_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"note": "No Access"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider updates note, got {response.status_code}: {response.data}",
        )

    def test_delete_note_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.delete(f"/api/notes/{self.note.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider deletes note, got {response.status_code}: {response.data}",
        )
