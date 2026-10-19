import os
import sys
from importlib import reload
from unittest.mock import patch

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
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

    def test_missing_secret_key_in_non_test_mode_raises_improperly_configured(self):
        """Ensure backend/app/settings.py raises ImproperlyConfigured in non-test mode when DJANGO_SECRET_KEY is missing, even if DJANGO_DEBUG is unset or true."""
        env_without_secret = {
            k: v for k, v in os.environ.items() if k != "DJANGO_SECRET_KEY"
        }
        env_without_secret["DJANGO_TESTING"] = "0"

        # Mock sys.argv to simulate non-test entry point
        with (
            patch.dict(os.environ, env_without_secret, clear=True),
            patch.object(sys, "argv", ["gunicorn"]),
        ):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                import app.settings

                reload(app.settings)
            self.assertIn("DJANGO_SECRET_KEY", str(ctx.exception))

        # Reload settings back to test state
        import app.settings

        reload(app.settings)
