"""Account creation, duplicate identities and registration validation."""

from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notes.models import Board, Note
from apps.notes.services import (
    DEFAULT_PERSONAL_BOARD_CONTENT,
)

from .helpers import CredentialFixtures, User


class RegistrationTests(APITestCase):
    def test_register_rejects_weak_password(self):
        response = self.client.post(
            "/auth/register/",
            {"email": "mapper@example.com", "password": "short"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)
        self.assertIn("too short", response.data["error"].lower())
        self.assertFalse(User.objects.filter(email="mapper@example.com").exists())

    def test_register_rejects_common_numeric_and_user_similar_passwords(self):
        for password in ("password", "123456789012", "mapper", "macro_mapper"):
            with self.subTest(password=password):
                response = self.client.post(
                    "/auth/register/",
                    {
                        "email": "mapper@example.com",
                        "username": "macro_mapper",
                        "password": password,
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertFalse(
                    User.objects.filter(email="mapper@example.com").exists()
                )

    def test_register_checks_similarity_to_derived_username(self):
        response = self.client.post(
            "/auth/register/",
            {"email": "longusername@example.com", "password": "longusername"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("too similar", response.data["error"].lower())
        self.assertFalse(User.objects.filter(email="longusername@example.com").exists())

    def test_register_rejects_non_string_password_without_creating_user(self):
        for password in (123456789, ["long-password"], {"value": "long-password"}):
            with self.subTest(password=password):
                response = self.client.post(
                    "/auth/register/",
                    {"email": "invalid-password@example.com", "password": password},
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertFalse(
                    User.objects.filter(email="invalid-password@example.com").exists()
                )

    def test_register_success(self):
        response = self.client.post(
            "/auth/register/",
            {"email": "test_email@example.com", "password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Unexpected response: {response.data}",
        )

        self.assertTrue(
            User.objects.filter(username="test_email").exists(),
            "User was not created in the database",
        )

        user = User.objects.get(username="test_email")
        board = Board.objects.filter(owner=user, name="Test_email's Board").first()
        self.assertIsNotNone(
            board,
            "Default board was not created for the user.",
        )
        default_lists = list(board.lists.order_by("position", "created_at", "id"))
        expected_list_names = [
            list_name for list_name, _notes in DEFAULT_PERSONAL_BOARD_CONTENT
        ]
        self.assertEqual(
            [note_list.name for note_list in default_lists],
            expected_list_names,
            "Default board lists were not created in the expected order.",
        )
        for note_list, (_list_name, expected_notes) in zip(
            default_lists, DEFAULT_PERSONAL_BOARD_CONTENT, strict=True
        ):
            actual_notes = list(
                Note.objects.filter(list_memberships__list=note_list).order_by(
                    "list_memberships__position",
                    "list_memberships__id",
                    "id",
                )
            )
            self.assertEqual(
                [note.note for note in actual_notes],
                expected_notes,
                f"Unexpected starter notes for {note_list.name}.",
            )

        self.assertEqual(
            response.data.get("message"),
            "User created successfully.",
            f"Unexpected response body: {response.data}",
        )
        self.assertEqual(
            response.data.get("username"),
            "test_email",
            f"Expected username in response: {response.data}",
        )
        self.assertEqual(
            response.data.get("email"),
            "test_email@example.com",
            f"Expected email in response: {response.data}",
        )
        self.assertTrue(
            response.data.get("access"),
            f"Expected access token in response: {response.data}",
        )
        self.assertTrue(
            response.data.get("refresh"),
            f"Expected refresh token in response: {response.data}",
        )
        self.assertEqual(
            response.data.get("board_id"),
            board.id,
            f"Unexpected board id in response: {response.data}",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {response.data.get('access')}"
        )
        lists_response = self.client.get(f"/api/lists/?board={board.id}")
        self.assertEqual(
            lists_response.status_code,
            status.HTTP_200_OK,
            lists_response.data,
        )
        self.assertEqual(
            [item["name"] for item in lists_response.data],
            expected_list_names,
            f"Unexpected list API order: {lists_response.data}",
        )

    def test_register_default_username(self):
        response = self.client.post(
            "/auth/register/",
            {"email": "test_email@example.com", "password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Unexpected response: {response.data}",
        )

        created_user = User.objects.get(email="test_email@example.com")
        self.assertEqual(
            created_user.username,
            "test_email",
            f"Unexpected username for default email: {created_user.username}",
        )

    def test_register_missing_email(self):
        response = self.client.post(
            "/auth/register/",
            {"password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for missing email, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("error"),
            "Email and password required.",
            f"Unexpected error body for missing email: {response.data}",
        )

    def test_register_missing_password(self):
        response = self.client.post(
            "/auth/register/",
            {"email": "test_email@example.com"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for missing password, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("error"),
            "Email and password required.",
            f"Unexpected error body for missing password: {response.data}",
        )

    def test_register_empty_payload(self):
        response = self.client.post("/auth/register/", {}, format="json")

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for empty payload, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("error"),
            "Email and password required.",
            f"Unexpected error body for empty payload: {response.data}",
        )

    def test_register_non_json_request(self):
        response = self.client.post(
            "/auth/register/",
            "username=test_email&password=test_password",
            content_type="text/plain",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Expected 415 for non-JSON payload, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("detail"),
            'Unsupported media type "text/plain" in request.',
            f"Unexpected error body for non-JSON payload: {response.data}",
        )

    def test_register_duplicate_username(self):
        User.objects.create_user(
            username="duplicate_username",
            email="duplicate_password@example.com",
            password="duplicate_password",
        )

        response = self.client.post(
            "/auth/register/",
            {
                "email": "unique_email@example.com",
                "username": "duplicate_username",
                "password": "unique_password",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for duplicate username, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("error"),
            "Username already exists.",
            f"Unexpected error body for duplicate username: {response.data}",
        )

    def test_register_duplicate_email(self):
        User.objects.create_user(
            username="unique_username",
            email="duplicate_email@example.com",
            password="test_password",
        )

        response = self.client.post(
            "/auth/register/",
            {"email": "duplicate_email@example.com", "password": "duplicate_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for duplicate email, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("error"),
            "Email already exists.",
            f"Unexpected error body for duplicate email: {response.data}",
        )


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class RegistrationInputTests(CredentialFixtures, APITestCase):
    def test_registration_rejects_non_string_credentials_and_bad_payloads(self):
        count = User.objects.count()
        for field in ("email", "password", "username"):
            values = (123, True, [], {}) + ((None,) if field != "username" else ())
            for value in values:
                with self.subTest(field=field, value=value):
                    payload = {
                        "email": "new-contract@example.com",
                        "password": "New-Contract-Password-89!",
                    }
                    payload[field] = value
                    response = self.client.post(
                        "/auth/register/", payload, format="json"
                    )
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertIn("error", response.data)
                    self.assertEqual(User.objects.count(), count)
        response = self.client.post(
            "/auth/register/", ["not", "an", "object"], format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.count(), count)

    def test_registration_preserves_password_and_normalizes_identity(self):
        password = "  New-Contract-Password-89!  "
        response = self.client.post(
            "/auth/register/",
            {
                "email": " NEW-CONTRACT@example.com ",
                "username": " new-contract ",
                "password": password,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email="new-contract@example.com")
        self.assertEqual(user.username, "new-contract")
        self.assertTrue(user.check_password(password))
        self.assertFalse(user.check_password(password.strip()))

    def test_registration_collision_is_a_client_error(self):
        User.objects.create_user(username="duplicate", email="duplicate@example.com")
        # Django normalizes the fullwidth letter before inserting the username.
        response = self.client.post(
            "/auth/register/",
            {
                "email": "new-contract@example.com",
                "username": "\uff44uplicate",
                "password": "New-Contract-Password-89!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"error": "Email or username already exists."})
        self.assertFalse(User.objects.filter(email="new-contract@example.com").exists())

    def test_failed_session_creation_rolls_back_registration(self):
        with patch(
            "apps.authentication.views.RefreshToken.for_user",
            side_effect=RuntimeError("session unavailable"),
        ):
            with self.assertRaisesMessage(RuntimeError, "session unavailable"):
                self.client.post(
                    "/auth/register/",
                    {
                        "email": "new-contract@example.com",
                        "password": "New-Contract-Password-89!",
                    },
                    format="json",
                )
        self.assertFalse(User.objects.filter(email="new-contract@example.com").exists())
