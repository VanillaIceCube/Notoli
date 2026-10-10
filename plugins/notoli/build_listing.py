"""Overlay repository branding onto an exported personal ChatGPT plugin ZIP."""

import argparse
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def build_listing(export: Path, output: Path, version: str) -> None:
    if export.resolve() == output.resolve():
        raise ValueError("Output must differ from the original export.")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Version must use major.minor.patch format.")

    package = Path(__file__).resolve().parent
    source = json.loads((package / "plugin.json").read_text(encoding="utf-8"))
    with ZipFile(export) as archive:
        files = {entry.filename: archive.read(entry) for entry in archive.infolist()}

    manifest_path = ".codex-plugin/plugin.json"
    manifest = json.loads(files[manifest_path])
    if manifest.get("interface", {}).get("displayName") != "Notoli":
        raise ValueError("Expected an export of the installed Notoli plugin.")
    if manifest.get("apps") != "./.app.json":
        raise ValueError("Expected a ChatGPT export with apps mapped by .app.json.")
    apps = json.loads(files[".app.json"]).get("apps", {})
    if not apps:
        raise ValueError("The export must retain an existing registered app.")
    current_version = tuple(map(int, manifest["version"].split(".")))
    if tuple(map(int, version.split("."))) <= current_version:
        raise ValueError("Choose a version greater than the exported plugin version.")

    # Keep the exported name and app mapping: these identify the installed plugin.
    for key in ("author", "description", "homepage", "repository", "keywords"):
        manifest[key] = source[key]
    manifest["interface"] = source["extensions"]["com.openai"]["interface"]
    manifest["version"] = version
    files[manifest_path] = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    for asset in (package / "assets").iterdir():
        if asset.is_file():
            files[f"assets/{asset.name}"] = asset.read_bytes()

    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    build_listing(args.export, args.output, args.version)
    print(f"Built {args.output}")
