"""Notoli initial-board creation and atomic account onboarding."""

from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.tasks.models import Board, List, ListTask, Task
from apps.tasks.services import (
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
            list_name for list_name, _tasks in DEFAULT_PERSONAL_BOARD_CONTENT
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
        expected_task_count = sum(
            len(task_texts) for _list_name, task_texts in DEFAULT_PERSONAL_BOARD_CONTENT
        )
        self.assertEqual(Task.objects.filter(board=board).count(), expected_task_count)
        self.assertEqual(
            ListTask.objects.filter(list__board=board).count(),
            expected_task_count,
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
    def test_admin_add_creates_a_starter_board(self):
        admin = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="Admin-Password-93!"
        )
        self.assertEqual(Board.objects.get(owner=admin).lists.count(), 3)
        self.client.force_login(admin)
        response = self.client.post(
            reverse("admin:authentication_user_add"),
            {
                "username": "admin_added",
                "usable_password": "true",
                "password1": "Local-Account-93!",
                "password2": "Local-Account-93!",
            },
        )

        self.assertEqual(response.status_code, 302)
        new_user = User.objects.get(username="admin_added")
        board = Board.objects.get(owner=new_user)
        self.assertEqual(board.name, "admin_added's Board")
        self.assertEqual(
            list(board.lists.values_list("name", flat=True)),
            ["Grocery List", "Chores List", "Todo List"],
        )

    def test_saving_existing_user_does_not_recreate_a_deleted_starter_board(self):
        user = User.objects.create_user(
            username="existing", email="existing@example.com"
        )
        Board.objects.get(owner=user).delete()
        user.first_name = "Updated"
        user.save()
        self.assertFalse(Board.objects.filter(owner=user).exists())

    def test_failed_direct_save_can_retry_with_the_same_user(self):
        user = User(username="retry", email="retry@example.com")
        with patch(
            "apps.tasks.services.seed_default_personal_board",
            side_effect=RuntimeError("onboarding unavailable"),
        ):
            with self.assertRaisesMessage(RuntimeError, "onboarding unavailable"):
                user.save()

        self.assertIsNone(user.pk)
        self.assertFalse(User.objects.filter(username="retry").exists())
        user.save()
        self.assertEqual(Board.objects.get(owner=user).lists.count(), 3)

    def test_seeding_failure_rolls_back_all_signup_data_and_allows_retry(self):
        before = {
            model: model.objects.count()
            for model in (User, Board, List, Task, ListTask)
        }
        payload = {
            "email": "onboarding@example.com",
            "password": "Onboarding-Password-93!",
        }

        def fail_after_seed(board, user):
            seed_default_personal_board(board, user)
            raise RuntimeError("onboarding unavailable")

        with patch(
            "apps.tasks.services.seed_default_personal_board",
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
