from django.conf import settings
from django.test import SimpleTestCase


class SettingsRegressionTestCase(SimpleTestCase):
    def test_secret_key_length(self):
        """Ensure SECRET_KEY is at least 32 characters long to avoid SimpleJWT InsecureKeyLengthWarning."""
        self.assertGreaterEqual(len(settings.SECRET_KEY), 32)

    def test_password_hashers_configured_for_testing(self):
        """Ensure fast MD5PasswordHasher is used during testing for test speed."""
        self.assertTrue(settings.IS_TESTING)
        self.assertEqual(
            settings.PASSWORD_HASHERS[0],
            "django.contrib.auth.hashers.MD5PasswordHasher",
        )

    def test_static_root_exists_during_testing(self):
        """Ensure STATIC_ROOT directory exists during testing to avoid WhiteNoise startup warnings."""
        self.assertTrue(settings.STATIC_ROOT.exists())
