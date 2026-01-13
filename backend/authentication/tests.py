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
