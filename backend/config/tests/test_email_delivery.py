"""Mocked Resend transport and standard Anymail behavior."""

import json
from unittest.mock import patch

import requests
from anymail.exceptions import AnymailConfigurationError, AnymailError
from django.core.mail import EmailMultiAlternatives, get_connection
from django.test import SimpleTestCase, override_settings

from .helpers import (
    API_KEY,
    BACKEND,
    OPTIONS,
    api_response,
)


@override_settings(EMAIL_BACKEND=BACKEND, ANYMAIL=OPTIONS)
class EmailDeliveryTests(SimpleTestCase):
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
