"""Board list order and per-list item order persist independently."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Board, List, ListNote, Note
from .helpers import ItemApiFixtures, ListApiFixtures


class ItemOrderingTests(ItemApiFixtures, APITestCase):
    def test_list_notes_returns_saved_list_membership_order(self):
        second_note = Note.objects.create(
            note="Second Note",
            description="Second Note Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(second_note)
        ListNote.objects.filter(list=self.list, note=self.note).update(position=1)
        ListNote.objects.filter(list=self.list, note=second_note).update(position=0)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?list={self.list.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item["id"] for item in response.data],
            [second_note.id, self.note.id],
        )

    def test_reorder_notes_persists_list_membership_order(self):
        second_note = Note.objects.create(
            note="Second Note",
            description="Second Note Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(second_note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/notes/reorder/",
            {
                "list": self.list.id,
                "ordered_ids": [second_note.id, self.note.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item["id"] for item in response.data],
            [second_note.id, self.note.id],
        )
        self.assertEqual(
            ListNote.objects.get(list=self.list, note=second_note).position,
            0,
        )
        self.assertEqual(
            ListNote.objects.get(list=self.list, note=self.note).position,
            1,
        )

    def test_reorder_notes_rejects_ids_outside_list(self):
        outside_note = Note.objects.create(
            note="Outside Note",
            description="Outside Note Description",
            board=self.board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/notes/reorder/",
            {
                "list": self.list.id,
                "ordered_ids": [outside_note.id, self.note.id],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertIn("ordered_ids", response.data)

    def test_same_note_can_have_different_positions_in_different_lists(self):
        second_note = Note.objects.create(
            note="Second Note",
            description="Second Note Description",
            board=self.board,
            created_by=self.owner,
        )
        other_list = List.objects.create(
            name="Other List",
            description="Other List Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(second_note)
        other_list.notes.add(self.note)
        other_list.notes.add(second_note)

        self.client.force_authenticate(user=self.owner)
        first_response = self.client.patch(
            "/api/notes/reorder/",
            {
                "list": self.list.id,
                "ordered_ids": [second_note.id, self.note.id],
            },
            format="json",
        )
        second_response = self.client.patch(
            "/api/notes/reorder/",
            {
                "list": other_list.id,
                "ordered_ids": [self.note.id, second_note.id],
            },
            format="json",
        )

        self.assertEqual(
            first_response.status_code, status.HTTP_200_OK, first_response.data
        )
        self.assertEqual(
            second_response.status_code,
            status.HTTP_200_OK,
            second_response.data,
        )
        self.assertEqual(
            ListNote.objects.get(list=self.list, note=self.note).position,
            1,
        )
        self.assertEqual(
            ListNote.objects.get(list=other_list, note=self.note).position,
            0,
        )


class ListOrderingTests(ListApiFixtures, APITestCase):
    def test_list_lists_returns_saved_board_order(self):
        second_list = List.objects.create(
            name="Second List",
            description="Second List Description",
            board=self.board,
            created_by=self.owner,
            position=0,
        )
        self.list.position = 1
        self.list.save(update_fields=["position"])

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/lists/?board={self.board.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item["id"] for item in response.data],
            [second_list.id, self.list.id],
        )

    def test_reorder_lists_persists_board_order(self):
        second_list = List.objects.create(
            name="Second List",
            description="Second List Description",
            board=self.board,
            created_by=self.owner,
            position=1,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/lists/reorder/",
            {
                "board": self.board.id,
                "ordered_ids": [second_list.id, self.list.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item["id"] for item in response.data],
            [second_list.id, self.list.id],
        )
        self.list.refresh_from_db()
        second_list.refresh_from_db()
        self.assertEqual(second_list.position, 0)
        self.assertEqual(self.list.position, 1)

    def test_reorder_lists_rejects_ids_outside_board(self):
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
            "/api/lists/reorder/",
            {
                "board": self.board.id,
                "ordered_ids": [other_list.id, self.list.id],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertIn("ordered_ids", response.data)
