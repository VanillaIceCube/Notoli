"""Board, list and task model representations."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from ..models import Board, List, Task

User = get_user_model()


class ModelStringRepresentationTests(APITestCase):
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
        self.task = Task.objects.create(
            text="Owner Task",
            description="Owner Task Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.tasks.add(self.task)

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
            str(self.task), "Owner Task", "Task __str__ did not return the task text."
        )
