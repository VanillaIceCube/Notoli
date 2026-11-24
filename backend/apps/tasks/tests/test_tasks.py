"""Task creation, partial updates and status changes."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Task
from .helpers import TaskApiFixtures


class TaskLifecycleTests(TaskApiFixtures, APITestCase):
    def test_collaborator_can_create_task_directly_in_shared_board(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/tasks/",
            {
                "text": "Board Scoped Task",
                "description": "Created directly in shared board",
                "board": self.board.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected collaborator to create board-scoped task, got {response.status_code}: {response.data}",
        )
        task = Task.objects.get(id=response.data.get("id"))
        self.assertEqual(task.board_id, self.board.id)

        self.client.force_authenticate(user=self.owner)
        retrieve_response = self.client.get(f"/api/tasks/{task.id}/")
        self.assertEqual(
            retrieve_response.status_code,
            status.HTTP_200_OK,
            f"Expected owner to retrieve collaborator-created board task, got {retrieve_response.status_code}: {retrieve_response.data}",
        )

    def test_create_task_as_collaborator(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/tasks/",
            {
                "text": "Collaborator Task",
                "description": "Created by Collaborator",
                "list": self.list.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected 201 for collaborator task create, got {response.status_code}: {response.data}",
        )
        task = Task.objects.get(id=response.data.get("id"))
        self.assertEqual(
            task.board,
            self.board,
            f"Expected task board to match list board, got {task.board_id}",
        )
        self.assertEqual(
            task.created_by,
            self.collaborator,
            f"Expected collaborator to be creator, got {task.created_by_id}",
        )

    def test_create_task_missing_task(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/tasks/",
            {"description": "No Task Supplied", "list": self.list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when task is missing, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("text"),
            ["This field is required."],
            f"Unexpected error body when task is missing: {response.data}",
        )

    def test_create_task_missing_list(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/tasks/",
            {"text": "Missing List", "description": "No List Supplied"},
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

    def test_patch_task_allows_partial_update_without_resupplying_scope(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/tasks/{self.task.id}/",
            {"description": "Updated Description"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 when patching task without scope fields, got {response.status_code}: {response.data}",
        )
        self.task.refresh_from_db()
        self.assertEqual(self.task.description, "Updated Description")

    def test_task_status_defaults_not_started_and_can_be_updated(self):
        self.client.force_authenticate(user=self.owner)

        retrieve_response = self.client.get(f"/api/tasks/{self.task.id}/")
        self.assertEqual(
            retrieve_response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 retrieving task, got {retrieve_response.status_code}: {retrieve_response.data}",
        )
        self.assertEqual(retrieve_response.data.get("status"), Task.STATUS_NOT_STARTED)

        update_response = self.client.patch(
            f"/api/tasks/{self.task.id}/",
            {"status": Task.STATUS_COMPLETE},
            format="json",
        )

        self.assertEqual(
            update_response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 updating task status, got {update_response.status_code}: {update_response.data}",
        )
        self.assertEqual(update_response.data.get("status"), Task.STATUS_COMPLETE)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, Task.STATUS_COMPLETE)

    def test_task_status_allows_in_progress(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/tasks/{self.task.id}/",
            {"status": Task.STATUS_IN_PROGRESS},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 updating task status to in progress, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("status"), Task.STATUS_IN_PROGRESS)

    def test_only_current_task_route_and_fields_are_available(self):
        self.client.force_authenticate(user=self.owner)

        api_root = self.client.get("/api/")
        self.assertIn("tasks", api_root.data)
        self.assertNotIn("notes", api_root.data)
        self.assertEqual(
            self.client.get("/api/notes/").status_code, status.HTTP_404_NOT_FOUND
        )
        self.assertEqual(
            self.client.post(
                "/api/notes/", {"note": "Removed", "list": self.list.pk}, format="json"
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

        response = self.client.get(f"/api/tasks/{self.task.pk}/")
        self.assertEqual(response.data["text"], self.task.text)
        self.assertNotIn("note", response.data)

    def test_task_writes_reject_old_field_with_or_without_current_field(self):
        self.client.force_authenticate(user=self.owner)
        expected_task_count = Task.objects.count()

        for payload in ({"note": "Removed"}, {"note": "Removed", "text": "Changed"}):
            with self.subTest(payload=payload):
                created = self.client.post(
                    "/api/tasks/", {"list": self.list.pk, **payload}, format="json"
                )
                updated = self.client.patch(
                    f"/api/tasks/{self.task.pk}/", payload, format="json"
                )
                for response in (created, updated):
                    self.assertEqual(
                        response.status_code, status.HTTP_400_BAD_REQUEST, response.data
                    )
                    self.assertIn("note", response.data)

        self.task.refresh_from_db()
        self.assertEqual(self.task.text, "Owner Task")
        self.assertEqual(Task.objects.count(), expected_task_count)

    def test_list_writes_reject_old_membership_field_with_or_without_tasks(self):
        self.client.force_authenticate(user=self.owner)

        for payload in ({"notes": []}, {"notes": [], "tasks": []}):
            with self.subTest(payload=payload):
                created = self.client.post(
                    "/api/lists/",
                    {"name": "Changed", "board": self.board.pk, **payload},
                    format="json",
                )
                updated = self.client.patch(
                    f"/api/lists/{self.list.pk}/", payload, format="json"
                )
                for response in (created, updated):
                    self.assertEqual(
                        response.status_code, status.HTTP_400_BAD_REQUEST, response.data
                    )
                    self.assertIn("notes", response.data)

        response = self.client.get(f"/api/lists/{self.list.pk}/")
        self.assertEqual(response.data["tasks"], [self.task.pk])
        self.assertNotIn("notes", response.data)
        self.assertFalse(self.board.lists.filter(name="Changed").exists())
