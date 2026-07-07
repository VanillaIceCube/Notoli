from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Board, List, ListNote, Note

User = get_user_model()


class ModelTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner_email@example.com",
            password="owner-password",
        )
        self.board = Board.objects.create(
            name="Owner Board",
            description="Owner Board Description",
            created_by=self.owner,
        )
        self.list = List.objects.create(
            name="Owner List",
            description="Owner List Description",
            board=self.board,
            created_by=self.owner,
        )
        self.note = Note.objects.create(
            note="Owner Note",
            description="Owner Note Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(self.note)

    def test_model_strs(self):
        self.assertEqual(
            str(self.board),
            "Owner Board",
            "Board __str__ did not return the name.",
        )
        self.assertEqual(
            str(self.list),
            "Owner List",
            "List __str__ did not return the name.",
        )
        self.assertEqual(
            str(self.note), "Owner Note", "Note __str__ did not return the note text."
        )


class BoardApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner_email@example.com",
            password="owner-password",
        )
        self.collaborator = User.objects.create_user(
            username="collaborator",
            email="collaborator_email@example.com",
            password="collaborator-password",
        )
        self.outsider = User.objects.create_user(
            username="outsider",
            email="outsider_email@example.com",
            password="outsider-password",
        )
        self.board = Board.objects.create(
            name="Owner Board",
            description="Owner Board Description",
            created_by=self.owner,
        )

    def test_create_board_sets_owner_and_creator(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/boards/",
            {"name": "New Board", "description": "New Description"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected 201 on board create, got {response.status_code}: {response.data}",
        )
        board_id = response.data.get("id")
        board = Board.objects.get(id=board_id)
        self.assertEqual(
            board.owner,
            self.owner,
            f"Board owner was not set to request user: {board.owner_id}",
        )
        self.assertEqual(
            board.created_by,
            self.owner,
            f"Board creator was not set to request user: {board.created_by_id}",
        )

    def test_create_board_as_collaborator(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/boards/",
            {
                "name": "Collaborator Board",
                "description": "Collaborator Description",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected 201 on board create, got {response.status_code}: {response.data}",
        )
        board = Board.objects.get(id=response.data.get("id"))
        self.assertEqual(
            board.owner,
            self.collaborator,
            f"Board owner was not set to collaborator: {board.owner_id}",
        )
        self.assertEqual(
            board.created_by,
            self.collaborator,
            f"Board creator was not set to collaborator: {board.created_by_id}",
        )

    def test_create_board_missing_name(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/boards/",
            {"description": "No Name Supplied"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when name is missing, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("name"),
            ["This field is required."],
            f"Unexpected error body when name is missing: {response.data}",
        )

    def test_list_boards_limited_to_access(self):
        Board.objects.create(
            name="Outsider Board",
            description="Outsider Board Description",
            created_by=self.outsider,
        )
        self.board.collaborators.add(self.collaborator)

        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get("/api/boards/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 on board list, got {response.status_code}: {response.data}",
        )
        board_ids = {item["id"] for item in response.data}
        outsider_board_ids = set(
            Board.objects.filter(owner=self.outsider).values_list("id", flat=True)
        )
        self.assertIn(
            self.board.id,
            board_ids,
            f"Collaborator board missing from list: {response.data}",
        )
        self.assertTrue(
            board_ids.isdisjoint(outsider_board_ids),
            f"Unexpected outsider board included in list: {response.data}",
        )

    def test_owner_can_add_board_collaborator_by_email(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/boards/{self.board.id}/collaborators/",
            {"identifier": self.collaborator.email},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(
            self.board.collaborators.filter(pk=self.collaborator.pk).exists()
        )
        collaborator_ids = {
            item["id"] for item in response.data["collaborators_details"]
        }
        self.assertIn(self.collaborator.id, collaborator_ids)

    def test_non_owner_cannot_add_board_collaborator(self):
        self.board.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            f"/api/boards/{self.board.id}/collaborators/",
            {"identifier": self.outsider.email},
            format="json",
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(
            self.board.collaborators.filter(pk=self.outsider.pk).exists()
        )

    def test_owner_cannot_add_duplicate_board_collaborator(self):
        self.board.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/boards/{self.board.id}/collaborators/",
            {"identifier": self.collaborator.username},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            self.board.collaborators.filter(pk=self.collaborator.pk).count(), 1
        )

    def test_owner_can_remove_board_collaborator(self):
        self.board.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(
            f"/api/boards/{self.board.id}/collaborators/{self.collaborator.id}/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(
            self.board.collaborators.filter(pk=self.collaborator.pk).exists()
        )
        collaborator_ids = {
            item["id"] for item in response.data["collaborators_details"]
        }
        self.assertNotIn(self.collaborator.id, collaborator_ids)

    def test_owner_cannot_remove_board_owner(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(
            f"/api/boards/{self.board.id}/collaborators/{self.owner.id}/"
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.board.owner_id, self.owner.id)

    def test_retrieve_board_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/boards/{self.board.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 for outsider board access, got {response.status_code}: {response.data}",
        )

    def test_update_board_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.patch(
            f"/api/boards/{self.board.id}/",
            {"name": "No Access"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider updates board, got {response.status_code}: {response.data}",
        )

    def test_update_board_denied_for_collaborator(self):
        self.board.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.patch(
            f"/api/boards/{self.board.id}/",
            {"name": "Collaborator Rename"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when collaborator updates board, got {response.status_code}: {response.data}",
        )
        self.board.refresh_from_db()
        self.assertEqual(self.board.name, "Owner Board")

    def test_delete_board_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.delete(f"/api/boards/{self.board.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider deletes board, got {response.status_code}: {response.data}",
        )

    def test_delete_board_denied_for_collaborator(self):
        self.board.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.delete(f"/api/boards/{self.board.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when collaborator deletes board, got {response.status_code}: {response.data}",
        )
        self.assertTrue(Board.objects.filter(pk=self.board.pk).exists())


class ListApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner_email@example.com",
            password="owner-password",
        )
        self.collaborator = User.objects.create_user(
            username="collaborator",
            email="collaborator_email@example.com",
            password="collaborator-password",
        )
        self.list_only_collaborator = User.objects.create_user(
            username="list_only_collaborator",
            email="list_only_collaborator_email@example.com",
            password="list-only-password",
        )
        self.outsider = User.objects.create_user(
            username="outsider",
            email="outsider_email@example.com",
            password="outsider-password",
        )
        self.board = Board.objects.create(
            name="Owner Board",
            description="Owner Board Description",
            created_by=self.owner,
        )
        self.board.collaborators.add(self.collaborator)
        self.list = List.objects.create(
            name="Owner List",
            description="Owner List Description",
            board=self.board,
            created_by=self.owner,
        )

    def test_create_list_as_collaborator(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/lists/",
            {
                "name": "Collaborator List",
                "description": "Collaborator Description",
                "board": self.board.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected 201 for collaborator list create, got {response.status_code}: {response.data}",
        )
        list = List.objects.get(id=response.data.get("id"))
        self.assertEqual(
            list.created_by,
            self.collaborator,
            f"Expected collaborator to be creator, got {list.created_by_id}",
        )

    def test_create_list_missing_name(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/lists/",
            {"description": "No Name Supplied", "board": self.board.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when name is missing, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("name"),
            ["This field is required."],
            f"Unexpected error body when name is missing: {response.data}",
        )

    def test_create_list_missing_board(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/lists/",
            {"name": "Missing Board", "description": "No Board Supplied"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when board is missing, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("board"),
            ["This field is required."],
            f"Unexpected error body when board is missing: {response.data}",
        )

    def test_create_list_requires_board_access(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            "/api/lists/",
            {
                "name": "Bad List",
                "description": "No Access",
                "board": self.board.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when creating list without access, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("detail"),
            "You cannot add lists to this board.",
            f"Unexpected error detail when access denied: {response.data}",
        )

    def test_list_lists_filters_by_board(self):
        other_board = Board.objects.create(
            name="Other Board",
            description="Other Board Description",
            created_by=self.owner,
        )
        List.objects.create(
            name="Other List",
            description="Other List Description",
            board=other_board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/lists/?board={self.board.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered list list, got {response.status_code}: {response.data}",
        )
        response_ids = {item["id"] for item in response.data}
        self.assertIn(
            self.list.id,
            response_ids,
            f"Expected list from board to be listed: {response.data}",
        )
        self.assertEqual(
            len(response_ids),
            1,
            f"Expected only one list in filtered response, got {response.data}",
        )

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

    def test_list_lists_filters_by_board_denied_for_outsider_board(self):
        other_board = Board.objects.create(
            name="Other Board",
            description="Other Board Description",
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/lists/?board={other_board.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when filtering by board without access, got {response.status_code}: {response.data}",
        )

    def test_list_lists_filters_by_board_denied_for_item_only_collaborator(
        self,
    ):
        List.objects.create(
            name="Shared List",
            description="No item-level sharing remains",
            board=self.board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.list_only_collaborator)
        response = self.client.get(f"/api/lists/?board={self.board.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 for non-member board filter, got {response.status_code}: {response.data}",
        )

    def test_retrieve_list_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/lists/{self.list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 for outsider list access, got {response.status_code}: {response.data}",
        )

    def test_update_list_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.patch(
            f"/api/lists/{self.list.id}/",
            {"name": "No Access"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider updates list, got {response.status_code}: {response.data}",
        )

    def test_delete_list_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.delete(f"/api/lists/{self.list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider deletes list, got {response.status_code}: {response.data}",
        )

    def test_list_cannot_add_notes_from_other_board(self):
        other_board = Board.objects.create(
            name="Other Board",
            description="Other Board Description",
            created_by=self.owner,
        )
        other_note = Note.objects.create(
            note="Cross Board Note",
            description="Should not be attachable across boards",
            board=other_board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/lists/{self.list.id}/",
            {"notes": [other_note.id]},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attaching cross-board notes, got {response.status_code}: {response.data}",
        )
        self.assertIn(
            "notes",
            response.data,
            f"Expected 'notes' validation error, got: {response.data}",
        )

    def test_list_cannot_change_board_after_create(self):
        other_board = Board.objects.create(
            name="Second Board",
            description="Second Board Description",
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/lists/{self.list.id}/",
            {"board": other_board.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when changing list board, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("board"),
            ["Cannot change board of a list."],
            f"Unexpected error body when changing list board: {response.data}",
        )

        self.list.refresh_from_db()
        self.assertEqual(
            self.list.board_id,
            self.board.id,
            "List board unexpectedly changed.",
        )

    def test_board_collaborator_can_retrieve_owner_created_list_without_item_share(
        self,
    ):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/lists/{self.list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected board collaborator to retrieve owner-created list, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), self.list.id)

    def test_owner_can_retrieve_collaborator_created_list_without_item_share(self):
        collaborator_list = List.objects.create(
            name="Collaborator Created List",
            description="Shared through board",
            board=self.board,
            created_by=self.collaborator,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/lists/{collaborator_list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected board owner to retrieve collaborator-created list, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), collaborator_list.id)

    def test_board_membership_does_not_leak_lists_from_other_boards(self):
        other_member = User.objects.create_user(
            username="other_member",
            email="other_member@example.com",
            password="other-member-password",
        )
        other_board = Board.objects.create(
            name="Other Shared Board",
            description="Separate sharing boundary",
            created_by=self.outsider,
        )
        other_board.collaborators.add(other_member)
        other_list = List.objects.create(
            name="Other Board List",
            description="Should not leak",
            board=other_board,
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/lists/{other_list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected no access to another board's list, got {response.status_code}: {response.data}",
        )


class NoteApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner_email@example.com",
            password="owner-password",
        )
        self.collaborator = User.objects.create_user(
            username="collaborator",
            email="collaborator_email@example.com",
            password="collaborator-password",
        )
        self.note_only_collaborator = User.objects.create_user(
            username="note_only_collaborator",
            email="note_only_collaborator_email@example.com",
            password="note-only-password",
        )
        self.outsider = User.objects.create_user(
            username="outsider",
            email="outsider_email@example.com",
            password="outsider-password",
        )
        self.board = Board.objects.create(
            name="Owner Board",
            description="Owner Board Description",
            created_by=self.owner,
        )
        self.board.collaborators.add(self.collaborator)
        self.list = List.objects.create(
            name="Owner List",
            description="Owned List Description",
            board=self.board,
            created_by=self.owner,
        )
        self.note = Note.objects.create(
            note="Owner Note",
            description="Owner Note Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(self.note)

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

    def test_list_notes_returns_saved_list_membership_order(self):
        second_note = Note.objects.create(
            note="Second Note",
            description="Second Note Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(second_note)
        ListNote.objects.filter(list=self.list, note=self.note).update(
            position=1
        )
        ListNote.objects.filter(list=self.list, note=second_note).update(
            position=0
        )

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
            ListNote.objects.get(
                list=self.list, note=second_note
            ).position,
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
