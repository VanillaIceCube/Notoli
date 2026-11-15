"""Project integration with Anymail's maintained Resend backend; no live sends."""

import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import requests
from anymail.exceptions import AnymailConfigurationError, AnymailError
from django.core.mail import EmailMultiAlternatives, get_connection
from django.test import SimpleTestCase, override_settings

BACKEND = "anymail.backends.resend.EmailBackend"
API_KEY = "test-only-resend-api-key"
OPTIONS = {
    "RESEND_API_KEY": API_KEY,
    "REQUESTS_TIMEOUT": 7,
    "DEBUG_API_REQUESTS": False,
}


def api_response(status=200):
    response = requests.Response()
    response.status_code = status
    response.reason = "synthetic provider response"
    response.url = "https://api.resend.com/emails"
    response.headers["Content-Type"] = "application/json"
    response._content = json.dumps({"id": "synthetic-message-id"}).encode()
    return response


@override_settings(EMAIL_BACKEND=BACKEND, ANYMAIL=OPTIONS)
class ResendEmailIntegrationTests(SimpleTestCase):
    def message(self):
        message = EmailMultiAlternatives(
            "Reset your Notoli password",
            "Use this link.",
            "Notoli <sender@example.test>",
            ["recipient@example.test"],
            cc=["cc@example.test"],
            bcc=["bcc@example.test"],
            reply_to=["reply@example.test"],
        )
        message.attach_alternative("<p>Use this link.</p>", "text/html")
        return message

    @patch("requests.sessions.Session.request", autospec=True)
    def test_django_message_uses_the_maintained_backend_and_configured_transport(
        self, request
    ):
        request.return_value = api_response()
        connection = get_connection()
        self.assertEqual(type(connection).__module__, "anymail.backends.resend")
        self.assertFalse(connection.debug_api_requests)
        self.assertEqual(connection.send_messages([self.message()]), 1)
        request.assert_called_once()
        params = request.call_args.kwargs
        self.assertEqual(params["url"], "https://api.resend.com/emails")
        self.assertEqual(params["method"], "POST")
        self.assertEqual(params["headers"]["Authorization"], f"Bearer {API_KEY}")
        self.assertEqual(params["timeout"], 7)
        payload = json.loads(params["data"])
        self.assertEqual(payload["to"], ["recipient@example.test"])
        self.assertEqual(payload["cc"], ["cc@example.test"])
        self.assertEqual(payload["bcc"], ["bcc@example.test"])
        self.assertEqual(payload["reply_to"], ["reply@example.test"])
        self.assertEqual(payload["subject"], "Reset your Notoli password")
        self.assertEqual(payload["text"], "Use this link.")
        self.assertEqual(payload["html"], "<p>Use this link.</p>")
        session = request.call_args.args[0]
        self.assertEqual(session.adapters["https://"].max_retries.total, 0)
        self.assertEqual(session.hooks["response"], [])

    @patch("requests.sessions.Session.request", autospec=True)
    def test_operational_failures_honor_silent_mode_without_retries(self, request):
        for error in [
            api_response(429),
            api_response(503),
            requests.Timeout("private-token"),
            requests.ConnectionError("private-token"),
        ]:
            for silent in [False, True]:
                with self.subTest(error=type(error).__name__, silent=silent):
                    request.reset_mock()
                    request.side_effect = (
                        error if isinstance(error, Exception) else None
                    )
                    request.return_value = (
                        error if not isinstance(error, Exception) else None
                    )
                    connection = get_connection(fail_silently=silent)
                    if silent:
                        self.assertEqual(connection.send_messages([self.message()]), 0)
                    else:
                        with self.assertRaises(AnymailError):
                            connection.send_messages([self.message()])
                    request.assert_called_once()

    @patch("requests.sessions.Session.request", autospec=True)
    def test_empty_batch_and_partial_batch_counts(self, request):
        connection = get_connection(fail_silently=True)
        self.assertEqual(connection.send_messages([]), 0)
        request.assert_not_called()
        request.side_effect = [api_response(503), api_response()]
        self.assertEqual(connection.send_messages([self.message(), self.message()]), 1)
        self.assertEqual(request.call_count, 2)

    @override_settings(ANYMAIL={"REQUESTS_TIMEOUT": 10, "DEBUG_API_REQUESTS": False})
    @patch("requests.sessions.Session.request", autospec=True)
    def test_missing_key_is_a_configuration_error_before_http(self, request):
        for silent in [False, True]:
            with (
                self.subTest(silent=silent),
                self.assertRaises(AnymailConfigurationError),
            ):
                get_connection(fail_silently=silent)
        request.assert_not_called()


SETTINGS_PROBE = """
import json
import os
from unittest.mock import patch

with patch('dotenv.load_dotenv', return_value=False):
    from django.conf import settings
    print(json.dumps({
        'backend': settings.EMAIL_BACKEND,
        'timeout': settings.ANYMAIL['REQUESTS_TIMEOUT'],
        'debug': settings.ANYMAIL['DEBUG_API_REQUESTS'],
        'key_present': 'RESEND_API_KEY' in settings.ANYMAIL,
        'key_preserved': settings.ANYMAIL.get('RESEND_API_KEY') == os.getenv('DJANGO_EMAIL_HOST_KEY'),
    }))
"""


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
            [sys.executable, "-c", SETTINGS_PROBE],
            cwd=Path(__file__).resolve().parents[1],
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
