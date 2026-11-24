"""Board list order and per-list task order persist independently."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Board, List, ListTask, Task
from .helpers import ListApiFixtures, TaskApiFixtures


class TaskOrderingTests(TaskApiFixtures, APITestCase):
    def test_list_tasks_returns_saved_list_membership_order(self):
        second_task = Task.objects.create(
            text="Second Task",
            description="Second Task Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.tasks.add(second_task)
        ListTask.objects.filter(list=self.list, task=self.task).update(position=1)
        ListTask.objects.filter(list=self.list, task=second_task).update(position=0)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/tasks/?list={self.list.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [task["id"] for task in response.data],
            [second_task.id, self.task.id],
        )

    def test_reorder_tasks_persists_list_membership_order(self):
        second_task = Task.objects.create(
            text="Second Task",
            description="Second Task Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.tasks.add(second_task)

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/tasks/reorder/",
            {
                "list": self.list.id,
                "ordered_ids": [second_task.id, self.task.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [task["id"] for task in response.data],
            [second_task.id, self.task.id],
        )
        self.assertEqual(
            ListTask.objects.get(list=self.list, task=second_task).position,
            0,
        )
        self.assertEqual(
            ListTask.objects.get(list=self.list, task=self.task).position,
            1,
        )

    def test_reorder_tasks_rejects_ids_outside_list(self):
        outside_task = Task.objects.create(
            text="Outside Task",
            description="Outside Task Description",
            board=self.board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/tasks/reorder/",
            {
                "list": self.list.id,
                "ordered_ids": [outside_task.id, self.task.id],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertIn("ordered_ids", response.data)

    def test_same_task_can_have_different_positions_in_different_lists(self):
        second_task = Task.objects.create(
            text="Second Task",
            description="Second Task Description",
            board=self.board,
            created_by=self.owner,
        )
        other_list = List.objects.create(
            name="Other List",
            description="Other List Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.tasks.add(second_task)
        other_list.tasks.add(self.task)
        other_list.tasks.add(second_task)

        self.client.force_authenticate(user=self.owner)
        first_response = self.client.patch(
            "/api/tasks/reorder/",
            {
                "list": self.list.id,
                "ordered_ids": [second_task.id, self.task.id],
            },
            format="json",
        )
        second_response = self.client.patch(
            "/api/tasks/reorder/",
            {
                "list": other_list.id,
                "ordered_ids": [self.task.id, second_task.id],
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
            ListTask.objects.get(list=self.list, task=self.task).position,
            1,
        )
        self.assertEqual(
            ListTask.objects.get(list=other_list, task=self.task).position,
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
            [task["id"] for task in response.data],
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
            [task["id"] for task in response.data],
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
