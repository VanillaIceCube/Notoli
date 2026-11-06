"""Check actual npm startup against only a uniquely created disposable volume."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=300, **kwargs)


def main():
    image = sys.argv[1]
    volume = "batch2-dev-" + uuid.uuid4().hex
    run("docker", "volume", "create", volume)
    try:
        with tempfile.TemporaryDirectory(prefix="batch2-dev-") as directory:
            root = Path(directory)
            package = root / "package.json"
            lock = root / "package-lock.json"
            package.write_text(json.dumps({"name": "disposable-dev-fixture", "version": "1.0.0"}), encoding="utf-8")
            lock.write_text(json.dumps({"name": "disposable-dev-fixture", "version": "1.0.0", "lockfileVersion": 3, "packages": {"": {"name": "disposable-dev-fixture", "version": "1.0.0"}}}), encoding="utf-8")

            def start():
                return run("docker", "run", "--rm", "--network", "none", "--workdir", "/fixture",
                           "--mount", f"type=bind,source={root},target=/fixture",
                           "--mount", f"type=volume,source={volume},target=/fixture/node_modules",
                           image, "node", "-e", "console.log('command-executed')").stdout

            first = start()
            assert "Installing development dependencies" in first and "command-executed" in first, first
            second = start()
            assert "Installing development dependencies" not in second and "command-executed" in second, second
            package.write_text(package.read_text(encoding="utf-8") + "\n", encoding="utf-8")
            assert "Installing development dependencies" in start()
            lock.write_text(lock.read_text(encoding="utf-8") + "\n", encoding="utf-8")
            assert "Installing development dependencies" in start()
            print("Disposable Docker volume: fresh install, unchanged restart and both manifest changes passed")
    finally:
        run("docker", "volume", "rm", volume)


if __name__ == "__main__":
    main()
