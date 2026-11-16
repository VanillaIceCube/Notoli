"""Board, list and item model representations."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from ..models import Board, List, Note

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
        self.note = Note.objects.create(
            note="Owner Note",
            description="Owner Note Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(self.note)

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
            str(self.note), "Owner Note", "Note __str__ did not return the note text."
        )
