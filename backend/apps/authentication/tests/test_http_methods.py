"""Authentication endpoints reject unsupported HTTP methods."""

from rest_framework import status
from rest_framework.test import APITestCase


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
