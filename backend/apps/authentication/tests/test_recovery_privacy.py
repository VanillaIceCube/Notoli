"""Provider failures never disclose account or email details."""

import json
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

import requests
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from .helpers import PRIVATE


@override_settings(
    EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
    ANYMAIL={
        "RESEND_API_KEY": "test-only-private-api-key",
        "REQUESTS_TIMEOUT": 7,
        "DEBUG_API_REQUESTS": False,
    },
)
class PasswordResetFailurePrivacyTests(APITestCase):
    def setUp(self):
        get_user_model().objects.create_user(
            username="fixture",
            email="fixture@example.test",
            password="fixture-password-123",
        )

    @patch("requests.sessions.Session.request", autospec=True)
    def test_real_reset_caller_keeps_provider_failures_and_unknown_account_responses_equal(
        self, request
    ):
        responses = []
        for provider_status in [401, 422, 429, 500, 503]:
            response = requests.Response()
            response.status_code = provider_status
            response.reason = "private-token"
            response.headers["Content-Type"] = "application/json"
            response._content = json.dumps({"message": PRIVATE}).encode()
            responses.append(response)
        failures = responses + [
            requests.Timeout(PRIVATE),
            requests.ConnectionError(PRIVATE),
        ]
        for failure in failures:
            with self.subTest(
                error=type(failure).__name__,
                status=getattr(failure, "status_code", None),
            ):
                request.reset_mock()
                request.side_effect = (
                    failure if isinstance(failure, Exception) else None
                )
                request.return_value = (
                    failure if not isinstance(failure, Exception) else None
                )
                output = StringIO()
                with redirect_stdout(output), self.assertLogs(level="ERROR") as logs:
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
                request.assert_called_once()
                self.assertEqual(request.call_args.kwargs["timeout"], 7)
                for record in logs.records:
                    self.assertIsNone(record.exc_info)
                    for private in [
                        "private-token",
                        "test-only-private-api-key",
                        "recipient@example.test",
                        "fixture@example.test",
                        "user_id",
                        "private-body",
                    ]:
                        self.assertNotIn(private, record.getMessage())
                        self.assertNotIn(private, output.getvalue())

    @override_settings(ANYMAIL={"REQUESTS_TIMEOUT": 10, "DEBUG_API_REQUESTS": False})
    @patch("requests.sessions.Session.request", autospec=True)
    def test_missing_key_is_generic_without_attempting_provider_http(self, request):
        with self.assertLogs("apps.authentication", level="ERROR") as logs:
            known = self.client.post(
                "/auth/forgot-password/",
                {"email": "fixture@example.test"},
                format="json",
            )
        unknown = self.client.post(
            "/auth/forgot-password/", {"email": "missing@example.test"}, format="json"
        )
        self.assertEqual(known.status_code, 200)
        self.assertEqual(known.data, unknown.data)
        request.assert_not_called()
        self.assertTrue(all(record.exc_info is None for record in logs.records))
