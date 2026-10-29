"""Verify or synchronize vendored release files against a pinned shared standard.

This is a development/CI tool only. Deployment bundles never fetch this repository.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import urllib.request

REPOSITORY = "VanillaIceCube/JudeAndrewAlabaInfrastructure"
SOURCE = "app-release/v1"
FILES = {
    "deploy/production/release.py": "release.py",
    "deploy/production/build_bundle.py": "build_bundle.py",
    "deploy/check_parity.py": "check_parity.py",
    **{
        "deploy/tests/" + name: "tests/" + name
        for name in (
            "test_production.py",
            "test_guards.py",
            "test_recovery_docker.py",
            "test_generation_docker.py",
            "test_contract.py",
        )
    },
}


def digest(data):
    # Git checkouts on Windows may use CRLF; normalize only text line endings.
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def render_workflow(template, config):
    extras = "".join(
        f"          {key}: {value}\n"
        for key, value in config["workflow"]["extra_env"].items()
    )
    return (
        template.replace("__APP__", config["app"])
        .replace("__FRONTEND_BUILD_ARG__", config["workflow"]["frontend_build_arg"])
        .replace("__EXTRA_ENV__\n", extras)
    )


def verify(root, manifest, template):
    if manifest["contract_version"] != 1 or set(manifest["files"]) != set(FILES):
        raise ValueError("Unsupported or incomplete shared standard manifest")
    for name, expected in manifest["files"].items():
        if digest((root / name).read_bytes()) != expected:
            raise ValueError("Shared release drift: " + name)
    config = json.loads(
        (root / "deploy/production/app.json").read_text(encoding="utf-8")
    )
    if config["contract_version"] != manifest["contract_version"]:
        raise ValueError("App configuration contract version mismatch")
    expected = render_workflow(template, config)
    actual = (root / ".github/workflows/ci-deploy.yml").read_text(encoding="utf-8")
    if actual != expected:
        raise ValueError("Deployment workflow differs from the shared stage template")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-root",
        type=Path,
        help="Local infrastructure checkout for offline development",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Copy the pinned common files and render this app's workflow",
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    pin = json.loads((root / "deploy/shared-source.json").read_text(encoding="utf-8"))
    if pin["repository"] != REPOSITORY or not re.fullmatch(
        r"[0-9a-f]{40}", pin["commit"]
    ):
        raise ValueError(
            "Shared source requires the canonical repository and full commit SHA"
        )

    def read(name):
        if args.source_root:
            return (args.source_root / SOURCE / name).read_bytes()
        url = f"https://raw.githubusercontent.com/{REPOSITORY}/{pin['commit']}/{SOURCE}/{name}"
        with urllib.request.urlopen(url, timeout=30) as response:
            return response.read(1024 * 1024)

    manifest = json.loads(read("manifest.json"))
    template_bytes = read("workflow.yml")
    if digest(template_bytes) != manifest["workflow_sha256"]:
        raise ValueError("Shared workflow template checksum mismatch")
    template = template_bytes.decode("utf-8").replace("\r\n", "\n")
    if args.sync:
        if set(manifest["files"]) != set(FILES):
            raise ValueError("Unexpected shared source file set")
        for target, source in FILES.items():
            data = read(source)
            if digest(data) != manifest["files"][target]:
                raise ValueError("Shared source checksum mismatch: " + source)
            (root / target).write_bytes(data.replace(b"\r\n", b"\n"))
        config = json.loads(
            (root / "deploy/production/app.json").read_text(encoding="utf-8")
        )
        (root / ".github/workflows/ci-deploy.yml").write_text(
            render_workflow(template, config), encoding="utf-8", newline="\n"
        )
    verify(root, manifest, template)
    print(
        "Shared release contract v1: common source, tests and workflow match "
        + pin["commit"]
    )


if __name__ == "__main__":
    main()
