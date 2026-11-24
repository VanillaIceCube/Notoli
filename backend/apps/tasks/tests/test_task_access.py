"""Task access follows current board membership and excludes outsiders."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Board, Task
from .helpers import TaskApiFixtures


class TaskAccessTests(TaskApiFixtures, APITestCase):
    def test_board_collaborator_can_retrieve_owner_created_task_without_task_share(
        self,
    ):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/tasks/{self.task.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected board collaborator to retrieve owner-created task, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), self.task.id)

    def test_owner_can_retrieve_collaborator_created_task_in_list_without_task_share(
        self,
    ):
        collaborator_task = Task.objects.create(
            text="Collaborator Created Task",
            description="Shared through board list",
            board=self.board,
            created_by=self.collaborator,
        )
        self.list.tasks.add(collaborator_task)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/tasks/{collaborator_task.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected board owner to retrieve collaborator-created task, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), collaborator_task.id)

    def test_board_membership_does_not_leak_tasks_from_other_boards(self):
        other_board = Board.objects.create(
            name="Other Shared Board",
            description="Separate sharing boundary",
            created_by=self.outsider,
        )
        other_task = Task.objects.create(
            text="Other Board Task",
            description="Should not leak",
            board=other_board,
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/tasks/{other_task.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected no access to another board's task, got {response.status_code}: {response.data}",
        )

    def test_create_task_requires_list_access(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            "/api/tasks/",
            {
                "text": "Outsider Task",
                "description": "No Access",
                "list": self.list.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when creating task without access, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("detail"),
            "You cannot add tasks to this list.",
            f"Unexpected error detail for task access denial: {response.data}",
        )

    def test_list_tasks_filters_by_board_denied_for_outsider_board(self):
        other_board = Board.objects.create(
            name="Other Board",
            description="Other Board Description",
            created_by=self.outsider,
        )
        Task.objects.create(
            text="Outsider Task",
            description="Should not be accessible",
            board=other_board,
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/tasks/?board={other_board.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when filtering tasks by board without access, got {response.status_code}: {response.data}",
        )

    def test_list_tasks_filters_by_board_denied_for_task_only_collaborator(self):
        self.client.force_authenticate(user=self.task_only_collaborator)
        response = self.client.get(f"/api/tasks/?board={self.board.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 for non-member board filter, got {response.status_code}: {response.data}",
        )

    def test_retrieve_task_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/tasks/{self.task.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 for outsider task access, got {response.status_code}: {response.data}",
        )

    def test_update_task_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.patch(
            f"/api/tasks/{self.task.id}/",
            {"text": "No Access"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider updates task, got {response.status_code}: {response.data}",
        )

    def test_delete_task_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.delete(f"/api/tasks/{self.task.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider deletes task, got {response.status_code}: {response.data}",
        )
