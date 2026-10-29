"""Boundary and transient-failure regressions for app-independent releases."""

import copy
import io
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
        self.assertEqual(public.call_count, 5 if release.APP == "notoli" else 2)


@unittest.skipUnless(os.name == "posix", "Host preflight requires Linux")
class PreflightTests(unittest.TestCase):
    def test_companion_absence_allowed_but_own_or_trust_drift_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "db.sqlite3").write_bytes(b"existing")
            config = release.CONFIG
            policy = config["gateway"]
            gateway_name = policy["container"]
            backend_name = config["containers"]["backend"]
            frontend_name = config["containers"]["frontend"]
            own = {backend_name, frontend_name}
            backend_networks = {
                name: {"IPAddress": config["backend_addresses"].get(name, "")}
                for name in config["backend_networks"]
            }
            frontend_networks = {name: {} for name in config["frontend_networks"]}
            gateway = {
                "State": {"Running": True},
                "Config": {"Labels": {"com.docker.compose.project": policy["project"]}},
                "NetworkSettings": {
                    "Networks": {
                        name: {"IPAddress": policy["addresses"].get(name, "")}
                        for name in policy["networks"]
                    }
                },
            }
            original_ports = {}
            for port, host, number in config["frontend_port_bindings"][0]:
                original_ports.setdefault(port, []).append(
                    {"HostIp": host, "HostPort": number}
                )
            containers = {
                gateway_name: gateway,
                backend_name: {
                    "NetworkSettings": {"Networks": backend_networks},
                    "Config": {"Env": list(config["backend_required_env"])},
                    "HostConfig": {"PortBindings": {}},
                    "Mounts": [
                        {
                            "Destination": release.DB_TARGET,
                            "Source": str(root / release.DB_FILE),
                        }
                    ],
                },
                frontend_name: {
                    "NetworkSettings": {"Networks": frontend_networks},
                    "HostConfig": {"PortBindings": copy.deepcopy(original_ports)},
                },
            }
            networks = {
                name: {
                    "Internal": network["internal"],
                    "IPAM": {"Config": [{"Subnet": network["subnet"]}]},
                    "Containers": {
                        member: {"Name": member} for member in network["allowed"]
                    },
                }
                for name, network in policy["networks"].items()
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
                        if n == gateway_name or n in own
                    }
                release.preflight(root)
                original = copy.deepcopy(networks)
                for missing in (
                    backend_name,
                    frontend_name,
                    gateway_name,
                ):
                    for network in networks.values():
                        network["Containers"].pop(missing, None)
                    with self.assertRaises(release.ReleaseError):
                        release.preflight(root)
                    networks = copy.deepcopy(original)
                networks[next(iter(networks))]["Containers"]["unknown"] = {
                    "Name": "unknown"
                }
                with self.assertRaises(release.ReleaseError):
                    release.preflight(root)
                networks = copy.deepcopy(original)
                containers[frontend_name]["HostConfig"]["PortBindings"] = {
                    "80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}]
                }
                with self.assertRaises(release.ReleaseError):
                    release.preflight(root)
                containers[frontend_name]["HostConfig"]["PortBindings"] = copy.deepcopy(
                    original_ports
                )
                own_backend = containers[backend_name]
                original_backend = copy.deepcopy(own_backend)
                own_backend["NetworkSettings"]["Networks"]["unexpected-network"] = {}
                with self.assertRaises(release.ReleaseError):
                    release.preflight(root)
                containers[backend_name] = copy.deepcopy(original_backend)
                if config["backend_required_env"]:
                    containers[backend_name]["Config"]["Env"] = []
                    with self.assertRaises(release.ReleaseError):
                        release.preflight(root)
                    containers[backend_name] = copy.deepcopy(original_backend)
                for network in config["backend_addresses"]:
                    containers[backend_name]["NetworkSettings"]["Networks"][network][
                        "IPAddress"
                    ] = "192.0.2.99"
                    with self.assertRaises(release.ReleaseError):
                        release.preflight(root)
                    containers[backend_name] = copy.deepcopy(original_backend)
                for network in policy["addresses"]:
                    previous = gateway["NetworkSettings"]["Networks"][network][
                        "IPAddress"
                    ]
                    gateway["NetworkSettings"]["Networks"][network]["IPAddress"] = (
                        "192.0.2.99"
                    )
                    with self.assertRaises(release.ReleaseError):
                        release.preflight(root)
                    gateway["NetworkSettings"]["Networks"][network]["IPAddress"] = (
                        previous
                    )
                gateway["NetworkSettings"]["Networks"]["unexpected-network"] = {}
                with self.assertRaises(release.ReleaseError):
                    release.preflight(root)
