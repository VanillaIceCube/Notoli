"""List lifecycle and board membership boundaries."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Board, List, Task
from .helpers import ListApiFixtures

User = get_user_model()


class ListApiTests(ListApiFixtures, APITestCase):
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
        response_ids = {task["id"] for task in response.data}
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

    def test_list_lists_filters_by_board_denied_for_task_only_collaborator(
        self,
    ):
        List.objects.create(
            name="Shared List",
            description="No task-level sharing remains",
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

    def test_list_cannot_add_tasks_from_other_board(self):
        other_board = Board.objects.create(
            name="Other Board",
            description="Other Board Description",
            created_by=self.owner,
        )
        other_task = Task.objects.create(
            text="Cross Board Task",
            description="Should not be attachable across boards",
            board=other_board,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/lists/{self.list.id}/",
            {"tasks": [other_task.id]},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attaching cross-board tasks, got {response.status_code}: {response.data}",
        )
        self.assertIn(
            "tasks",
            response.data,
            f"Expected 'tasks' validation error, got: {response.data}",
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

    def test_board_collaborator_can_retrieve_owner_created_list_without_task_share(
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

    def test_owner_can_retrieve_collaborator_created_list_without_task_share(self):
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


class TaskPermissionMigrationTests(TransactionTestCase):
    def test_user_and_group_permissions_survive_upgrade_and_rollback(self):
        self.addCleanup(call_command, "migrate", interactive=False, verbosity=0)
        call_command("migrate", "notes", "0011", interactive=False, verbosity=0)

        user_model = get_user_model()
        (user,) = user_model.objects.bulk_create(
            [
                user_model(
                    username="permission-holder", email="permission-holder@example.test"
                )
            ]
        )
        legacy_group = Group.objects.create(name="Legacy List Task grants")
        current_group = Group.objects.create(name="Existing List Task grants")
        user.user_permissions.add(
            Permission.objects.get(
                content_type__app_label="notes", codename="change_note"
            )
        )
        legacy_group.permissions.add(
            Permission.objects.get(
                content_type__app_label="notes", codename="view_listnote"
            )
        )
        stale_type = ContentType.objects.create(app_label="notes", model="listtask")
        existing_permission = Permission.objects.create(
            content_type=stale_type, codename="view_listtask", name="Can view List Task"
        )
        current_group.permissions.add(existing_permission)

        def assert_grants(task, membership):
            self.assertTrue(
                user.user_permissions.filter(
                    content_type__app_label="notes",
                    content_type__model=task,
                    codename=f"change_{task}",
                ).exists()
            )
            permission = Permission.objects.get(
                content_type__app_label="notes",
                content_type__model=membership,
                codename=f"view_{membership}",
            )
            self.assertCountEqual(
                permission.group_set.values_list("pk", flat=True),
                [legacy_group.pk, current_group.pk],
            )

        with self.assertWarnsRegex(RuntimeWarning, "existing conflicting content type"):
            call_command("migrate", interactive=False, verbosity=0)
        assert_grants("task", "listtask")

        with self.assertWarnsRegex(RuntimeWarning, "existing conflicting content type"):
            call_command("migrate", "notes", "0011", interactive=False, verbosity=0)
        assert_grants("note", "listnote")
