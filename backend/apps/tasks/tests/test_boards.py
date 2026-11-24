"""Board lifecycle, access and collaborator management."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Board

User = get_user_model()


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
        board_ids = {task["id"] for task in response.data}
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
            task["id"] for task in response.data["collaborators_details"]
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
        self.assertFalse(self.board.collaborators.filter(pk=self.outsider.pk).exists())

    def test_ambiguous_username_email_cannot_share_with_either_account(self):
        collision = User.objects.create_user(
            username=self.collaborator.email.upper(), email="collision@example.com"
        )
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/boards/{self.board.id}/collaborators/",
            {"identifier": f" {self.collaborator.email} "},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("multiple accounts", str(response.data))
        self.assertFalse(self.board.collaborators.exists())
        self.assertFalse(self.owner.sent_notifications.exists())
        # A unique alternative still resolves the intended existing user.
        response = self.client.post(
            f"/api/boards/{self.board.id}/collaborators/",
            {"identifier": self.collaborator.username},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(
            self.board.collaborators.filter(pk=self.collaborator.pk).exists()
        )
        self.assertFalse(self.board.collaborators.filter(pk=collision.pk).exists())

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
            task["id"] for task in response.data["collaborators_details"]
        }
        self.assertNotIn(self.collaborator.id, collaborator_ids)

    def test_non_owner_cannot_remove_board_collaborator(self):
        self.board.collaborators.add(self.collaborator, self.outsider)
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.delete(
            f"/api/boards/{self.board.id}/collaborators/{self.outsider.id}/"
        )

        self.assertEqual(response.status_code, 403, response.data)
        self.assertTrue(self.board.collaborators.filter(pk=self.outsider.pk).exists())

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
        self.assertEqual(
            response.data.get("detail"), "Only the board owner can update this board."
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
        self.assertEqual(
            response.data.get("detail"), "Only the board owner can delete this board."
        )
        self.assertTrue(Board.objects.filter(pk=self.board.pk).exists())
