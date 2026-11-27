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

# Only the copy installed in an application has a production policy.
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


# The host launches from the bundle. Only CI and developers fetch shared source.
REPOSITORY = "VanillaIceCube/infrastructure"
REPOSITORY_ID = 1414122449
SOURCE = "deploy"
FILES = {
    "deploy/production/release.py": "release.py",
    "deploy/production/build_bundle.py": "build_bundle.py",
    "deploy/tests/test_production.py": "tests/test_production.py",
    "deploy/tests/test_guards.py": "tests/test_guards.py",
    "deploy/tests/test_launch_docker.py": "tests/test_launch_docker.py",
    "deploy/tests/test_contract.py": "tests/test_contract.py",
}


def render_workflow(template, config):
    extras = "".join(
        f"          {key}: {value}\n"
        for key, value in config["workflow"]["extra_env"].items()
    )
    return template.replace("__APP__", config["app"]).replace("__EXTRA_ENV__\n", extras)


def check_parity(root, source_root=None, sync=False):
    config = json.loads(
        (root / "deploy/production/app.json").read_text(encoding="utf-8")
    )
    pin = config["shared_source"]
    if config["contract_version"] != 1:
        raise ValueError("Unsupported release contract version")
    # Older pinned app fixtures still identify this repository by its former name.
    known_names = {REPOSITORY, "VanillaIceCube/JudeAndrewAlabaInfrastructure"}
    if pin["repository"] not in known_names or not re.fullmatch(
        r"[0-9a-f]{40}", pin["commit"]
    ):
        raise ValueError(
            "Shared source requires the canonical repository and full commit SHA"
        )

    if sync and (root / "deploy").resolve() != root.resolve() / "deploy":
        raise ValueError("Release source directory must not be a symlink")

    if source_root is None:
        with urllib.request.urlopen(
            f"https://api.github.com/repositories/{REPOSITORY_ID}", timeout=30
        ) as response:
            source_repository = json.load(response)["full_name"]
        if source_repository not in known_names:
            raise ValueError("Unexpected shared release repository")

    def read_source(name):
        if source_root is not None:
            data = (source_root / SOURCE / name).read_bytes()
        else:
            url = f"https://raw.githubusercontent.com/{source_repository}/{pin['commit']}/{SOURCE}/{name}"
            with urllib.request.urlopen(url, timeout=30) as response:
                data = response.read(1024 * 1024 + 1)
            if len(data) > 1024 * 1024:
                raise ValueError("Shared source exceeds the download limit: " + name)
        return data.replace(b"\r\n", b"\n")

    # Read every source before writing so a failed download leaves the checkout intact.
    expected = {target: read_source(source) for target, source in FILES.items()}
    template = read_source("workflow.yml").decode("utf-8")
    expected[".github/workflows/ci-deploy.yml"] = render_workflow(
        template, config
    ).encode("utf-8")
    for name, contents in expected.items():
        path = root / name
        if sync:
            path.write_bytes(contents)
        elif path.read_bytes().replace(b"\r\n", b"\n") != contents:
            raise ValueError("Shared release drift: " + name)
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
            print("Shared release source, tests and workflow match " + commit)
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
