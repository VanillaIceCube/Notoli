"""Shared users, board, list and task fixtures for notification tests."""

from django.contrib.auth import get_user_model

from apps.tasks.models import Board, List, Task

User = get_user_model()


class NotificationFixture:
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
        self.other_collaborator = User.objects.create_user(
            username="other_collaborator",
            email="other_collaborator@example.com",
            password="other-password",
        )
        self.outsider = User.objects.create_user(
            username="outsider",
            email="outsider_email@example.com",
            password="outsider-password",
        )
        self.board = Board.objects.create(
            name="Shared Board",
            description="Shared Board Description",
            created_by=self.owner,
        )
        self.board.collaborators.add(self.collaborator, self.other_collaborator)
        self.list = List.objects.create(
            name="Shared List",
            description="Shared List Description",
            board=self.board,
            created_by=self.owner,
        )
        self.task = Task.objects.create(
            text="Shared Task",
            description="Shared Task Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.tasks.add(self.task)
