import json
import logging
import math
from urllib import error, request

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.message import EmailMultiAlternatives

logger = logging.getLogger(__name__)


class ResendApiEmailBackend(BaseEmailBackend):
    api_url = "https://api.resend.com/emails"
    user_agent = "Notoli/1.0 (+https://notoli.judeandrewalaba.com)"

    def send_messages(self, email_messages):
        if not email_messages:
            return 0

        api_key = settings.EMAIL_HOST_PASSWORD
        if not api_key:
            self._log_failure("configuration", None)
            if self.fail_silently:
                return 0
            raise ValueError("DJANGO_EMAIL_HOST_KEY is required for Resend API email.")

        sent_count = 0
        for message in email_messages:
            try:
                self._send_message(message, api_key)
            except Exception as exc:
                if isinstance(exc, error.HTTPError):
                    code = (
                        exc.code
                        if isinstance(exc.code, int) and 100 <= exc.code <= 599
                        else None
                    )
                    category = (
                        "rate_limit"
                        if code == 429
                        else "provider"
                        if code is not None and code >= 500
                        else "request"
                    )
                elif isinstance(exc, TimeoutError) or (
                    isinstance(exc, error.URLError)
                    and isinstance(exc.reason, TimeoutError)
                ):
                    code, category = None, "timeout"
                elif isinstance(exc, (error.URLError, OSError)):
                    code, category = None, "network"
                else:
                    code, category = None, "unexpected"
                self._log_failure(category, code)
                if not self.fail_silently:
                    raise
            else:
                sent_count += 1
        return sent_count

    def _send_message(self, message, api_key):
        payload = {
            "from": message.from_email or settings.DEFAULT_FROM_EMAIL,
            "to": message.to,
            "subject": message.subject,
            "text": message.body,
        }
        if message.cc:
            payload["cc"] = message.cc
        if message.bcc:
            payload["bcc"] = message.bcc

        html_body = self._get_html_body(message)
        if html_body:
            payload["html"] = html_body

        http_request = request.Request(
            self.api_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": self.user_agent,
            },
            method="POST",
        )
        timeout = getattr(settings, "EMAIL_TIMEOUT", None)
        if (
            isinstance(timeout, bool)
            or not isinstance(timeout, (int, float))
            or not 0 < timeout <= 30
            or not math.isfinite(timeout)
        ):
            logger.warning(
                "Resend email timeout is invalid; using the 10-second default."
            )
            timeout = 10
        with request.urlopen(http_request, timeout=timeout) as response:
            status = response.getcode()
            if 200 <= status < 300:
                return
            # Do not read or copy an untrusted provider body into an exception.
            raise error.HTTPError(
                self.api_url,
                status,
                "Email provider rejected the request.",
                response.headers,
                None,
            )

    @staticmethod
    def _log_failure(category, status):
        # Never log exception repr/traceback, provider body, recipients or tokens.
        logger.error(
            "Resend API email delivery failed category=%s status=%s",
            category,
            status if status is not None else "unknown",
            extra={
                "delivery_provider": "resend",
                "delivery_category": category,
                "delivery_status": status,
            },
        )

    def _get_html_body(self, message):
        if not isinstance(message, EmailMultiAlternatives):
            return None

        for content, mimetype in message.alternatives:
            if mimetype == "text/html":
                return content

        return None
