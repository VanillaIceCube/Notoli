from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class RegisterViewTests(APITestCase):
    def test_register_requires_username_and_password(self):
        url = reverse("register")

        response = self.client.post(url, {})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, {"error": "Username and password required."})

    def test_register_rejects_duplicate_username(self):
        User.objects.create_user(username="existing", password="pass1234")
        url = reverse("register")

        response = self.client.post(
            url,
            {"username": "existing", "password": "new-password"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, {"error": "Username already exists."})

    def test_register_creates_user(self):
        url = reverse("register")

        response = self.client.post(
            url,
            {"username": "new-user", "password": "password123"},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data, {"message": "User created successfully."})
        self.assertTrue(User.objects.filter(username="new-user").exists())
