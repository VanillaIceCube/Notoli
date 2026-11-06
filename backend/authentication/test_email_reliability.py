from io import BytesIO
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from django.contrib.auth import get_user_model
from django.core.mail import EmailMessage, get_connection
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

PRIVATE = "recipient@example.test reset?token=private-token sk-private-key private-body"


def accepted_response():
    response = MagicMock()
    response.__enter__.return_value = response
    response.getcode.return_value = 200
    return response


@override_settings(
    EMAIL_BACKEND="authentication.email_backends.ResendApiEmailBackend",
    EMAIL_HOST_PASSWORD="sk-private-key",
    EMAIL_TIMEOUT=7,
)
class EmailReliabilityTests(SimpleTestCase):
    def message(self):
        return EmailMessage(
            "private-subject",
            PRIVATE,
            "sender@example.test",
            ["recipient@example.test"],
        )

    def assert_safe_logs(self, records):
        for record in records:
            self.assertIsNone(record.exc_info)
            text = record.getMessage()
            for secret in [
                PRIVATE,
                "private-token",
                "sk-private-key",
                "private-body",
                "recipient@example.test",
                "private-subject",
            ]:
                self.assertNotIn(secret, text)

    @patch("authentication.email_backends.request.urlopen")
    def test_success_and_empty_batch(self, urlopen):
        urlopen.return_value = accepted_response()
        self.assertEqual(get_connection().send_messages([]), 0)
        urlopen.assert_not_called()
        self.assertEqual(get_connection().send_messages([self.message()]), 1)
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 7)
        urlopen.assert_called_once()

    @patch("authentication.email_backends.request.urlopen")
    def test_missing_credentials_both_silent_modes_are_observable(self, urlopen):
        for silent in [True, False]:
            with (
                self.subTest(silent=silent),
                override_settings(EMAIL_HOST_PASSWORD=""),
                self.assertLogs("authentication.email_backends", level="ERROR") as logs,
            ):
                connection = get_connection(fail_silently=silent)
                if silent:
                    self.assertEqual(connection.send_messages([self.message()]), 0)
                else:
                    with self.assertRaisesRegex(ValueError, "DJANGO_EMAIL_HOST_KEY"):
                        connection.send_messages([self.message()])
            self.assertEqual(logs.records[0].delivery_category, "configuration")
            self.assert_safe_logs(logs.records)
        urlopen.assert_not_called()

    @patch("authentication.email_backends.request.urlopen")
    def test_provider_network_timeout_and_unexpected_failures_preserve_original_exception(
        self, urlopen
    ):
        factories = [
            (
                lambda code=code: HTTPError(
                    "https://api.resend.com/emails",
                    code,
                    PRIVATE,
                    {},
                    BytesIO(PRIVATE.encode()),
                ),
                "rate_limit"
                if code == 429
                else "provider"
                if code >= 500
                else "request",
                code,
            )
            for code in [400, 401, 403, 422, 429, 500, 503]
        ] + [
            (lambda: TimeoutError(PRIVATE), "timeout", None),
            (lambda: URLError(TimeoutError(PRIVATE)), "timeout", None),
            (lambda: URLError(PRIVATE), "network", None),
            (lambda: OSError(PRIVATE), "network", None),
            (lambda: ValueError(PRIVATE), "unexpected", None),
        ]
        for factory, category, code in factories:
            for silent in [True, False]:
                with self.subTest(category=category, code=code, silent=silent):
                    exc = factory()
                    urlopen.reset_mock()
                    urlopen.side_effect = exc
                    with self.assertLogs(
                        "authentication.email_backends", level="ERROR"
                    ) as logs:
                        if silent:
                            self.assertEqual(
                                get_connection(fail_silently=True).send_messages(
                                    [self.message()]
                                ),
                                0,
                            )
                        else:
                            with self.assertRaises(type(exc)) as raised:
                                get_connection(fail_silently=False).send_messages(
                                    [self.message()]
                                )
                            self.assertIs(raised.exception, exc)
                    urlopen.assert_called_once()  # No blind retry of an ambiguously accepted send.
                    self.assertEqual(logs.records[0].delivery_category, category)
                    self.assertEqual(logs.records[0].delivery_status, code)
                    self.assert_safe_logs(logs.records)

    @patch("authentication.email_backends.request.urlopen")
    def test_nonfinite_unbounded_and_invalid_timeouts_use_documented_finite_default(
        self, urlopen
    ):
        urlopen.return_value = accepted_response()
        for value in [
            None,
            0,
            -1,
            float("inf"),
            float("nan"),
            True,
            "private-token",
            31,
            10**1000,
        ]:
            with (
                self.subTest(timeout=value),
                override_settings(EMAIL_TIMEOUT=value),
                self.assertLogs(
                    "authentication.email_backends", level="WARNING"
                ) as logs,
            ):
                self.assertEqual(get_connection().send_messages([self.message()]), 1)
            self.assertEqual(urlopen.call_args.kwargs["timeout"], 10)
            self.assert_safe_logs(logs.records)

    @patch("authentication.email_backends.request.urlopen")
    def test_returned_non_2xx_does_not_read_provider_body(self, urlopen):
        response = accepted_response()
        response.getcode.return_value = 503
        response.read.side_effect = AssertionError("Provider body must not be read")
        urlopen.return_value = response
        with self.assertLogs("authentication.email_backends", level="ERROR") as logs:
            self.assertEqual(
                get_connection(fail_silently=True).send_messages([self.message()]), 0
            )
        response.read.assert_not_called()
        self.assertEqual(logs.records[0].delivery_category, "provider")
        self.assert_safe_logs(logs.records)

    @patch("authentication.email_backends.request.urlopen")
    def test_partial_batch_count_and_stop_policy(self, urlopen):
        for silent in [True, False]:
            urlopen.reset_mock()
            urlopen.side_effect = [URLError(PRIVATE), accepted_response()]
            with self.assertLogs("authentication.email_backends", level="ERROR"):
                if silent:
                    self.assertEqual(
                        get_connection(fail_silently=True).send_messages(
                            [self.message(), self.message()]
                        ),
                        1,
                    )
                    self.assertEqual(urlopen.call_count, 2)
                else:
                    with self.assertRaises(URLError):
                        get_connection(fail_silently=False).send_messages(
                            [self.message(), self.message()]
                        )
                    self.assertEqual(urlopen.call_count, 1)


@override_settings(
    EMAIL_BACKEND="authentication.email_backends.ResendApiEmailBackend",
    EMAIL_HOST_PASSWORD="sk-private-key",
)
class PasswordResetFailurePrivacyTests(APITestCase):
    def setUp(self):
        get_user_model().objects.create_user(
            username="fixture",
            email="fixture@example.test",
            password="fixture-password-123",
        )

    @patch("authentication.email_backends.request.urlopen")
    def test_real_reset_caller_keeps_failure_and_unknown_account_responses_equal(
        self, urlopen
    ):
        for exc in [
            HTTPError("https://api.resend.com/emails", 429, PRIVATE, {}, None),
            TimeoutError(PRIVATE),
            URLError(PRIVATE),
        ]:
            with self.subTest(error=type(exc).__name__):
                urlopen.reset_mock()
                urlopen.side_effect = exc
                with self.assertLogs("authentication", level="ERROR") as logs:
                    known = self.client.post(
                        "/auth/forgot-password/",
                        {"email": "fixture@example.test"},
                        format="json",
                    )
                unknown = self.client.post(
                    "/auth/forgot-password/",
                    {"email": "missing@example.test"},
                    format="json",
                )
                self.assertEqual(known.status_code, 200)
                self.assertEqual(known.data, unknown.data)
                urlopen.assert_called_once()
                for record in logs.records:
                    self.assertIsNone(record.exc_info)
                    for private in [
                        "private-token",
                        "sk-private-key",
                        "recipient@example.test",
                        "fixture@example.test",
                        "user_id",
                        "private-body",
                    ]:
                        self.assertNotIn(private, record.getMessage())
