from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from notes.models import Workspace

User = get_user_model()


class AuthMethodTests(APITestCase):
    def test_register_get_not_allowed(self):
        response = self.client.get("/auth/register/")

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
            f"Expected 405 for GET /auth/register/, got {response.status_code}: {response.data}",
        )

    def test_login_get_not_allowed(self):
        response = self.client.get("/auth/login/")

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
            f"Expected 405 for GET /auth/login/, got {response.status_code}: {response.data}",
        )

    def test_refresh_get_not_allowed(self):
        response = self.client.get("/auth/refresh/")

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
            f"Expected 405 for GET /auth/refresh/, got {response.status_code}: {response.data}",
        )

    def test_forgot_password_get_not_allowed(self):
        response = self.client.get("/auth/forgot-password/")

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
            (
                "Expected 405 for GET /auth/forgot-password/, got "
                f"{response.status_code}: {response.data}"
            ),
        )

    def test_reset_password_get_not_allowed(self):
        response = self.client.get("/auth/reset-password/")

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
            (
                "Expected 405 for GET /auth/reset-password/, got "
                f"{response.status_code}: {response.data}"
            ),
        )


class RegistrationTests(APITestCase):
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
        workspace = Workspace.objects.filter(owner=user, name="My Workspace").first()
        self.assertIsNotNone(
            workspace,
            "Default workspace was not created for the user.",
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
            response.data.get("workspace_id"),
            workspace.id,
            f"Unexpected workspace id in response: {response.data}",
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


class LoginTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="test_email",
            email="test_email@example.com",
            password="test_password",
        )

    def _login_and_get_tokens(self):
        response = self.client.post(
            "/auth/login/",
            {"email": "test_email@example.com", "password": "test_password"},
            format="json",
        )
        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for valid credentials, got {response.status_code}: {response.data}",
        )
        return response.data

    def test_login_success(self):
        response = self.client.post(
            "/auth/login/",
            {"email": "test_email@example.com", "password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for valid credentials, got {response.status_code}: {response.data}",
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
            response.data.get("username"),
            "test_email",
            f"Expected username in response: {response.data}",
        )
        self.assertEqual(
            response.data.get("email"),
            "test_email@example.com",
            f"Expected email in response: {response.data}",
        )

    def test_login_invalid_password(self):
        response = self.client.post(
            "/auth/login/",
            {"email": "test_email@example.com", "password": "wrong_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
            f"Expected 401 for invalid password, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("detail"),
            "No active account found with the given credentials",
            f"Unexpected error body for invalid password: {response.data}",
        )

    def test_login_nonexistent_user(self):
        response = self.client.post(
            "/auth/login/",
            {"email": "missing_user@example.com", "password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
            f"Expected 401 for nonexistent user, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("detail"),
            "No active account found with the given credentials",
            f"Unexpected error body for nonexistent user: {response.data}",
        )

    def test_login_missing_email(self):
        response = self.client.post(
            "/auth/login/",
            {"password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for missing email, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("email"),
            ["This field is required."],
            f"Unexpected error body for missing email: {response.data}",
        )

    def test_login_missing_password(self):
        response = self.client.post(
            "/auth/login/",
            {"email": "test_email@example.com"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for missing password, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("password"),
            ["This field is required."],
            f"Unexpected error body for missing password: {response.data}",
        )

    def test_login_non_json_request(self):
        response = self.client.post(
            "/auth/login/",
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

    def test_login_inactive_user(self):
        self.user.is_active = False
        self.user.save()

        response = self.client.post(
            "/auth/login/",
            {"email": "test_email@example.com", "password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
            f"Expected 401 for inactive user, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("detail"),
            "No active account found with the given credentials",
            f"Unexpected error body for inactive user: {response.data}",
        )


class RefreshTokenTests(APITestCase):
    def setUp(self):
        User.objects.create_user(
            username="test_email",
            email="test_email@example.com",
            password="test_password",
        )

    def _get_refresh_token(self):
        response = self.client.post(
            "/auth/login/",
            {"email": "test_email@example.com", "password": "test_password"},
            format="json",
        )
        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for valid credentials, got {response.status_code}: {response.data}",
        )
        return response.data.get("refresh")

    def test_refresh_success(self):
        refresh = self._get_refresh_token()

        response = self.client.post(
            "/auth/refresh/",
            {"refresh": refresh},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"Expected 200 for valid refresh token, got {response.status_code}: {response.data}",
        )
        self.assertTrue(
            response.data.get("access"),
            f"Expected access token in response: {response.data}",
        )

    def test_refresh_missing_token(self):
        response = self.client.post("/auth/refresh/", {}, format="json")

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for missing refresh token, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("refresh"),
            ["This field is required."],
            f"Unexpected error body for missing refresh token: {response.data}",
        )

    def test_refresh_invalid_token(self):
        response = self.client.post(
            "/auth/refresh/",
            {"refresh": "not-a-real-token"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
            f"Expected 401 for invalid refresh token, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("code"),
            "token_not_valid",
            f"Unexpected error code for invalid refresh token: {response.data}",
        )

    def test_refresh_non_json_request(self):
        r = self.client.post("/auth/refresh/", "refresh=abc", content_type="text/plain")
        self.assertEqual(r.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)


class PasswordResetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reset_user",
            email="reset_user@example.com",
            password="old_password_123",
        )

    @patch("authentication.views.send_mail")
    def test_forgot_password_existing_email_sends_mail(self, mock_send_mail):
        response = self.client.post(
            "/auth/forgot-password/",
            {"email": "reset_user@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data.get("message"),
            "Password reset link has been sent!",
        )
        mock_send_mail.assert_called_once()
        args = mock_send_mail.call_args[0]
        self.assertEqual(args[0], "Reset your Notoli password")
        self.assertIn("reset-password?uid=", args[1])
        self.assertIn("token=", args[1])
        self.assertEqual(args[3], ["reset_user@example.com"])

    @patch("authentication.views.send_mail")
    def test_forgot_password_unknown_email_is_generic_and_does_not_send_mail(
        self, mock_send_mail
    ):
        response = self.client.post(
            "/auth/forgot-password/",
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data.get("message"),
            "Password reset link has been sent!",
        )
        mock_send_mail.assert_not_called()

    def test_forgot_password_invalid_email(self):
        response = self.client.post(
            "/auth/forgot-password/",
            {"email": "not-an-email"},
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertEqual(response.data.get("error"), "Invalid email address.")

    def test_reset_password_success(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        response = self.client.post(
            "/auth/reset-password/",
            {"uid": uid, "token": token, "password": "new_password_123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data.get("message"), "Password reset successful.")

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new_password_123!"))

    def test_reset_password_invalid_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        response = self.client.post(
            "/auth/reset-password/",
            {"uid": uid, "token": "bad-token", "password": "new_password_123!"},
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertEqual(response.data.get("error"), "Invalid or expired reset link.")

    def test_reset_password_invalid_uid(self):
        response = self.client.post(
            "/auth/reset-password/",
            {"uid": "invalid", "token": "whatever", "password": "new_password_123!"},
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertEqual(response.data.get("error"), "Invalid or expired reset link.")

    def test_reset_password_missing_fields(self):
        response = self.client.post(
            "/auth/reset-password/",
            {"uid": "abc"},
            format="json",
        )

        self.assertEqual(
            response.status_code, status.HTTP_400_BAD_REQUEST, response.data
        )
        self.assertEqual(
            response.data.get("error"),
            "uid, token, and password are required.",
        )
