"""Signing keys, cookie policy and production configuration."""

import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from .helpers import (
    SETTINGS_PROBE,
)


class ProductionSecretContractTests(SimpleTestCase):
    def settings_values(self, secret):
        import os
        import runpy
        from pathlib import Path

        environment = {
            "DJANGO_DEBUG": "0",
            "DJANGO_ALLOWED_HOSTS": "app.example.com",
        }
        if secret is not None:
            environment["DJANGO_SECRET_KEY"] = secret
        with (
            patch.dict(os.environ, environment, clear=True),
            patch("dotenv.load_dotenv"),
        ):
            return runpy.run_path(
                str(Path(__file__).resolve().parents[1] / "settings.py")
            )

    def test_production_rejects_missing_empty_and_whitespace_secrets(self):

        for secret in (None, "", "   "):
            with self.subTest(secret=secret):
                with self.assertRaisesMessage(
                    ImproperlyConfigured, "DJANGO_SECRET_KEY is required"
                ):
                    self.settings_values(secret)

    def test_production_accepts_an_explicit_secret(self):
        value = "isolated-production-settings-contract-key"
        settings = self.settings_values(value)
        self.assertEqual(settings["SECRET_KEY"], value)
        self.assertFalse(settings["DEBUG"])


class ProductionSettingsTests(SimpleTestCase):
    def probe_settings(self, *, debug="0", secret="test-only-key-for-settings-probe"):
        env = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "config.settings",
            "DJANGO_DEBUG": debug,
            "DJANGO_TESTING": "1",
        }
        if secret is None:
            env.pop("DJANGO_SECRET_KEY", None)
        else:
            env["DJANGO_SECRET_KEY"] = secret
        return subprocess.run(
            [sys.executable, "-c", SETTINGS_PROBE],
            cwd=Path(__file__).resolve().parents[2],
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )

    def test_normal_settings_ignore_all_test_detection_signals(self):
        result = self.probe_settings()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["algorithm"], "pbkdf2_sha256")

    def test_production_requires_a_nonblank_secret(self):
        for secret in (None, "", "   "):
            with self.subTest(secret=secret):
                result = self.probe_settings(secret=secret)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("DJANGO_SECRET_KEY is required", result.stderr)

    def test_development_generates_a_secret_without_weakening_hashing(self):
        result = self.probe_settings(debug="1", secret=None)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertGreaterEqual(data["key_length"], 50)
        self.assertEqual(data["algorithm"], "pbkdf2_sha256")
