"""Start only an isolated loopback Django server for the shared Playwright suite."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    state = Path(os.environ["E2E_STATE_DIR"]).resolve()
    if state.parent != Path(tempfile.gettempdir()).resolve() or not state.name.startswith("batch2-e2e-") or not (state / ".disposable-e2e").is_file():
        raise ValueError("Expected the Playwright-created disposable state directory")
    (state / "emails").mkdir(exist_ok=True)
    env = {key: value for key, value in os.environ.items() if key.upper() in {
        "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "HOME", "VIRTUAL_ENV", "CONDA_PREFIX", "PYTHONUTF8"
    }}
    env.update({"E2E_STATE_DIR": str(state), "DJANGO_SETTINGS_MODULE": "e2e_settings",
                "PYTHONPATH": os.pathsep.join([str(ROOT / "scripts"), str(ROOT / "backend")]),
                "DJANGO_DEBUG": "1", "DJANGO_SECRET_KEY": "isolated-browser-test-key-not-for-deployment",
                "DJANGO_SQLITE_PATH": str(state / "db.sqlite3"), "DJANGO_MCP_ENABLED": "0",
                "DJANGO_FRONTEND_BASE_URL": "http://127.0.0.1:3001"})
    command = [sys.executable, str(ROOT / "backend/manage.py")]
    subprocess.run([*command, "migrate", "--noinput"], cwd=ROOT / "backend", env=env, check=True)
    server = subprocess.Popen([*command, "runserver", "127.0.0.1:8001", "--noreload"], cwd=ROOT / "backend", env=env)
    try:
        raise SystemExit(server.wait())
    finally:
        if server.poll() is None:
            server.terminate()
            server.wait(timeout=15)


if __name__ == "__main__":
    main()
