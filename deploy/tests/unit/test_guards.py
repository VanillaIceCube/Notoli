"""Boundary and transient-failure regressions for app-independent releases."""

import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import urllib.error

from deploy.production import release


class ReleaseMessagesTests(unittest.TestCase):
    def test_failed_commands_report_exit_code_without_output_or_arguments(self):
        result = subprocess.CompletedProcess(
            ["docker"], 17, stdout="private stdout", stderr="private stderr"
        )
        with (
            patch.object(release.subprocess, "run", return_value=result),
            self.assertRaises(release.ReleaseError) as failure,
        ):
            release.run(["docker", "private argument"])
        self.assertIn("docker (exit 17;", str(failure.exception))
        for secret in ("private stdout", "private stderr", "private argument"):
            self.assertNotIn(secret, str(failure.exception))

    def test_failure_names_step_without_exposing_private_values(self):
        for error in (ValueError("private value"), KeyError("private key")):
            with (
                self.subTest(error=type(error).__name__),
                patch.object(release, "CURRENT_STEP", "Applying database migrations"),
                patch.object(release.sys, "stderr", new_callable=io.StringIO) as log,
            ):
                release.report_failure(error)
                message = log.getvalue()
            self.assertIn(
                "Release failed during: Applying database migrations", message
            )
            self.assertIn(type(error).__name__, message)
            self.assertNotIn(str(error), message)


class ReadinessTests(unittest.TestCase):
    def test_timeout_names_backend_or_public_probe_without_response_details(self):
        for backend_fails, expected in (
            (True, "direct backend API"),
            (False, "public routes"),
        ):
            with (
                self.subTest(probe=expected),
                patch.object(
                    release,
                    "compose",
                    side_effect=(
                        release.ReleaseError("private backend output")
                        if backend_fails
                        else None
                    ),
                ),
                patch.object(
                    release,
                    "check_response",
                    side_effect=ValueError("private response"),
                ),
                patch.object(release.time, "monotonic", side_effect=[0, 91]),
                self.assertRaises(release.ReleaseError) as failure,
            ):
                release.readiness(Path("fixture"))
            self.assertIn(expected, str(failure.exception))
            self.assertNotIn("private", str(failure.exception))

    def test_public_client_identity_preserves_response_validation(self):
        def edge(request, timeout):
            self.assertEqual(request.get_header("User-agent"), "JudeAppRelease/1.0")
            self.assertEqual(request.get_header("Cache-control"), "no-cache")
            self.assertEqual(timeout, 5)
            raise urllib.error.HTTPError(
                request.full_url,
                status,
                "fixture",
                {"Content-Type": "application/json"},
                io.BytesIO(b'{"detail":"Authentication required"}'),
            )

        with patch.object(release.urllib.request, "urlopen", side_effect=edge):
            status = 401
            release.check_response("/fixture/", 401, lambda headers, body: True)
            with self.assertRaises(release.ReleaseError):
                release.check_response("/fixture/", 401, lambda headers, body: False)
            status = 403
            with self.assertRaises(release.ReleaseError):
                release.check_response("/fixture/", 401, lambda headers, body: True)

    def test_direct_500_retries_then_401_succeeds(self):
        probes = []

        def compose(directory, *args, **kwargs):
            status = 500 if not probes else 401
            probes.append(status)
            error = urllib.error.HTTPError(
                "http://fixture/", status, "fixture", {}, None
            )
            with patch.object(release.urllib.request, "urlopen", side_effect=error):
                try:
                    # Execute the exact child probe. Docker translates child exit != 0
                    # into ReleaseError; child exceptions do not escape the process.
                    exec(args[-1], {})
                except SystemExit as result:
                    if result.code:
                        raise release.ReleaseError("Command failed: docker") from None

        with (
            patch.object(release, "compose", side_effect=compose),
            patch.object(release, "check_response") as public,
            patch.object(release.time, "sleep") as sleep,
        ):
            release.readiness(Path("fixture"))
        self.assertEqual(probes, [500, 401])
        sleep.assert_called_once_with(2)
        self.assertEqual(public.call_count, len(release.CONFIG["readiness"]["public"]))


class CandidatePortTests(unittest.TestCase):
    def test_candidate_compose_uses_its_own_policy(self):
        ipv4 = {
            "target": 80,
            "published": "3000",
            "host_ip": "0.0.0.0",
            "protocol": "tcp",
        }
        ipv6 = {**ipv4, "host_ip": "::"}
        services = {release.BACKEND: {}, release.FRONTEND: {}}
        with (
            patch.dict(release.CONFIG, {"frontend_port_bindings": [[]]}),
            patch.object(
                release,
                "compose",
                side_effect=lambda *args: json.dumps({"services": services}),
            ),
        ):
            release.validate_candidate_ports(Path("candidate"))
            for bindings in ([ipv4], [ipv6], [ipv4, ipv6]):
                services[release.FRONTEND]["ports"] = bindings
                with (
                    self.subTest(bindings=bindings),
                    self.assertRaisesRegex(
                        release.ReleaseError, "Frontend published-port boundary changed"
                    ),
                ):
                    release.validate_candidate_ports(Path("candidate"))
            services[release.FRONTEND] = {"network_mode": "host"}
            with self.assertRaisesRegex(release.ReleaseError, "Host networking"):
                release.validate_candidate_ports(Path("candidate"))
            services[release.FRONTEND] = {}
            services[release.BACKEND]["ports"] = [ipv4]
            with self.assertRaisesRegex(
                release.ReleaseError, "Backend unexpectedly publishes"
            ):
                release.validate_candidate_ports(Path("candidate"))
