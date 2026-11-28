"""Host preflight checks against a disposable application directory."""

import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from deploy.production import release


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
            ):
                release.check_host(root)
                # Independent release: unavailable companion does not block us.
                for network in networks.values():
                    network["Containers"] = {
                        n: v
                        for n, v in network["Containers"].items()
                        if n == gateway_name or n in own
                    }
                release.check_host(root)
                original = copy.deepcopy(networks)
                for missing in (
                    backend_name,
                    frontend_name,
                    gateway_name,
                ):
                    for network in networks.values():
                        network["Containers"].pop(missing, None)
                    with self.assertRaises(release.ReleaseError):
                        release.check_host(root)
                    if missing in own:
                        release.check_host(root, require_app=False)
                    networks = copy.deepcopy(original)
                networks[next(iter(networks))]["Containers"]["unknown"] = {
                    "Name": "unknown"
                }
                with self.assertRaises(release.ReleaseError):
                    release.check_host(root)
                networks = copy.deepcopy(original)
                containers[frontend_name]["HostConfig"]["PortBindings"] = {
                    "80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}]
                }
                with self.assertRaises(release.ReleaseError):
                    release.check_host(root)
                containers[frontend_name]["HostConfig"]["PortBindings"] = copy.deepcopy(
                    original_ports
                )
                own_backend = containers[backend_name]
                original_backend = copy.deepcopy(own_backend)
                own_backend["NetworkSettings"]["Networks"]["unexpected-network"] = {}
                with self.assertRaises(release.ReleaseError):
                    release.check_host(root)
                containers[backend_name] = copy.deepcopy(original_backend)
                if config["backend_required_env"]:
                    containers[backend_name]["Config"]["Env"] = []
                    with self.assertRaises(release.ReleaseError):
                        release.check_host(root)
                    containers[backend_name] = copy.deepcopy(original_backend)
                for network in config["backend_addresses"]:
                    containers[backend_name]["NetworkSettings"]["Networks"][network][
                        "IPAddress"
                    ] = "192.0.2.99"
                    with self.assertRaises(release.ReleaseError):
                        release.check_host(root)
                    containers[backend_name] = copy.deepcopy(original_backend)
                for network in policy["addresses"]:
                    previous = gateway["NetworkSettings"]["Networks"][network][
                        "IPAddress"
                    ]
                    gateway["NetworkSettings"]["Networks"][network]["IPAddress"] = (
                        "192.0.2.99"
                    )
                    with self.assertRaises(release.ReleaseError):
                        release.check_host(root)
                    gateway["NetworkSettings"]["Networks"][network]["IPAddress"] = (
                        previous
                    )
                gateway["NetworkSettings"]["Networks"]["unexpected-network"] = {}
                with self.assertRaisesRegex(release.ReleaseError, "network boundary"):
                    release.check_host(root)
                del gateway["NetworkSettings"]["Networks"]["unexpected-network"]
                for companion in set(policy.get("allowed_networks", ())) - set(
                    policy["networks"]
                ):
                    gateway["NetworkSettings"]["Networks"][companion] = {}
                release.check_host(root)
                route = next(iter(policy["networks"]))
                endpoint = gateway["NetworkSettings"]["Networks"].pop(route)
                with self.assertRaisesRegex(release.ReleaseError, "network boundary"):
                    release.check_host(root)
                gateway["NetworkSettings"]["Networks"][route] = endpoint
