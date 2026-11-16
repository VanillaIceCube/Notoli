"""Item creation, partial updates and status changes."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Note
from .helpers import ItemApiFixtures


class ItemLifecycleTests(ItemApiFixtures, APITestCase):
    def test_collaborator_can_create_note_directly_in_shared_board(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/notes/",
            {
                "note": "Board Scoped Note",
                "description": "Created directly in shared board",
                "board": self.board.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected collaborator to create board-scoped note, got {response.status_code}: {response.data}",
        )
        note = Note.objects.get(id=response.data.get("id"))
        self.assertEqual(note.board_id, self.board.id)

        self.client.force_authenticate(user=self.owner)
        retrieve_response = self.client.get(f"/api/notes/{note.id}/")
        self.assertEqual(
            retrieve_response.status_code,
            status.HTTP_200_OK,
            f"Expected owner to retrieve collaborator-created board note, got {retrieve_response.status_code}: {retrieve_response.data}",
        )

    def test_create_note_as_collaborator(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/notes/",
            {
                "note": "Collaborator Note",
                "description": "Created by Collaborator",
                "list": self.list.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected 201 for collaborator note create, got {response.status_code}: {response.data}",
        )
        note = Note.objects.get(id=response.data.get("id"))
        self.assertEqual(
            note.board,
            self.board,
            f"Expected note board to match list board, got {note.board_id}",
        )
        self.assertEqual(
            note.created_by,
            self.collaborator,
            f"Expected collaborator to be creator, got {note.created_by_id}",
        )

    def test_create_note_missing_note(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/notes/",
            {"description": "No Note Supplied", "list": self.list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when note is missing, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("note"),
            ["This field is required."],
            f"Unexpected error body when note is missing: {response.data}",
        )

    def test_create_note_missing_list(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/notes/",
            {"note": "Missing List", "description": "No List Supplied"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when list is missing, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("list"),
            ["This field is required when board is not provided."],
            f"Unexpected error body when list is missing: {response.data}",
        )

    def test_patch_note_allows_partial_update_without_resupplying_scope(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"description": "Updated Description"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 when patching note without scope fields, got {response.status_code}: {response.data}",
        )
        self.note.refresh_from_db()
        self.assertEqual(self.note.description, "Updated Description")

    def test_note_status_defaults_not_started_and_can_be_updated(self):
        self.client.force_authenticate(user=self.owner)

        retrieve_response = self.client.get(f"/api/notes/{self.note.id}/")
        self.assertEqual(
            retrieve_response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 retrieving note, got {retrieve_response.status_code}: {retrieve_response.data}",
        )
        self.assertEqual(retrieve_response.data.get("status"), Note.STATUS_NOT_STARTED)

        update_response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"status": Note.STATUS_COMPLETE},
            format="json",
        )

        self.assertEqual(
            update_response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 updating note status, got {update_response.status_code}: {update_response.data}",
        )
        self.assertEqual(update_response.data.get("status"), Note.STATUS_COMPLETE)
        self.note.refresh_from_db()
        self.assertEqual(self.note.status, Note.STATUS_COMPLETE)

    def test_note_status_allows_in_progress(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"status": Note.STATUS_IN_PROGRESS},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 updating note status to in progress, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("status"), Note.STATUS_IN_PROGRESS)
