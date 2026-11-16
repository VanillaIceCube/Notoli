"""Notoli initial-board creation and atomic account onboarding."""

from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notes.models import Board, List, ListNote, Note
from apps.notes.signals import (
    DEFAULT_PERSONAL_BOARD_CONTENT,
    seed_default_personal_board,
)

from .helpers import User


class RegistrationOnboardingTests(APITestCase):
    def test_register_default_board_capitalizes_derived_email_username(self):
        response = self.client.post(
            "/auth/register/",
            {"email": "example_02@gmail.com", "password": "test_password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = User.objects.get(email="example_02@gmail.com")
        board = Board.objects.filter(owner=user).first()

        self.assertIsNotNone(board, "Default board was not created.")
        self.assertEqual(user.username, "example_02")
        self.assertEqual(board.name, "Example_02's Board")

    def test_register_default_board_preserves_explicit_username(self):
        response = self.client.post(
            "/auth/register/",
            {
                "email": "custom@example.com",
                "username": "customUser",
                "password": "test_password",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = User.objects.get(email="custom@example.com")
        board = Board.objects.filter(owner=user).first()

        self.assertIsNotNone(board, "Default board was not created.")
        self.assertEqual(user.username, "customUser")
        self.assertEqual(board.name, "customUser's Board")

    def test_default_board_name_falls_back_to_email_prefix(self):
        user = User(username="", email="jaalaba@gmail.com")
        user.set_password("test_password")
        user.save()

        board = Board.objects.filter(owner=user).first()

        self.assertIsNotNone(board, "Default board was not created.")
        self.assertEqual(board.name, "Jaalaba's Board")

    def test_default_board_bootstrap_is_idempotent(self):
        user = User.objects.create_user(
            username="idempotent",
            email="idempotent@example.com",
            password="test_password",
        )
        board = Board.objects.get(owner=user)

        seed_default_personal_board(board, user)

        expected_list_names = [
            list_name for list_name, _notes in DEFAULT_PERSONAL_BOARD_CONTENT
        ]
        self.assertEqual(
            list(
                board.lists.order_by("position", "created_at", "id").values_list(
                    "name", flat=True
                )
            ),
            expected_list_names,
        )
        self.assertEqual(
            List.objects.filter(board=board).count(),
            len(DEFAULT_PERSONAL_BOARD_CONTENT),
        )
        expected_note_count = sum(
            len(note_texts) for _list_name, note_texts in DEFAULT_PERSONAL_BOARD_CONTENT
        )
        self.assertEqual(Note.objects.filter(board=board).count(), expected_note_count)
        self.assertEqual(
            ListNote.objects.filter(list__board=board).count(),
            expected_note_count,
        )

    def test_manually_created_board_does_not_receive_default_content(self):
        user = User.objects.create_user(
            username="manual",
            email="manual@example.com",
            password="test_password",
        )

        manual_board = Board.objects.create(
            name="Manual Board",
            owner=user,
            created_by=user,
        )

        self.assertFalse(manual_board.lists.exists())


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AtomicOnboardingTests(APITestCase):
    def test_seeding_failure_rolls_back_all_signup_data_and_allows_retry(self):
        before = {
            model: model.objects.count()
            for model in (User, Board, List, Note, ListNote)
        }
        payload = {
            "email": "onboarding@example.com",
            "password": "Onboarding-Password-93!",
        }

        def fail_after_seed(board, user):
            seed_default_personal_board(board, user)
            raise RuntimeError("onboarding unavailable")

        with patch(
            "apps.notes.signals.seed_default_personal_board",
            side_effect=fail_after_seed,
        ):
            with self.assertRaisesMessage(RuntimeError, "onboarding unavailable"):
                self.client.post("/auth/register/", payload, format="json")
        for model, count in before.items():
            self.assertEqual(model.objects.count(), count, model.__name__)
        response = self.client.post("/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email=payload["email"])
        self.assertTrue(
            Board.objects.filter(owner=user, pk=response.data["board_id"]).exists()
        )
