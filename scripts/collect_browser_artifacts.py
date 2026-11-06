"""Copy a bounded set of generated Playwright failure artifacts for CI upload."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1] / "frontend"
PER_FILE = 20 * 1024 * 1024
TOTAL = 50 * 1024 * 1024


def main():
    destination = ROOT / "browser-evidence"
    destination.mkdir(exist_ok=True)
    used = 0
    index = []
    for folder in ("test-results", "playwright-report"):
        source = ROOT / folder
        for file in sorted(source.rglob("*")):
            if not file.is_file() or file.is_symlink():
                continue
            relative = file.relative_to(ROOT)
            size = file.stat().st_size
            if size > PER_FILE or used + size > TOTAL:
                index.append(f"Omitted oversized artifact: {relative} ({size} bytes)")
                continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
            used += size
    index.append(f"Retained {used} bytes; limits: 20 MiB/file and 50 MiB/run. Full text output remains in the job log.")
    (destination / "INDEX.txt").write_text("\n".join(index) + "\n", encoding="utf-8")
    print("\n".join(index))


if __name__ == "__main__":
    main()
