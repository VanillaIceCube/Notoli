"""Non-deploying workflow, script and Compose validation using synthetic env."""
import ast
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[1]


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
    with tempfile.TemporaryDirectory(prefix="batch2-compose-") as directory:
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
            run("docker", "compose", "--project-directory", str(source.parent), "--env-file", str(fixture), "-f", str(rendered), "config", "--quiet", env=env)
    check_whitespace()
    print("Repository files: workflow/composite syntax, script parsers and synthetic Compose validation passed")


if __name__ == "__main__":
    main()
