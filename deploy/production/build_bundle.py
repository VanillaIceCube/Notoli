"""Build private release bundles or verify/sync their pinned shared implementation."""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.request
from pathlib import Path

# The canonical Infrastructure module is importable for manifest maintenance;
# only consumers have app.json. Building without app policy still fails closed.
CONFIG_PATH = Path(__file__).resolve().parent / "app.json"
CONFIG = (
    json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if CONFIG_PATH.exists()
    else None
)
if CONFIG is not None and CONFIG["contract_version"] != 1:
    raise ValueError("Unsupported release contract version")
APP = CONFIG["app"] if CONFIG is not None else None
REQUIRED = CONFIG["environment"]["required"] if CONFIG is not None else ()
DEFAULTS = CONFIG["environment"]["defaults"] if CONFIG is not None else {}
FIXED = CONFIG["environment"]["fixed"] if CONFIG is not None else {}


def build(target, env):
    if CONFIG is None:
        raise ValueError("App configuration is required to build a release bundle")
    revision = env["GITHUB_SHA"]
    attempt = env["GITHUB_RUN_ID"] + "-" + env["GITHUB_RUN_ATTEMPT"]
    if not re.fullmatch(r"[0-9a-f]{40}", revision) or not re.fullmatch(
        r"[0-9]+-[0-9]+", attempt
    ):
        raise ValueError("Invalid source/run identity")
    identity = revision + "-" + attempt
    values = {key: env.get(key) or default for key, default in DEFAULTS.items()}
    for key, fixed in FIXED.items():
        if env.get(key, fixed) != fixed:
            raise ValueError("Production setting mismatch: " + key)
        values[key] = fixed
    for key in REQUIRED:
        if not env.get(key, "").strip():
            raise ValueError("Missing setting: " + key)
        values[key] = env[key]
    if any(any(c in value for c in "\r\n\0") for value in values.values()):
        raise ValueError("Environment values must be single line")
    # Existing approved repository variables may retain the pre-layout class path.
    # Normalize only this known value in new bundles; retained recovery data is untouched.
    if values["DJANGO_EMAIL_BACKEND"] in (
        "authentication.email_backends.ResendApiEmailBackend",
        "apps.authentication.email_backends.ResendApiEmailBackend",
        "apps.email.backends.ResendApiEmailBackend",
    ):
        values["DJANGO_EMAIL_BACKEND"] = "anymail.backends.resend.EmailBackend"
    if values["DJANGO_EMAIL_BACKEND"] not in (
        "django.core.mail.backends.smtp.EmailBackend",
        "anymail.backends.resend.EmailBackend",
    ):
        raise ValueError("Configure a production email backend")
    release = {"app": APP, "id": identity, "revision": revision}
    owner = env["GITHUB_REPOSITORY_OWNER"].lower()
    if not re.fullmatch(r"[a-z0-9-]+", owner):
        raise ValueError("Invalid image owner")
    for service in ("backend", "frontend"):
        ref = env[service.upper() + "_IMAGE"]
        if not re.fullmatch(
            r"ghcr\.io/" + owner + "/" + APP + "-" + service + r"@sha256:[0-9a-f]{64}",
            ref,
        ):
            raise ValueError("Immutable image digest required")
        release[service] = ref
    target.mkdir(mode=0o700)  # no overwrite or reuse of an attempt
    bundle = target / identity
    bundle.mkdir(mode=0o700)
    for name in ("compose.yml", "release.py", "app.json"):
        shutil.copyfile(Path(__file__).parent / name, bundle / name)
    (bundle / ".backend.env").write_text(
        "".join(f"{k}={v}\n" for k, v in values.items()), encoding="utf-8", newline="\n"
    )
    (bundle / "release.json").write_text(json.dumps(release), encoding="utf-8")
    manifest = {}
    for path in bundle.iterdir():
        path.chmod(0o600)
        manifest[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    (bundle / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (bundle / "manifest.json").chmod(0o600)
    return identity


# Development/CI verification only; offline host recovery uses release.py.
REPOSITORY = "VanillaIceCube/JudeAndrewAlabaInfrastructure"
SOURCE = "app-release/v1"
FILES = {
    "deploy/production/release.py": "release.py",
    "deploy/production/build_bundle.py": "build_bundle.py",
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


def check_parity(root, source_root=None, sync=False):
    config = json.loads(
        (root / "deploy/production/app.json").read_text(encoding="utf-8")
    )
    pin = config["shared_source"]
    if config["contract_version"] != 1:
        raise ValueError("Unsupported release contract version")
    if pin["repository"] != REPOSITORY or not re.fullmatch(
        r"[0-9a-f]{40}", pin["commit"]
    ):
        raise ValueError(
            "Shared source requires the canonical repository and full commit SHA"
        )

    def read(name):
        if source_root is not None:
            return (source_root / SOURCE / name).read_bytes()
        url = f"https://raw.githubusercontent.com/{REPOSITORY}/{pin['commit']}/{SOURCE}/{name}"
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ValueError("Shared source exceeds the download limit: " + name)
        return data

    manifest = json.loads(read("manifest.json"))
    if manifest["contract_version"] != 1 or set(manifest["files"]) != set(FILES):
        raise ValueError("Unsupported or incomplete shared standard manifest")
    template_bytes = read("workflow.yml")
    if digest(template_bytes) != manifest["workflow_sha256"]:
        raise ValueError("Shared workflow template checksum mismatch")
    template = template_bytes.decode("utf-8").replace("\r\n", "\n")
    if sync:
        # Validate every download before replacing any consumer files.
        downloads = {}
        for target, source in FILES.items():
            data = read(source)
            if digest(data) != manifest["files"][target]:
                raise ValueError("Shared source checksum mismatch: " + source)
            downloads[target] = data.replace(b"\r\n", b"\n")
        workflow = render_workflow(template, config)
        for target, data in downloads.items():
            (root / target).write_bytes(data)
        (root / ".github/workflows/ci-deploy.yml").write_text(
            workflow, encoding="utf-8", newline="\n"
        )
    verify(root, manifest, template)
    return pin["commit"]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "target", nargs="?", type=Path, help="New private bundle output directory"
    )
    parser.add_argument(
        "--check-parity",
        action="store_true",
        help="Verify pinned common code, tests and workflow",
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        help="Offline Infrastructure checkout for local parity development",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Synchronize verified shared files and render the app workflow",
    )
    args = parser.parse_args(argv)
    if args.check_parity:
        if args.target is not None:
            parser.error("--check-parity cannot create a bundle")
        commit = check_parity(
            Path(__file__).resolve().parents[2], args.source_root, args.sync
        )
        if args.source_root is not None:
            print(
                "Local shared release source matches; remote pin "
                + commit
                + " was not verified"
            )
        else:
            print(
                "Shared release contract v1: common source, tests and workflow match "
                + commit
            )
    else:
        if args.target is None or args.sync or args.source_root is not None:
            parser.error(
                "Provide a bundle target, or use --check-parity with verification options"
            )
        print(build(args.target, os.environ))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        sys.exit(
            str(error) if isinstance(error, ValueError) else "Release tooling failed"
        )
