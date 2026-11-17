"""Non-deploying workflow, script and Compose validation using synthetic env."""
import ast
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[2]


def run(*args, **kwargs):
    subprocess.run(args, check=True, cwd=ROOT, **kwargs)


def check_whitespace():
    # A clean checkout has no worktree diff. CI must check committed PR/push
    # revisions from the platform event, while local edits are checked as well.
    event_name = os.environ.get("GITHUB_EVENT_NAME")
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if event_name in {"pull_request", "push"}:
        if not event_path:
            raise ValueError("CI whitespace validation requires the platform event")
        event = json.loads(Path(event_path).read_text(encoding="utf-8"))
        if event_name == "pull_request":
            first = event["pull_request"]["base"]["sha"]
            last = event["pull_request"]["head"]["sha"]
        else:
            first, last = event["before"], event["after"]
        for commit in (first, last):
            if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", commit):
                raise ValueError("Invalid platform commit for whitespace validation")
        if first == "0" * 40:
            run("git", "show", "--format=", "--check", last, "--")
        else:
            run("git", "diff", "--check", first, last, "--")
    elif os.environ.get("CI"):
        run("git", "show", "--format=", "--check", "HEAD", "--")
    run("git", "diff", "--check", "HEAD", "--")


def check_local_policy(model, development):
    """Reject exposed local services and loss of the exact proxy trust boundary."""
    services = model["services"]
    ports = [port for service in services.values() for port in service.get("ports", [])]
    if not ports or any(port.get("host_ip") != "127.0.0.1" for port in ports):
        raise ValueError("Local services must publish only to IPv4 loopback")
    backend = services["backend"]
    databases = [mount for mount in backend.get("volumes", [])
                 if mount.get("target") == "/backend/db.sqlite3"]
    if (len(databases) != 1 or databases[0].get("type") != "bind"
            or databases[0].get("bind", {}).get("create_host_path", False) is not False):
        raise ValueError("Local SQLite must use an existing file; never auto-create its bind path")
    environment = backend["environment"]
    if development:
        if (environment.get("DJANGO_DEBUG") != "1"
                or environment.get("DJANGO_TRUSTED_PROXY_IPS") != ""
                or "--no-proxy-headers" not in backend.get("command", [])):
            raise ValueError("Direct local development must use debug mode and trust no proxy")
        if services["frontend"]["environment"].get("HOST") != "0.0.0.0":
            raise ValueError("The development frontend must listen on its container interface")
        return
    proxy = services["proxy"]
    if (backend.get("ports") or services["frontend"].get("ports")
            or {port["target"] for port in proxy["ports"]} != {80, 443}):
        raise ValueError("Standalone HTTPS must publish only its TLS/redirect proxy")
    private = model["networks"]["backend_private"]
    if private.get("internal") is not True:
        raise ValueError("The backend proxy network must remain internal")
    if (set(backend["networks"]) != {"backend_private", "backend_egress"}
            or "backend_private" in services["frontend"]["networks"]
            or set(proxy["networks"]) != {"default", "backend_private"}):
        raise ValueError("Only the standalone proxy may bridge frontend and backend networks")
    address = proxy["networks"]["backend_private"]["ipv4_address"]
    if environment.get("DJANGO_TRUSTED_PROXY_IPS") != address:
        raise ValueError("Backend trust must match the exact standalone proxy address")
    origin = proxy["environment"]["LOCAL_HTTPS_ORIGIN"]
    if not origin.startswith("https://") or any(
        environment.get(name) != origin for name in (
            "DJANGO_FRONTEND_BASE_URL", "DJANGO_MCP_BASE_URL",
            "DJANGO_CORS_ALLOWED_ORIGINS", "DJANGO_CSRF_TRUSTED_ORIGINS",
        )
    ):
        raise ValueError("Standalone browser, OAuth and trusted origins must agree")


def check_local_static_routes():
    proxy = (ROOT / "deploy/nginx-proxy.conf").read_text(encoding="utf-8")
    for prefix in ("/static/admin/", "/static/rest_framework/"):
        location = re.search(
            r"^\s*location\s+\^~\s+" + re.escape(prefix) + r"\s*\{([^{}]*)\}",
            proxy, re.M,
        )
        if location is None or not re.search(
            r"^\s*proxy_pass\s+http://backend:8000\s*;", location[1], re.M
        ):
            raise ValueError(f"Standalone HTTPS must route {prefix} to backend:8000")


def check_release_documentation():
    policy = json.loads((ROOT / "deploy/production/app.json").read_text(encoding="utf-8"))
    pin = policy["shared_source"]["commit"]
    guide = (ROOT / "deploy/production/README.md").read_text(encoding="utf-8")
    stated = re.findall(
        r"`shared_source` in `app\.json` pins that source to immutable commit\s+`([^`]+)`",
        guide,
    )
    links = re.findall(
        r"\[((?:Infrastructure )?release standard)\]\("
        r"https://github\.com/VanillaIceCube/JudeAndrewAlabaInfrastructure"
        r"/blob/([^/]+)/app-release/README\.md\)",
        guide,
    )
    expected_links = {("release standard", pin), ("Infrastructure release standard", pin)}
    if stated != [pin] or set(links) != expected_links:
        raise ValueError(
            "Production guide release pin and canonical links must match deploy/production/app.json"
        )


def main():
    run("actionlint", "-ignore", 'unknown permission scope "vulnerability-alerts"')
    # The single compatibility exception is for GitHub's existing new scope;
    # all other Actionlint findings retain their normal failure behavior.
    for file in (ROOT / ".github").rglob("*.y*ml"):
        with file.open(encoding="utf-8") as stream:
            data = yaml.safe_load(stream)
        if not isinstance(data, dict):
            raise ValueError(f"{file}:1: expected a YAML mapping")
        if file.name in {"action.yml", "action.yaml"}:
            runs = data.get("runs", {})
            if runs.get("using") == "composite":
                for step in runs.get("steps", []):
                    if "run" in step and "shell" not in step:
                        raise ValueError(f"{file}: composite run step requires shell")
    tracked = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT, text=True
    ).splitlines()
    for name in tracked:
        file = ROOT / name
        if not file.is_file():
            continue
        if file.suffix == ".sh":
            run("bash", "-n", str(file))
        elif file.suffix == ".py" and name.startswith(("scripts/", ".github/", "deploy/")):
            ast.parse(file.read_text(encoding="utf-8"), filename=name)
        elif file.suffix == ".ps1":
            env = {**os.environ, "CHECK_PS_FILE": str(file)}
            run("pwsh", "-NoProfile", "-NonInteractive", "-Command",
                '$errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:CHECK_PS_FILE,[ref]$null,[ref]$errors); '
                'if ($errors) { $errors | ForEach-Object { Write-Error ("{0}:{1}: {2}" -f $env:CHECK_PS_FILE,$_.Extent.StartLineNumber,$_.Message) }; exit 1 }', env=env)
    with tempfile.TemporaryDirectory(prefix="local-compose-") as directory:
        temp = Path(directory)
        fixture = temp / "synthetic.env"
        fixture.write_text("DJANGO_SECRET_KEY=disposable-fixture-only\n", encoding="utf-8")
        for name in ("deploy/docker-compose.yml", "deploy/docker-compose.dev.yml", "deploy/production/compose.yml"):
            source = ROOT / name
            if not source.exists():
                continue
            print(f"Compose configuration: {source}", flush=True)
            text = source.read_text(encoding="utf-8")
            data = yaml.safe_load(text)
            # Preserve all service structure, replacing only private env-file
            # locations. No .env, database, certificate or live network is read.
            for service in data.get("services", {}).values():
                if "env_file" in service:
                    service["env_file"] = str(fixture)
            rendered = temp / source.name
            rendered.write_text(yaml.safe_dump(data), encoding="utf-8")
            env = {key: value for key, value in os.environ.items() if key.upper() in {"PATH", "HOME", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP"}}
            env.update({"BACKEND_IMAGE": "example/backend@sha256:" + "a" * 64,
                        "FRONTEND_IMAGE": "example/frontend@sha256:" + "b" * 64,
                        "APP_DB_PATH": str(temp / "db.sqlite3")})
            for variable in re.findall(r"\$\{([A-Z][A-Z0-9_]*)(?::)?\?", text):
                env.setdefault(variable, str(temp / "fixture"))
            command = ["docker", "compose", "--project-directory", str(source.parent),
                       "--env-file", str(fixture), "-f", str(rendered), "config"]
            run(*command, "--quiet", env=env)
            if source.parent == ROOT / "deploy":
                model = json.loads(subprocess.check_output(
                    [*command, "--format", "json", "--no-env-resolution"],
                    cwd=ROOT, env=env, text=True,
                ))
                check_local_policy(model, source.name == "docker-compose.dev.yml")
    check_local_static_routes()
    check_release_documentation()
    check_whitespace()
    print("Repository files: workflow/composite syntax, script parsers and synthetic Compose validation passed")


if __name__ == "__main__":
    main()
