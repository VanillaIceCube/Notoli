import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from django.conf import global_settings, settings
from django.contrib.auth.hashers import check_password, get_hasher, make_password
from django.test import SimpleTestCase, override_settings
from django.test.runner import DiscoverRunner

from app.test_runner import FastPasswordTestRunner

SETTINGS_PROBE = """
import json
import sys
import types
from unittest.mock import patch

sys.argv = ['manage.py', 'test']
sys.modules['pytest'] = types.ModuleType('pytest')
with patch('dotenv.load_dotenv', return_value=False):
    from django.conf import settings
    from django.contrib.auth.hashers import get_hasher
    print(json.dumps({
        'algorithm': get_hasher().algorithm,
        'key_length': len(settings.SECRET_KEY),
    }))
"""


class SettingsRegressionTestCase(SimpleTestCase):
    def probe_settings(self, *, debug="0", secret="test-only-key-for-settings-probe"):
        env = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "app.settings",
            "DJANGO_DEBUG": debug,
            "DJANGO_TESTING": "1",
        }
        if secret is None:
            env.pop("DJANGO_SECRET_KEY", None)
        else:
            env["DJANGO_SECRET_KEY"] = secret
        return subprocess.run(
            [sys.executable, "-c", SETTINGS_PROBE],
            cwd=Path(__file__).resolve().parent.parent,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )

    def test_fast_passwords_work_during_test_execution(self):
        encoded = make_password("test-password")
        self.assertEqual(get_hasher().algorithm, "md5")
        self.assertTrue(check_password("test-password", encoded))
        self.assertFalse(check_password("wrong-password", encoded))

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

    @override_settings(PASSWORD_HASHERS=global_settings.PASSWORD_HASHERS)
    def test_runner_restores_hashers_on_success_and_failure(self):
        def run_tests(*args, **kwargs):
            self.assertEqual(get_hasher().algorithm, "md5")
            if fail:
                raise RuntimeError("test run failed")
            return 0

        for fail in (False, True):
            with self.subTest(fail=fail):
                with patch.object(DiscoverRunner, "run_tests", side_effect=run_tests):
                    runner = FastPasswordTestRunner(verbosity=0)
                    if fail:
                        with self.assertRaisesMessage(RuntimeError, "test run failed"):
                            runner.run_tests([])
                    else:
                        self.assertEqual(runner.run_tests([]), 0)
                self.assertEqual(
                    settings.PASSWORD_HASHERS, global_settings.PASSWORD_HASHERS
                )
                self.assertEqual(get_hasher().algorithm, "pbkdf2_sha256")
