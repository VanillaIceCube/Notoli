"""List membership preserves task identity and immutable board boundaries."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Board, List, Task
from .helpers import TaskApiFixtures


class TaskMembershipTests(TaskApiFixtures, APITestCase):
    def test_list_tasks_filters_by_list(self):
        other_list = List.objects.create(
            name="Other List",
            description="Other List Description",
            board=self.board,
            created_by=self.owner,
        )
        other_task = Task.objects.create(
            text="Other Task",
            description="Other Task Description",
            board=self.board,
            created_by=self.owner,
        )
        other_list.tasks.add(other_task)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/tasks/?list={self.list.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered task list, got {response.status_code}: {response.data}",
        )
        response_ids = {task["id"] for task in response.data}
        self.assertIn(
            self.task.id,
            response_ids,
            f"Expected task from list to be listed: {response.data}",
        )
        self.assertEqual(
            len(response_ids),
            1,
            f"Expected only one task in filtered response, got {response.data}",
        )

    def test_task_can_belong_to_multiple_lists(self):
        other_list = List.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            board=self.board,
            created_by=self.owner,
        )
        other_list.tasks.add(self.task)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/tasks/?list={other_list.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered task list, got {response.status_code}: {response.data}",
        )
        response_ids = {task["id"] for task in response.data}
        self.assertIn(
            self.task.id,
            response_ids,
            f"Expected task to be listed for secondary list: {response.data}",
        )

    def test_task_removed_from_list_not_in_filtered_results(self):
        other_list = List.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            board=self.board,
            created_by=self.owner,
        )
        other_list.tasks.add(self.task)
        other_list.tasks.remove(self.task)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/tasks/?list={other_list.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered task list, got {response.status_code}: {response.data}",
        )
        response_ids = {task["id"] for task in response.data}
        self.assertNotIn(
            self.task.id,
            response_ids,
            f"Expected task to be absent after removal: {response.data}",
        )

    def test_patch_board_list_attaches_within_board(self):
        other_list = List.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            board=self.board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/tasks/{self.task.id}/",
            {"list": other_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 when attaching task to another list, got {response.status_code}: {response.data}",
        )
        self.assertTrue(
            other_list.tasks.filter(id=self.task.id).exists(),
            "Expected task to be attached to the specified list.",
        )

    def test_patch_board_list_attach_requires_list_access(self):
        other_list = List.objects.create(
            name="Private List",
            description="Not shared with task-only collaborator",
            board=self.board,
            created_by=self.owner,
        )

        # Task-level task sharing no longer exists, so this user has no access.
        self.client.force_authenticate(user=self.task_only_collaborator)
        response = self.client.patch(
            f"/api/tasks/{self.task.id}/",
            {"list": other_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when patching a task without access, got {response.status_code}: {response.data}",
        )

    def test_patch_board_list_cross_board_rejected(self):
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
            f"/api/tasks/{self.task.id}/",
            {"list": other_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attaching task to cross-board list, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("list"),
            ["List must be in the same board as the task."],
            f"Unexpected error body for cross-board list: {response.data}",
        )

    def test_task_cannot_change_board_after_create(self):
        other_board = Board.objects.create(
            name="Second Board",
            description="Second Board Description",
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/tasks/{self.task.id}/",
            {"board": other_board.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when changing task board, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("board"),
            ["Cannot change board of an existing task."],
            f"Unexpected error body when changing task board: {response.data}",
        )

        self.task.refresh_from_db()
        self.assertEqual(
            self.task.board_id,
            self.board.id,
            "Task board unexpectedly changed.",
        )

    def test_task_board_immutability_error_precedes_list_validation(self):
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
            f"/api/tasks/{self.task.id}/",
            {"board": other_board.id, "list": self.list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attempting to change task board, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("board"),
            ["Cannot change board of an existing task."],
            f"Unexpected error body when changing task board: {response.data}",
        )
        self.assertNotIn(
            "list",
            response.data,
            f"Expected board error to be raised first: {response.data}",
        )
