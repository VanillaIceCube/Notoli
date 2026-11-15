"""Overlay repository branding onto an exported personal ChatGPT plugin ZIP."""

import argparse
import json
import re
import stat
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_MEMBER_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 1000


def read_export(export: Path) -> dict[str, bytes]:
    if export.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("Plugin export exceeds the archive size limit.")
    files = {}
    seen = set()
    total = 0
    with ZipFile(export) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_ARCHIVE_MEMBERS:
            raise ValueError("Plugin export contains too many members.")
        for entry in entries:
            name = entry.filename
            path = name[:-1] if entry.is_dir() else name
            if (
                entry.orig_filename != name
                or not path
                or "\\" in path
                or ":" in path
                or any(part in {"", ".", ".."} for part in path.split("/"))
                or stat.S_IFMT(entry.external_attr >> 16)
                not in {0, stat.S_IFREG, stat.S_IFDIR}
            ):
                raise ValueError(
                    "Plugin export contains an unsafe member path or type."
                )
            key = path.casefold()
            if key in seen:
                raise ValueError("Plugin export contains duplicate member paths.")
            seen.add(key)
            total += entry.file_size
            if entry.file_size > MAX_MEMBER_BYTES or total > MAX_ARCHIVE_BYTES:
                raise ValueError("Plugin export exceeds the expanded size limit.")
        for entry in entries:
            with archive.open(entry) as member:
                content = member.read(MAX_MEMBER_BYTES + 1)
            if len(content) > MAX_MEMBER_BYTES:
                raise ValueError("Plugin export member exceeds the size limit.")
            files[entry.filename] = content
    return files


def build_listing(export: Path, output: Path, version: str) -> None:
    if export.resolve() == output.resolve():
        raise ValueError("Output must differ from the original export.")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Version must use major.minor.patch format.")

    package = Path(__file__).resolve().parent
    source = json.loads((package / "plugin.json").read_text(encoding="utf-8"))
    files = read_export(export)

    manifest_path = ".codex-plugin/plugin.json"
    manifest = json.loads(files[manifest_path])
    expected_name = source["extensions"]["com.openai"]["interface"]["displayName"]
    if manifest.get("interface", {}).get("displayName") != expected_name:
        raise ValueError(f"Expected an export of the installed {expected_name} plugin.")
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
