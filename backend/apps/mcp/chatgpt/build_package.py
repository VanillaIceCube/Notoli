"""Validate and build a portable ChatGPT package without account-specific files."""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile

PACKAGE = Path(__file__).resolve().parent


def package_files(package: Path) -> dict[str, bytes]:
    package = package.resolve()
    plugin = json.loads((package / "plugin.json").read_text(encoding="utf-8"))
    mcp = json.loads((package / "mcp.json").read_text(encoding="utf-8"))
    if (
        plugin.get("$schema")
        != "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
    ):
        raise ValueError("Expected an Agent Plugins 1.0 manifest.")
    if mcp.get("$schema") != "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json":
        raise ValueError("Expected the portable MCP schema.")
    name = plugin.get("name", "")
    if (
        not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?", name)
        or ".." in name
        or "--" in name
    ):
        raise ValueError("Expected a valid portable package name.")
    if not re.fullmatch(r"\d+\.\d+\.\d+", plugin.get("version", "")):
        raise ValueError("Expected a major.minor.patch package version.")
    interface = plugin["extensions"]["com.openai"]["interface"]
    description = interface.get("shortDescription", "")
    if (
        not isinstance(description, str)
        or not description.strip()
        or len(description) > 30
    ):
        raise ValueError("Listing subtitle must contain 1–30 characters.")
    servers = mcp.get("mcpServers", {})
    if set(servers) != {name}:
        raise ValueError("The MCP server name must match the package name.")
    server = servers[name]
    url = urlsplit(server.get("url", ""))
    if (
        server.get("type") != "streamable-http"
        or url.scheme != "https"
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
        or url.path != "/mcp"
    ):
        raise ValueError(
            "Configure an absolute HTTPS /mcp endpoint without credentials."
        )
    if url.hostname == "app.example.com":
        raise ValueError(
            "Initialize the template and configure its HTTPS MCP endpoint first."
        )
    auth = server["extensions"]["com.openai"]["auth"]
    client = auth.get("client", {})
    if (
        auth.get("type") != "oauth"
        or client.get("mode") != "provided"
        or not client.get("clientId")
        or client.get("tokenEndpointAuthMethod") != "none"
    ):
        raise ValueError(
            "Expected a predefined public OAuth client with no client secret."
        )
    scopes = auth.get("baseScopes", [])
    if not scopes or any(
        not isinstance(value, str) or not value.startswith(name + ":")
        for value in scopes
    ):
        raise ValueError("Declare application-owned OAuth scopes.")
    for endpoint in ("authorizationUrl", "tokenUrl"):
        actual = urlsplit(auth.get(endpoint, ""))
        if (
            actual.scheme != url.scheme
            or actual.netloc != url.netloc
            or actual.query
            or actual.fragment
        ):
            raise ValueError("OAuth endpoints must use the MCP server's HTTPS origin.")
    files = {
        name: (package / name).read_bytes() for name in ("plugin.json", "mcp.json")
    }
    for key in ("logo", "composerIcon", "logoDark", "composerIconDark"):
        if key not in interface:
            continue
        relative = interface[key]
        if (
            not isinstance(relative, str)
            or not relative.startswith("./assets/")
            or ".." in Path(relative).parts
        ):
            raise ValueError("Artwork must use a contained ./assets/ path.")
        asset = package / relative
        if (
            asset.is_symlink()
            or not asset.resolve().is_relative_to(package)
            or not asset.is_file()
        ):
            raise ValueError("Referenced artwork is missing or outside the package.")
        if (
            asset.suffix.lower() not in {".svg", ".png", ".jpg", ".jpeg", ".webp"}
            or asset.stat().st_size > 5 * 1024 * 1024
        ):
            raise ValueError("Artwork must be a supported image no larger than 5 MiB.")
        files[asset.relative_to(package).as_posix()] = asset.read_bytes()
    return files


def build_package(output: Path, package: Path = PACKAGE) -> None:
    package = package.resolve()
    if output.resolve().is_relative_to(package):
        raise ValueError(
            "Write the generated archive outside the source package directory."
        )
    files = package_files(package)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in sorted(files.items()):
            archive.writestr(name, content)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build_package(args.output)
    print(f"Built {args.output}")
