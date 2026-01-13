from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Workspace, TodoList, Note


class WorkspaceViewSetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="owner", password="pass1234")
        self.client.force_authenticate(self.user)

    def test_create_workspace_sets_owner_and_creator(self):
        url = reverse("workspace-list")

        response = self.client.post(
            url,
            {"name": "Project", "description": "Notes"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        workspace = Workspace.objects.get(name="Project")
        self.assertEqual(workspace.owner, self.user)
        self.assertEqual(workspace.created_by, self.user)


class TodoListViewSetTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pass1234")
        self.other_user = User.objects.create_user(
            username="other", password="pass1234"
        )
        self.workspace = Workspace.objects.create(
            name="Workspace",
            description="Main",
            owner=self.owner,
            created_by=self.owner,
        )
        self.client.force_authenticate(self.other_user)

    def test_create_todolist_requires_workspace_access(self):
        url = reverse("todolist-list")

        response = self.client.post(
            url,
            {"name": "Todo", "description": "Work", "workspace": self.workspace.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TodoList.objects.filter(name="Todo").exists())


class NoteViewSetTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pass1234")
        self.collaborator = User.objects.create_user(
            username="collab", password="pass1234"
        )
        self.workspace = Workspace.objects.create(
            name="Workspace",
            description="Main",
            owner=self.owner,
            created_by=self.owner,
        )
        self.todo_list = TodoList.objects.create(
            name="Todo",
            description="Work",
            workspace=self.workspace,
            owner=self.owner,
            created_by=self.owner,
        )
        self.todo_list.collaborators.add(self.collaborator)
        self.client.force_authenticate(self.collaborator)

    def test_create_note_allows_collaborator(self):
        url = reverse("note-list")

        response = self.client.post(
            url,
            {"note": "Task", "description": "Do it", "todo_list": self.todo_list.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Note.objects.filter(note="Task").exists())
