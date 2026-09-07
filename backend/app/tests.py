from django.conf import settings
from django.test import SimpleTestCase


class SettingsTests(SimpleTestCase):
    def test_secret_key_length_is_at_least_32_bytes(self):
        self.assertGreaterEqual(
            len(settings.SECRET_KEY.encode("utf-8")),
            32,
            "SECRET_KEY must be at least 32 bytes to satisfy HMAC SHA256 security constraints.",
        )

    def test_test_password_hasher_is_md5_in_test_environment(self):
        self.assertIn(
            "django.contrib.auth.hashers.MD5PasswordHasher",
            settings.PASSWORD_HASHERS,
            "MD5PasswordHasher should be configured during tests to accelerate test suite execution.",
        )

    def test_staticfiles_directory_exists(self):
        self.assertTrue(
            settings.STATIC_ROOT.exists(),
            "STATIC_ROOT directory should exist to prevent WhiteNoise warnings.",
        )
