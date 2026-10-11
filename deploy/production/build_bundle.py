"""Create one private, checksummed app-only incoming bundle for a unique CI attempt."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys

APP = "notoli"
ORIGIN = "https://" + APP + ".judeandrewalaba.com"
REQUIRED = (
    "DJANGO_SECRET_KEY",
    "DJANGO_EMAIL_BACKEND",
    "DJANGO_EMAIL_HOST_KEY",
    "DJANGO_DEFAULT_FROM_EMAIL",
)
DEFAULTS = {
    "DJANGO_EMAIL_HOST": "smtp.resend.com",
    "DJANGO_EMAIL_PORT": "587",
    "DJANGO_EMAIL_USE_TLS": "1",
    "DJANGO_EMAIL_HOST_USER": "resend",
    "DJANGO_EMAIL_TIMEOUT": "10",
}
FIXED = {
    "DJANGO_DEBUG": "0",
    "DJANGO_SQLITE_PATH": "/backend/db.sqlite3",
    "DJANGO_ALLOWED_HOSTS": APP + ".judeandrewalaba.com",
    "DJANGO_CORS_ALLOWED_ORIGINS": ORIGIN,
    "DJANGO_CSRF_TRUSTED_ORIGINS": ORIGIN,
    "DJANGO_FRONTEND_BASE_URL": ORIGIN,
}
if APP == "notoli":
    FIXED.update(DJANGO_MCP_BASE_URL=ORIGIN, DJANGO_TRUSTED_PROXY_IPS="172.30.88.2")
else:
    REQUIRED += ("MACROMAPPER_OPENAI_API_KEY",)
    FIXED["DJANGO_FORCE_SCRIPT_NAME"] = ""
    DEFAULTS.update(
        OPENAI_MEAL_ESTIMATION_MODEL="gpt-5.6-luna", OPENAI_MEAL_ESTIMATION_TIMEOUT="45"
    )


def build(target, env):
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
        "authentication.email_backends.ResendApiEmailBackend",
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
    for name in ("compose.yml", "release.py"):
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


if __name__ == "__main__":
    try:
        print(build(Path(sys.argv[1]), os.environ))
    except (ValueError, KeyError, OSError) as error:
        sys.exit(
            str(error) if isinstance(error, ValueError) else "Bundle creation failed"
        )
