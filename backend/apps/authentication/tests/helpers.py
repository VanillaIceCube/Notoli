from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

User = get_user_model()


PRIVATE = "recipient@example.test reset?token=private-token sk-private-key private-body"


class PasswordResetFixtures:
    def setUp(self):
        self.user = User.objects.create_user(
            username="reset_user",
            email="reset_user@example.com",
            password="old_password_123",
        )


class CredentialFixtures:
    def setUp(self):
        self.password = "Original-Contract-Password-73!"
        self.user = User.objects.create_user(
            username="contract", email="contract@example.com", password=self.password
        )

    def reset_payload(self):
        return {
            "uid": urlsafe_base64_encode(force_bytes(self.user.pk)),
            "token": default_token_generator.make_token(self.user),
            "password": "Updated-Contract-Password-89!",
        }
