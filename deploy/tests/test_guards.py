"""Boundary and transient-failure regressions for app-independent releases."""

import copy
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error

from test_production import release


class ReadinessTests(unittest.TestCase):
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
        self.assertEqual(public.call_count, 5 if release.APP == "notoli" else 2)


@unittest.skipUnless(os.name == "posix", "Host preflight requires Linux")
class PreflightTests(unittest.TestCase):
    def test_companion_absence_allowed_but_own_or_trust_drift_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "db.sqlite3").write_bytes(b"existing")
            notoli = release.APP == "notoli"
            backend_networks = (
                {
                    "notoli_backend_private": {"IPAddress": "172.30.88.3"},
                    "notoli_backend_egress": {},
                }
                if notoli
                else {"macromapper-ingress": {}, "macromapper_default": {}}
            )
            frontend_networks = {"notoli_default": {}} if notoli else backend_networks
            gateway = {
                "State": {"Running": True},
                "Config": {"Labels": {"com.docker.compose.project": "host-ingress"}},
                "NetworkSettings": {
                    "Networks": {
                        "notoli_backend_private": {"IPAddress": "172.30.88.2"},
                        "notoli_default": {},
                        "macromapper-ingress": {},
                    }
                },
            }
            containers = {
                "host-ingress-proxy": gateway,
                release.APP + "-backend": {
                    "NetworkSettings": {"Networks": backend_networks},
                    "Config": {"Env": ["DJANGO_TRUSTED_PROXY_IPS=172.30.88.2"]},
                    "HostConfig": {"PortBindings": {}},
                    "Mounts": [
                        {
                            "Destination": "/backend/db.sqlite3",
                            "Source": str(root / "db.sqlite3"),
                        }
                    ],
                },
                release.APP + "-frontend": {
                    "NetworkSettings": {"Networks": frontend_networks},
                    "HostConfig": {
                        "PortBindings": {"80/tcp": [{"HostIp": "", "HostPort": "3000"}]}
                        if notoli
                        else {}
                    },
                },
            }
            networks = {}
            for name, internal, subnet, members in (
                ("notoli_backend_private", True, "172.30.88.0/29", ["notoli-backend"]),
                ("notoli_default", False, "172.18.0.0/16", ["notoli-frontend"]),
                (
                    "macromapper-ingress",
                    False,
                    "172.20.0.0/16",
                    ["macromapper-backend", "macromapper-frontend"],
                ),
            ):
                networks[name] = {
                    "Internal": internal,
                    "IPAM": {"Config": [{"Subnet": subnet}]},
                    "Containers": {
                        n: {"Name": n} for n in members + ["host-ingress-proxy"]
                    },
                }
            with (
                patch.object(
                    release, "inspect", side_effect=lambda name: containers[name]
                ),
                patch.object(
                    release,
                    "docker",
                    side_effect=lambda *args: json.dumps([networks[args[-1]]]),
                ),
                patch.object(
                    release.shutil,
                    "disk_usage",
                    return_value=SimpleNamespace(total=10000000000, free=8000000000),
                ),
                patch.object(
                    Path, "read_text", return_value="MemAvailable: 1048576 kB"
                ),
            ):
                release.preflight(root)
                # Independent release: unavailable companion does not block us.
                for network in networks.values():
                    network["Containers"] = {
                        n: v
                        for n, v in network["Containers"].items()
                        if n == "host-ingress-proxy" or n.startswith(release.APP + "-")
                    }
                release.preflight(root)
                original = copy.deepcopy(networks)
                for missing in (
                    release.APP + "-backend",
                    release.APP + "-frontend",
                    "host-ingress-proxy",
                ):
                    for network in networks.values():
                        network["Containers"].pop(missing, None)
                    with self.assertRaises(release.ReleaseError):
                        release.preflight(root)
                    networks = copy.deepcopy(original)
                networks["notoli_backend_private"]["Containers"]["unknown"] = {
                    "Name": "unknown"
                }
                with self.assertRaises(release.ReleaseError):
                    release.preflight(root)
                networks = copy.deepcopy(original)
                containers[release.APP + "-frontend"]["HostConfig"]["PortBindings"] = {
                    "80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}]
                }
                with self.assertRaises(release.ReleaseError):
                    release.preflight(root)
                containers[release.APP + "-frontend"]["HostConfig"]["PortBindings"] = (
                    {"80/tcp": [{"HostIp": "", "HostPort": "3000"}]} if notoli else {}
                )
                own_backend = containers[release.APP + "-backend"]
                original_backend = copy.deepcopy(own_backend)
                own_backend["NetworkSettings"]["Networks"]["unexpected-network"] = {}
                with self.assertRaises(release.ReleaseError):
                    release.preflight(root)
                containers[release.APP + "-backend"] = copy.deepcopy(original_backend)
                if notoli:
                    containers[release.APP + "-backend"]["Config"]["Env"] = []
                    with self.assertRaises(release.ReleaseError):
                        release.preflight(root)
                    containers[release.APP + "-backend"] = copy.deepcopy(
                        original_backend
                    )
                    containers[release.APP + "-backend"]["NetworkSettings"]["Networks"][
                        "notoli_backend_private"
                    ]["IPAddress"] = "172.30.88.4"
                    with self.assertRaises(release.ReleaseError):
                        release.preflight(root)
                    containers[release.APP + "-backend"] = copy.deepcopy(
                        original_backend
                    )
                gateway["NetworkSettings"]["Networks"]["notoli_backend_private"][
                    "IPAddress"
                ] = "172.30.88.4"
                with self.assertRaises(release.ReleaseError):
                    release.preflight(root)
