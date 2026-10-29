"""Check the complete shared Python framework against its immutable source manifest."""

import argparse
import hashlib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = Path("backend/mcp_framework")
MANIFEST = Path("backend/mcp-framework-manifest.json")
REPOSITORY = "VanillaIceCube/FullStackTemplate"


def inventory(root):
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(
            path.read_bytes().replace(b"\r\n", b"\n")
        ).hexdigest()
        for path in sorted((root / PACKAGE).rglob("*.py"))
        if "__pycache__" not in path.parts
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-root",
        type=Path,
        help="Local development only; CI uses the immutable remote pin",
    )
    parser.add_argument(
        "--write-manifest",
        action="store_true",
        help="Canonical maintainer operation before committing source",
    )
    args = parser.parse_args()
    if args.write_manifest:
        (ROOT / MANIFEST).write_text(
            json.dumps(inventory(ROOT), indent=2) + "\n", encoding="utf-8"
        )
        return
    pin = json.loads((ROOT / "mcp-framework-source.json").read_text(encoding="utf-8"))
    if pin.get("repository") != REPOSITORY or not re.fullmatch(
        r"[0-9a-f]{40}", pin.get("commit", "")
    ):
        raise SystemExit("Invalid immutable MCP framework source pin")
    if args.source_root:
        expected = json.loads((args.source_root / MANIFEST).read_text(encoding="utf-8"))
        if inventory(args.source_root) != expected:
            raise SystemExit("Canonical framework differs from its manifest")
    else:
        url = f"https://raw.githubusercontent.com/{REPOSITORY}/{pin['commit']}/{MANIFEST.as_posix()}"
        with urllib.request.urlopen(url, timeout=30) as response:
            expected = json.load(response)
    actual = inventory(ROOT)
    if (
        actual != expected
        or json.loads((ROOT / MANIFEST).read_text(encoding="utf-8")) != expected
    ):
        raise SystemExit(
            "MCP framework parity failed; update the canonical source and synchronize all consumers"
        )
    print(f"MCP framework parity passed ({len(actual)} files, {pin['commit']})")


if __name__ == "__main__":
    main()
