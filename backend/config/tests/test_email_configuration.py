"""Project email selection, credentials and bounded timeouts."""

import json
import os
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase

from .helpers import (
    BACKEND,
    EMAIL_SETTINGS_PROBE,
)


class EmailConfigurationTests(SimpleTestCase):
    def probe(self, **values):
        env = {
            key: value
            for key, value in os.environ.items()
            if key.upper()
            in {
                "PATH",
                "SYSTEMROOT",
                "WINDIR",
                "COMSPEC",
                "TEMP",
                "TMP",
                "APPDATA",
                "LOCALAPPDATA",
            }
        }
        env.update(
            DJANGO_SETTINGS_MODULE="config.settings",
            DJANGO_DEBUG="1",
            DJANGO_SECRET_KEY="disposable-settings-test",
            PYTHONUTF8="1",
        )
        env.update(values)
        return subprocess.run(
            [sys.executable, "-c", EMAIL_SETTINGS_PROBE],
            cwd=Path(__file__).resolve().parents[2],
            env=env,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )

    def result(self, **values):
        result = self.probe(**values)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_console_smtp_and_custom_selection_remain_explicit(self):
        self.assertEqual(
            self.result()["backend"], "django.core.mail.backends.console.EmailBackend"
        )
        for backend in [
            "django.core.mail.backends.smtp.EmailBackend",
            "django.core.mail.backends.console.EmailBackend",
            "project.delivery.CustomBackend",
            BACKEND,
        ]:
            with self.subTest(backend=backend):
                self.assertEqual(
                    self.result(DJANGO_EMAIL_BACKEND=backend)["backend"], backend
                )
        for legacy in [
            "authentication.email_backends.ResendApiEmailBackend",
            "apps.authentication.email_backends.ResendApiEmailBackend",
            "apps.email.backends.ResendApiEmailBackend",
        ]:
            with self.subTest(legacy=legacy):
                self.assertEqual(
                    self.result(DJANGO_EMAIL_BACKEND=legacy)["backend"], BACKEND
                )

    def test_existing_key_variable_maps_only_nonblank_values_without_debug_output(self):
        for key in ["", "   ", "test-only-key", "  test-only-key  "]:
            with self.subTest(blank=not bool(key.strip())):
                actual = self.result(DJANGO_EMAIL_HOST_KEY=key)
                self.assertEqual(actual["key_present"], bool(key.strip()))
                if key.strip():
                    self.assertTrue(actual["key_preserved"])
                self.assertFalse(actual["debug"])

    def test_request_timeout_is_bounded_and_malformed_startup_values_still_fail(self):
        self.assertEqual(self.result()["timeout"], 10)
        for value, expected in [
            ("0", 10),
            ("-1", 10),
            ("31", 10),
            ("1", 1),
            ("30", 30),
            ("7", 7),
        ]:
            with self.subTest(value=value):
                self.assertEqual(
                    self.result(DJANGO_EMAIL_TIMEOUT=value)["timeout"], expected
                )
        for value in ["bad", "nan", "inf"]:
            with self.subTest(value=value):
                result = self.probe(DJANGO_EMAIL_TIMEOUT=value)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("ValueError", result.stderr)
