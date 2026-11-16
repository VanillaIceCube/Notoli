"""Shared boards, accounts and memberships for REST behavior tests."""

from django.contrib.auth import get_user_model

from ..models import Board, List, Note

User = get_user_model()


class ItemApiFixtures:
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
        self.board = Board.objects.create(
            name="Owner Board",
            description="Owner Board Description",
            created_by=self.owner,
        )
        self.board.collaborators.add(self.collaborator)
        self.list = List.objects.create(
            name="Owner List",
            description="Owned List Description",
            board=self.board,
            created_by=self.owner,
        )
        self.note = Note.objects.create(
            note="Owner Note",
            description="Owner Note Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(self.note)


class ListApiFixtures:
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
        self.board = Board.objects.create(
            name="Owner Board",
            description="Owner Board Description",
            created_by=self.owner,
        )
        self.board.collaborators.add(self.collaborator)
        self.list = List.objects.create(
            name="Owner List",
            description="Owner List Description",
            board=self.board,
            created_by=self.owner,
        )
