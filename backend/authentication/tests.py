from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase


class RegistrationTests(APITestCase):
    def test_register_success(self):
        response = self.client.post(
            "/auth/register/",
            {"username": "test_username", "password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"Unexpected response: {response.data}",
        )

        self.assertTrue(
            User.objects.filter(username="test_username").exists(),
            "User was not created in the database",
        )

        self.assertEqual(
            response.data.get("message"),
            "User created successfully.",
            f"Unexpected response body: {response.data}",
        )

    def test_register_missing_username(self):
        response = self.client.post(
            "/auth/register/",
            {"password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for missing username, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("error"),
            "Username and password required.",
            f"Unexpected error body for missing username: {response.data}",
        )

    def test_register_missing_password(self):
        response = self.client.post(
            "/auth/register/",
            {"username": "test_username"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for missing password, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("error"),
            "Username and password required.",
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
            "Username and password required.",
            f"Unexpected error body for empty payload: {response.data}",
        )

    def test_register_non_json_request(self):
        response = self.client.post(
            "/auth/register/",
            "username=test_username&password=test_password",
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
        User.objects.create_user(username="dup_user", password="password123")

        response = self.client.post(
            "/auth/register/",
            {"username": "dup_user", "password": "another_password"},
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

class LoginTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="test_username", password="test_password"
        )

    def test_login_success(self):
        response = self.client.post(
            "/auth/login/",
            {"username": "test_username", "password": "test_password"},
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

    def test_login_invalid_password(self):
        response = self.client.post(
            "/auth/login/",
            {"username": "test_username", "password": "wrong_password"},
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

    def test_login_missing_username(self):
        response = self.client.post(
            "/auth/login/",
            {"password": "test_password"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            f"Expected 400 for missing username, got {response.status_code}: {response.data}",
        )
        self.assertEqual(
            response.data.get("username"),
            ["This field is required."],
            f"Unexpected error body for missing username: {response.data}",
        )

    def test_login_missing_password(self):
        response = self.client.post(
            "/auth/login/",
            {"username": "test_username"},
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

    def test_login_inactive_user(self):
        self.user.is_active = False
        self.user.save()

        response = self.client.post(
            "/auth/login/",
            {"username": "test_username", "password": "test_password"},
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
