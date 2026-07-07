from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Note, TodoList, TodoListNote, Workspace

User = get_user_model()


class ModelTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner_email@example.com",
            password="owner-password",
        )
        self.workspace = Workspace.objects.create(
            name="Owner Workspace",
            description="Owner Workspace Description",
            created_by=self.owner,
        )
        self.todo_list = TodoList.objects.create(
            name="Owner Todo List",
            description="Owner Todo List Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        self.note = Note.objects.create(
            note="Owner Note",
            description="Owner Note Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        self.todo_list.notes.add(self.note)

    def test_model_strs(self):
        self.assertEqual(
            str(self.workspace),
            "Owner Workspace",
            "Workspace __str__ did not return the name.",
        )
        self.assertEqual(
            str(self.todo_list),
            "Owner Todo List",
            "TodoList __str__ did not return the name.",
        )
        self.assertEqual(
            str(self.note), "Owner Note", "Note __str__ did not return the note text."
        )


class WorkspaceApiTests(APITestCase):
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
        self.workspace = Workspace.objects.create(
            name="Owner Workspace",
            description="Owner Workspace Description",
            created_by=self.owner,
        )

    def test_create_workspace_sets_owner_and_creator(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/workspaces/",
            {"name": "New Workspace", "description": "New Description"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected 201 on workspace create, got {response.status_code}: {response.data}",
        )
        workspace_id = response.data.get("id")
        workspace = Workspace.objects.get(id=workspace_id)
        self.assertEqual(
            workspace.owner,
            self.owner,
            f"Workspace owner was not set to request user: {workspace.owner_id}",
        )
        self.assertEqual(
            workspace.created_by,
            self.owner,
            f"Workspace creator was not set to request user: {workspace.created_by_id}",
        )

    def test_create_workspace_as_collaborator(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/workspaces/",
            {
                "name": "Collaborator Workspace",
                "description": "Collaborator Description",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected 201 on workspace create, got {response.status_code}: {response.data}",
        )
        workspace = Workspace.objects.get(id=response.data.get("id"))
        self.assertEqual(
            workspace.owner,
            self.collaborator,
            f"Workspace owner was not set to collaborator: {workspace.owner_id}",
        )
        self.assertEqual(
            workspace.created_by,
            self.collaborator,
            f"Workspace creator was not set to collaborator: {workspace.created_by_id}",
        )

    def test_create_workspace_missing_name(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/workspaces/",
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

    def test_list_workspaces_limited_to_access(self):
        Workspace.objects.create(
            name="Outsider Workspace",
            description="Outsider Workspace Description",
            created_by=self.outsider,
        )
        self.workspace.collaborators.add(self.collaborator)

        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get("/api/workspaces/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 on workspace list, got {response.status_code}: {response.data}",
        )
        workspace_ids = {item["id"] for item in response.data}
        outsider_workspace_ids = set(
            Workspace.objects.filter(owner=self.outsider).values_list("id", flat=True)
        )
        self.assertIn(
            self.workspace.id,
            workspace_ids,
            f"Collaborator workspace missing from list: {response.data}",
        )
        self.assertTrue(
            workspace_ids.isdisjoint(outsider_workspace_ids),
            f"Unexpected outsider workspace included in list: {response.data}",
        )

    def test_owner_can_add_workspace_collaborator_by_email(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/workspaces/{self.workspace.id}/collaborators/",
            {"identifier": self.collaborator.email},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(
            self.workspace.collaborators.filter(pk=self.collaborator.pk).exists()
        )
        collaborator_ids = {
            item["id"] for item in response.data["collaborators_details"]
        }
        self.assertIn(self.collaborator.id, collaborator_ids)

    def test_non_owner_cannot_add_workspace_collaborator(self):
        self.workspace.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            f"/api/workspaces/{self.workspace.id}/collaborators/",
            {"identifier": self.outsider.email},
            format="json",
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(
            self.workspace.collaborators.filter(pk=self.outsider.pk).exists()
        )

    def test_owner_cannot_add_duplicate_workspace_collaborator(self):
        self.workspace.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/workspaces/{self.workspace.id}/collaborators/",
            {"identifier": self.collaborator.username},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            self.workspace.collaborators.filter(pk=self.collaborator.pk).count(), 1
        )

    def test_owner_can_remove_workspace_collaborator(self):
        self.workspace.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(
            f"/api/workspaces/{self.workspace.id}/collaborators/{self.collaborator.id}/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(
            self.workspace.collaborators.filter(pk=self.collaborator.pk).exists()
        )
        collaborator_ids = {
            item["id"] for item in response.data["collaborators_details"]
        }
        self.assertNotIn(self.collaborator.id, collaborator_ids)

    def test_owner_cannot_remove_workspace_owner(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(
            f"/api/workspaces/{self.workspace.id}/collaborators/{self.owner.id}/"
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.workspace.owner_id, self.owner.id)

    def test_retrieve_workspace_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/workspaces/{self.workspace.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 for outsider workspace access, got {response.status_code}: {response.data}",
        )

    def test_update_workspace_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.patch(
            f"/api/workspaces/{self.workspace.id}/",
            {"name": "No Access"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider updates workspace, got {response.status_code}: {response.data}",
        )

    def test_update_workspace_denied_for_collaborator(self):
        self.workspace.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.patch(
            f"/api/workspaces/{self.workspace.id}/",
            {"name": "Collaborator Rename"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when collaborator updates workspace, got {response.status_code}: {response.data}",
        )
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.name, "Owner Workspace")

    def test_delete_workspace_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.delete(f"/api/workspaces/{self.workspace.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider deletes workspace, got {response.status_code}: {response.data}",
        )

    def test_delete_workspace_denied_for_collaborator(self):
        self.workspace.collaborators.add(self.collaborator)
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.delete(f"/api/workspaces/{self.workspace.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when collaborator deletes workspace, got {response.status_code}: {response.data}",
        )
        self.assertTrue(Workspace.objects.filter(pk=self.workspace.pk).exists())


class TodoListApiTests(APITestCase):
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
        self.workspace = Workspace.objects.create(
            name="Owner Workspace",
            description="Owner Workspace Description",
            created_by=self.owner,
        )
        self.workspace.collaborators.add(self.collaborator)
        self.todo_list = TodoList.objects.create(
            name="Owner List",
            description="Owner List Description",
            workspace=self.workspace,
            created_by=self.owner,
        )

    def test_create_todolist_as_collaborator(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/todolists/",
            {
                "name": "Collaborator List",
                "description": "Collaborator Description",
                "workspace": self.workspace.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected 201 for collaborator todolist create, got {response.status_code}: {response.data}",
        )
        todo_list = TodoList.objects.get(id=response.data.get("id"))
        self.assertEqual(
            todo_list.created_by,
            self.collaborator,
            f"Expected collaborator to be creator, got {todo_list.created_by_id}",
        )

    def test_create_todolist_missing_name(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/todolists/",
            {"description": "No Name Supplied", "workspace": self.workspace.id},
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

    def test_create_todolist_missing_workspace(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/todolists/",
            {"name": "Missing Workspace", "description": "No Workspace Supplied"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when workspace is missing, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("workspace"),
            ["This field is required."],
            f"Unexpected error body when workspace is missing: {response.data}",
        )

    def test_create_todolist_requires_workspace_access(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            "/api/todolists/",
            {
                "name": "Bad List",
                "description": "No Access",
                "workspace": self.workspace.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when creating todolist without access, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("detail"),
            "You cannot add todo-lists to this workspace.",
            f"Unexpected error detail when access denied: {response.data}",
        )

    def test_list_todolists_filters_by_workspace(self):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            description="Other Workspace Description",
            created_by=self.owner,
        )
        TodoList.objects.create(
            name="Other List",
            description="Other List Description",
            workspace=other_workspace,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/todolists/?workspace={self.workspace.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered todolist list, got {response.status_code}: {response.data}",
        )
        response_ids = {item["id"] for item in response.data}
        self.assertIn(
            self.todo_list.id,
            response_ids,
            f"Expected todolist from workspace to be listed: {response.data}",
        )
        self.assertEqual(
            len(response_ids),
            1,
            f"Expected only one todolist in filtered response, got {response.data}",
        )

    def test_list_todolists_returns_saved_workspace_order(self):
        second_list = TodoList.objects.create(
            name="Second List",
            description="Second List Description",
            workspace=self.workspace,
            created_by=self.owner,
            position=0,
        )
        self.todo_list.position = 1
        self.todo_list.save(update_fields=["position"])

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/todolists/?workspace={self.workspace.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item["id"] for item in response.data],
            [second_list.id, self.todo_list.id],
        )

    def test_reorder_todolists_persists_workspace_order(self):
        second_list = TodoList.objects.create(
            name="Second List",
            description="Second List Description",
            workspace=self.workspace,
            created_by=self.owner,
            position=1,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/todolists/reorder/",
            {
                "workspace": self.workspace.id,
                "ordered_ids": [second_list.id, self.todo_list.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item["id"] for item in response.data],
            [second_list.id, self.todo_list.id],
        )
        self.todo_list.refresh_from_db()
        second_list.refresh_from_db()
        self.assertEqual(second_list.position, 0)
        self.assertEqual(self.todo_list.position, 1)

    def test_reorder_todolists_rejects_ids_outside_workspace(self):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            description="Other Workspace Description",
            created_by=self.owner,
        )
        other_list = TodoList.objects.create(
            name="Other List",
            description="Other List Description",
            workspace=other_workspace,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/todolists/reorder/",
            {
                "workspace": self.workspace.id,
                "ordered_ids": [other_list.id, self.todo_list.id],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertIn("ordered_ids", response.data)

    def test_list_todolists_filters_by_workspace_denied_for_outsider_workspace(self):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            description="Other Workspace Description",
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/todolists/?workspace={other_workspace.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when filtering by workspace without access, got {response.status_code}: {response.data}",
        )

    def test_list_todolists_filters_by_workspace_denied_for_item_only_collaborator(
        self,
    ):
        list_in_workspace = TodoList.objects.create(
            name="Shared List",
            description="No item-level sharing remains",
            workspace=self.workspace,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.list_only_collaborator)
        response = self.client.get(f"/api/todolists/?workspace={self.workspace.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 for non-member workspace filter, got {response.status_code}: {response.data}",
        )

    def test_retrieve_todolist_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/todolists/{self.todo_list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 for outsider todolist access, got {response.status_code}: {response.data}",
        )

    def test_update_todolist_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.patch(
            f"/api/todolists/{self.todo_list.id}/",
            {"name": "No Access"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider updates todolist, got {response.status_code}: {response.data}",
        )

    def test_delete_todolist_denied_for_outsider(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.delete(f"/api/todolists/{self.todo_list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when outsider deletes todolist, got {response.status_code}: {response.data}",
        )

    def test_todolist_cannot_add_notes_from_other_workspace(self):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            description="Other Workspace Description",
            created_by=self.owner,
        )
        other_note = Note.objects.create(
            note="Cross Workspace Note",
            description="Should not be attachable across workspaces",
            workspace=other_workspace,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/todolists/{self.todo_list.id}/",
            {"notes": [other_note.id]},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attaching cross-workspace notes, got {response.status_code}: {response.data}",
        )
        self.assertIn(
            "notes",
            response.data,
            f"Expected 'notes' validation error, got: {response.data}",
        )

    def test_todolist_cannot_change_workspace_after_create(self):
        other_workspace = Workspace.objects.create(
            name="Second Workspace",
            description="Second Workspace Description",
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/todolists/{self.todo_list.id}/",
            {"workspace": other_workspace.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when changing todolist workspace, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("workspace"),
            ["Cannot change workspace of a todo list."],
            f"Unexpected error body when changing todolist workspace: {response.data}",
        )

        self.todo_list.refresh_from_db()
        self.assertEqual(
            self.todo_list.workspace_id,
            self.workspace.id,
            "TodoList workspace unexpectedly changed.",
        )

    def test_workspace_collaborator_can_retrieve_owner_created_todolist_without_item_share(
        self,
    ):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/todolists/{self.todo_list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected workspace collaborator to retrieve owner-created list, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), self.todo_list.id)

    def test_owner_can_retrieve_collaborator_created_todolist_without_item_share(self):
        collaborator_list = TodoList.objects.create(
            name="Collaborator Created List",
            description="Shared through workspace",
            workspace=self.workspace,
            created_by=self.collaborator,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/todolists/{collaborator_list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected workspace owner to retrieve collaborator-created list, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), collaborator_list.id)

    def test_workspace_membership_does_not_leak_todolists_from_other_workspaces(self):
        other_member = User.objects.create_user(
            username="other_member",
            email="other_member@example.com",
            password="other-member-password",
        )
        other_workspace = Workspace.objects.create(
            name="Other Shared Workspace",
            description="Separate sharing boundary",
            created_by=self.outsider,
        )
        other_workspace.collaborators.add(other_member)
        other_list = TodoList.objects.create(
            name="Other Workspace List",
            description="Should not leak",
            workspace=other_workspace,
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/todolists/{other_list.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected no access to another workspace's list, got {response.status_code}: {response.data}",
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
        self.workspace = Workspace.objects.create(
            name="Owner Workspace",
            description="Owner Workspace Description",
            created_by=self.owner,
        )
        self.workspace.collaborators.add(self.collaborator)
        self.todo_list = TodoList.objects.create(
            name="Owner List",
            description="Owned List Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        self.note = Note.objects.create(
            note="Owner Note",
            description="Owner Note Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        self.todo_list.notes.add(self.note)

    def test_workspace_collaborator_can_retrieve_owner_created_note_without_item_share(
        self,
    ):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/notes/{self.note.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected workspace collaborator to retrieve owner-created note, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), self.note.id)

    def test_owner_can_retrieve_collaborator_created_note_in_todolist_without_item_share(
        self,
    ):
        collaborator_note = Note.objects.create(
            note="Collaborator Created Note",
            description="Shared through workspace list",
            workspace=self.workspace,
            created_by=self.collaborator,
        )
        self.todo_list.notes.add(collaborator_note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/{collaborator_note.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected workspace owner to retrieve collaborator-created note, got {response.status_code}: {response.data}",
        )
        self.assertEqual(response.data.get("id"), collaborator_note.id)

    def test_collaborator_can_create_note_directly_in_shared_workspace(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/notes/",
            {
                "note": "Workspace Scoped Note",
                "description": "Created directly in shared workspace",
                "workspace": self.workspace.id,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Expected collaborator to create workspace-scoped note, got {response.status_code}: {response.data}",
        )
        note = Note.objects.get(id=response.data.get("id"))
        self.assertEqual(note.workspace_id, self.workspace.id)

        self.client.force_authenticate(user=self.owner)
        retrieve_response = self.client.get(f"/api/notes/{note.id}/")
        self.assertEqual(
            retrieve_response.status_code,
            status.HTTP_200_OK,
            f"Expected owner to retrieve collaborator-created workspace note, got {retrieve_response.status_code}: {retrieve_response.data}",
        )

    def test_workspace_membership_does_not_leak_notes_from_other_workspaces(self):
        other_workspace = Workspace.objects.create(
            name="Other Shared Workspace",
            description="Separate sharing boundary",
            created_by=self.outsider,
        )
        other_note = Note.objects.create(
            note="Other Workspace Note",
            description="Should not leak",
            workspace=other_workspace,
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.collaborator)
        response = self.client.get(f"/api/notes/{other_note.id}/")

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected no access to another workspace's note, got {response.status_code}: {response.data}",
        )

    def test_create_note_as_collaborator(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/notes/",
            {
                "note": "Collaborator Note",
                "description": "Created by Collaborator",
                "todo_list": self.todo_list.id,
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
            note.workspace,
            self.workspace,
            f"Expected note workspace to match todo list workspace, got {note.workspace_id}",
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
            {"description": "No Note Supplied", "todo_list": self.todo_list.id},
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

    def test_create_note_missing_todolist(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            "/api/notes/",
            {"note": "Missing List", "description": "No List Supplied"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when todo_list is missing, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("todo_list"),
            ["This field is required when workspace is not provided."],
            f"Unexpected error body when todo_list is missing: {response.data}",
        )

    def test_create_note_requires_todolist_access(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            "/api/notes/",
            {
                "note": "Outsider Note",
                "description": "No Access",
                "todo_list": self.todo_list.id,
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
            "You cannot add notes to this todo-list.",
            f"Unexpected error detail for note access denial: {response.data}",
        )

    def test_list_notes_filters_by_todolist(self):
        other_todo_list = TodoList.objects.create(
            name="Other List",
            description="Other List Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        other_note = Note.objects.create(
            note="Other Note",
            description="Other Note Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        other_todo_list.notes.add(other_note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?todo_list={self.todo_list.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered note list, got {response.status_code}: {response.data}",
        )
        response_ids = {item["id"] for item in response.data}
        self.assertIn(
            self.note.id,
            response_ids,
            f"Expected note from todo_list to be listed: {response.data}",
        )
        self.assertEqual(
            len(response_ids),
            1,
            f"Expected only one note in filtered response, got {response.data}",
        )

    def test_list_notes_returns_saved_todolist_membership_order(self):
        second_note = Note.objects.create(
            note="Second Note",
            description="Second Note Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        self.todo_list.notes.add(second_note)
        TodoListNote.objects.filter(todolist=self.todo_list, note=self.note).update(
            position=1
        )
        TodoListNote.objects.filter(todolist=self.todo_list, note=second_note).update(
            position=0
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?todo_list={self.todo_list.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item["id"] for item in response.data],
            [second_note.id, self.note.id],
        )

    def test_reorder_notes_persists_todolist_membership_order(self):
        second_note = Note.objects.create(
            note="Second Note",
            description="Second Note Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        self.todo_list.notes.add(second_note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/notes/reorder/",
            {
                "todo_list": self.todo_list.id,
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
            TodoListNote.objects.get(
                todolist=self.todo_list, note=second_note
            ).position,
            0,
        )
        self.assertEqual(
            TodoListNote.objects.get(todolist=self.todo_list, note=self.note).position,
            1,
        )

    def test_reorder_notes_rejects_ids_outside_todolist(self):
        outside_note = Note.objects.create(
            note="Outside Note",
            description="Outside Note Description",
            workspace=self.workspace,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            "/api/notes/reorder/",
            {
                "todo_list": self.todo_list.id,
                "ordered_ids": [outside_note.id, self.note.id],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertIn("ordered_ids", response.data)

    def test_same_note_can_have_different_positions_in_different_todolists(self):
        second_note = Note.objects.create(
            note="Second Note",
            description="Second Note Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        other_todo_list = TodoList.objects.create(
            name="Other List",
            description="Other List Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        self.todo_list.notes.add(second_note)
        other_todo_list.notes.add(self.note)
        other_todo_list.notes.add(second_note)

        self.client.force_authenticate(user=self.owner)
        first_response = self.client.patch(
            "/api/notes/reorder/",
            {
                "todo_list": self.todo_list.id,
                "ordered_ids": [second_note.id, self.note.id],
            },
            format="json",
        )
        second_response = self.client.patch(
            "/api/notes/reorder/",
            {
                "todo_list": other_todo_list.id,
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
            TodoListNote.objects.get(todolist=self.todo_list, note=self.note).position,
            1,
        )
        self.assertEqual(
            TodoListNote.objects.get(todolist=other_todo_list, note=self.note).position,
            0,
        )

    def test_list_notes_filters_by_workspace_denied_for_outsider_workspace(self):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            description="Other Workspace Description",
            created_by=self.outsider,
        )
        Note.objects.create(
            note="Outsider Note",
            description="Should not be accessible",
            workspace=other_workspace,
            created_by=self.outsider,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?workspace={other_workspace.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 when filtering notes by workspace without access, got {response.status_code}: {response.data}",
        )

    def test_list_notes_filters_by_workspace_denied_for_item_only_collaborator(self):
        self.client.force_authenticate(user=self.note_only_collaborator)
        response = self.client.get(f"/api/notes/?workspace={self.workspace.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Expected 403 for non-member workspace filter, got {response.status_code}: {response.data}",
        )

    def test_note_can_belong_to_multiple_todolists(self):
        other_todo_list = TodoList.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        other_todo_list.notes.add(self.note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?todo_list={other_todo_list.id}")

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for filtered note list, got {response.status_code}: {response.data}",
        )
        response_ids = {item["id"] for item in response.data}
        self.assertIn(
            self.note.id,
            response_ids,
            f"Expected note to be listed for secondary todo_list: {response.data}",
        )

    def test_note_removed_from_todolist_not_in_filtered_results(self):
        other_todo_list = TodoList.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            workspace=self.workspace,
            created_by=self.owner,
        )
        other_todo_list.notes.add(self.note)
        other_todo_list.notes.remove(self.note)

        self.client.force_authenticate(user=self.owner)
        response = self.client.get(f"/api/notes/?todo_list={other_todo_list.id}")

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

    def test_patch_note_todo_list_attaches_within_workspace(self):
        other_todo_list = TodoList.objects.create(
            name="Secondary List",
            description="Secondary List Description",
            workspace=self.workspace,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"todo_list": other_todo_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 when attaching note to another list, got {response.status_code}: {response.data}",
        )
        self.assertTrue(
            other_todo_list.notes.filter(id=self.note.id).exists(),
            "Expected note to be attached to the specified todo list.",
        )

    def test_patch_note_todo_list_attach_requires_todolist_access(self):
        other_todo_list = TodoList.objects.create(
            name="Private List",
            description="Not shared with note-only collaborator",
            workspace=self.workspace,
            created_by=self.owner,
        )

        # Item-level note sharing no longer exists, so this user has no access.
        self.client.force_authenticate(user=self.note_only_collaborator)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"todo_list": other_todo_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Expected 404 when patching a note without access, got {response.status_code}: {response.data}",
        )

    def test_patch_note_todo_list_cross_workspace_rejected(self):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            description="Other Workspace Description",
            created_by=self.owner,
        )
        other_todo_list = TodoList.objects.create(
            name="Other List",
            description="Other List Description",
            workspace=other_workspace,
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"todo_list": other_todo_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attaching note to cross-workspace list, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("todo_list"),
            ["Todo list must be in the same workspace as the note."],
            f"Unexpected error body for cross-workspace todo_list: {response.data}",
        )

    def test_note_cannot_change_workspace_after_create(self):
        other_workspace = Workspace.objects.create(
            name="Second Workspace",
            description="Second Workspace Description",
            created_by=self.owner,
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"workspace": other_workspace.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when changing note workspace, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("workspace"),
            ["Cannot change workspace of an existing note."],
            f"Unexpected error body when changing note workspace: {response.data}",
        )

        self.note.refresh_from_db()
        self.assertEqual(
            self.note.workspace_id,
            self.workspace.id,
            "Note workspace unexpectedly changed.",
        )

    def test_note_workspace_immutability_error_precedes_todolist_validation(self):
        other_workspace = Workspace.objects.create(
            name="Second Workspace",
            description="Second Workspace Description",
            created_by=self.owner,
        )

        # If a client tries to change both `workspace` and `todo_list`, the API should
        # report the workspace immutability error (clearer semantics) rather than a
        # derived workspace/todo_list mismatch error.
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notes/{self.note.id}/",
            {"workspace": other_workspace.id, "todo_list": self.todo_list.id},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 when attempting to change note workspace, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("workspace"),
            ["Cannot change workspace of an existing note."],
            f"Unexpected error body when changing note workspace: {response.data}",
        )
        self.assertNotIn(
            "todo_list",
            response.data,
            f"Expected workspace error to be raised first: {response.data}",
        )
