# =============================================================
# environment_manager.py
#
# Purpose:
#   Generate a *stable*, always-the-same-format Conda environment.yml
#   that:
#     - pins Python to the exact current env Python version
#     - always uses pip via requirements.txt (never conda-resolves pip deps)
#     - writes requirements.txt containing ONLY “top-level” pip installs
#       (not the full dependency tree)
#     - avoids the weird `package @ file:///...` style lines by default
#
# Inspiration / credit:
#   This script was inspired by ideas from conda export helper scripts such as
#   Andres Berejnoi's `conda_export.py` gist and derivative variants.
#   This implementation is a fresh rewrite with a different output contract:
#   it *always* emits a minimal conda env + pip -r requirements.txt layout.
# =============================================================

from __future__ import annotations

import argparse
import os
import pathlib
import re
import subprocess
import sys
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Tuple

# ruamel.yaml is used because we want consistent formatting and we want to
# reliably include comments in the resulting file.
try:
    from ruamel.yaml import YAML
    from ruamel.yaml.comments import CommentedMap, CommentedSeq
except ImportError as e:
    raise SystemExit(
        "Missing dependency: ruamel.yaml\n\n"
        "Install it in your current environment:\n"
        "  pip install ruamel.yaml\n"
    ) from e


# ----------------------------
# helpers: subprocess
# ----------------------------


def _run(cmd: Sequence[str], *, check: bool = True) -> subprocess.CompletedProcess:
    """Run a command and return CompletedProcess with stdout text."""
    cp = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if check and cp.returncode != 0:
        raise RuntimeError(
            f"Command failed ({cp.returncode}): {' '.join(cmd)}\n\n"
            f"STDOUT:\n{cp.stdout}\n\nSTDERR:\n{cp.stderr}\n"
        )
    return cp


def _which(executable: str) -> bool:
    from shutil import which

    return which(executable) is not None


# ----------------------------
# pip requirements extraction
# ----------------------------

_PEP440_NAME_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$")


def _normalize_freeze_line(line: str) -> Optional[str]:
    """
    Keep only safe, stable requirement lines.

    - Accept: name==version
    - Reject by default: `name @ file:///...`, `-e ...`, direct URLs, local paths, etc.
    """
    s = line.strip()
    if not s or s.startswith("#"):
        return None

    # Reject editable / direct refs here (handled optionally elsewhere).
    if (
        s.startswith("-e ")
        or " @ " in s
        or "://" in s
        or s.startswith(".")
        or s.startswith("/")
    ):
        return None

    # Keep only name==version
    if "==" not in s:
        return None

    name, ver = s.split("==", 1)
    name = name.strip()
    ver = ver.strip()
    if not name or not ver:
        return None
    if not _PEP440_NAME_RE.match(name):
        return None
    return f"{name}=={ver}"


def _pip_top_level_freeze(
    *, exclude: Iterable[str], include_editable: bool
) -> List[str]:
    """
    Get "top-level" pip installs (not required by any other package).

    Uses:
      pip list --not-required --format=freeze

    This is the closest “pip-installed by me” signal pip provides without
    external tooling or lockfiles. It avoids pulling the entire dependency tree.
    """
    if not _which("pip"):
        raise RuntimeError("pip not found on PATH. Activate the env first.")

    # Top-level packages only
    cp = _run(["pip", "list", "--not-required", "--format=freeze"])
    lines = cp.stdout.splitlines()

    # Optionally include editable lines (still filtered to avoid @ file:// noise)
    editable_lines: List[str] = []
    if include_editable:
        cp2 = _run(["pip", "freeze", "--exclude-editable"], check=False)
        # Note: we *exclude* editables via pip option and still can’t reconstruct
        # the -e entries safely without adding @/paths. If you truly need -e,
        # store them manually in requirements.txt. This flag is kept for forward
        # compatibility, but currently does not add -e entries.
        _ = cp2  # placeholder

    cleaned: List[str] = []
    exclude_lc = {e.lower() for e in exclude}
    for raw in lines:
        norm = _normalize_freeze_line(raw)
        if not norm:
            continue
        name = norm.split("==", 1)[0].strip().lower()
        if name in exclude_lc:
            continue
        cleaned.append(norm)

    # stable ordering
    cleaned = sorted(set(cleaned), key=lambda x: x.lower())
    if editable_lines:
        cleaned.extend(editable_lines)
    return cleaned


# ----------------------------
# conda environment info
# ----------------------------


def _current_conda_env_name() -> str:
    # Best effort: CONDA_DEFAULT_ENV is set in activated envs
    name = os.environ.get("CONDA_DEFAULT_ENV")
    if name:
        return name

    # fallback to conda info
    if _which("conda"):
        cp = _run(["conda", "info", "--json"])
        import json

        info = json.loads(cp.stdout)
        # active_prefix_name is usually present
        return info.get("active_prefix_name") or "conda_env"
    return "conda_env"


def _current_python_version() -> str:
    # Prefer conda list python for exact version in env.
    if _which("conda"):
        cp = _run(["conda", "list", "python", "--json"])
        import json

        rows = json.loads(cp.stdout)
        for r in rows:
            if r.get("name") == "python" and r.get("version"):
                return str(r["version"]).strip()

    # Fallback to runtime
    v = sys.version_info
    return f"{v.major}.{v.minor}.{v.micro}"


@dataclass(frozen=True)
class OutputPaths:
    env_yml: pathlib.Path
    requirements_txt: pathlib.Path


def _resolve_paths(
    output_env_yml: str, requirements_path: Optional[str]
) -> OutputPaths:
    env_path = pathlib.Path(output_env_yml).resolve()

    if requirements_path:
        req_path = pathlib.Path(requirements_path).resolve()
    else:
        # default: requirements.txt next to environment.yml
        req_path = env_path.with_name("requirements.txt")

    return OutputPaths(env_yml=env_path, requirements_txt=req_path)


# ----------------------------
# YAML writing
# ----------------------------


def _build_env_yaml(
    *,
    env_name: str,
    python_version: str,
    channels: List[str],
    requirements_filename: str,
) -> Tuple[str, str]:
    """
    Returns: (yaml_text_without_footer_comments, footer_comment_block)
    """
    y = YAML()
    y.indent(mapping=2, sequence=4, offset=2)
    y.width = 4096  # avoid line wrapping surprises

    root = CommentedMap()
    root["name"] = env_name

    ch = CommentedSeq()
    for c in channels:
        ch.append(c)
    root["channels"] = ch

    deps = CommentedSeq()
    deps.append(f"python={python_version}")
    deps.append("pip")
    deps.append(CommentedMap({"pip": CommentedSeq([f"-r {requirements_filename}"])}))
    root["dependencies"] = deps

    # Dump to string
    import io

    buf = io.StringIO()
    y.dump(root, buf)
    yaml_text = buf.getvalue().rstrip() + "\n"

    footer = (
        "\n"
        "# Update env + requirements.txt (pip packages go into requirements.txt)\n"
        f"# `python {str(pathlib.Path(__file__).as_posix())} export --from-history --use-versions -o {requirements_filename and ''}`\n"
        "# Overwrite environment from yaml\n"
        "# `conda env update --file backend/environment.yml --prune`\n"
    )

    # The footer includes a command line placeholder above; we’ll overwrite it
    # with the real one in the caller where we know the output path.
    return yaml_text, footer


def _write_text(path: pathlib.Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _write_requirements(path: pathlib.Path, pkgs: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(f"{p}\n" for p in pkgs)
    path.write_text(text, encoding="utf-8")


# ----------------------------
# CLI
# ----------------------------


def _cli() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="environment_manager.py",
        description="Export a minimal conda environment.yml + top-level pip requirements.txt.",
    )

    sub = p.add_subparsers(dest="command", required=True)

    exp = sub.add_parser("export", help="Write environment.yml + requirements.txt")
    exp.add_argument(
        "-o",
        "--output",
        default="environment.yml",
        help="Path to write environment.yml (default: ./environment.yml)",
    )
    exp.add_argument(
        "--requirements-output",
        default=None,
        help="Optional requirements.txt output path (default: alongside environment.yml)",
    )
    exp.add_argument(
        "-n",
        "--env-name",
        default=None,
        help="Environment name in environment.yml (default: current active env name)",
    )
    exp.add_argument(
        "--python-version",
        default=None,
        help="Override python version pin (default: current env python version)",
    )
    exp.add_argument(
        "--channels",
        nargs="*",
        default=["conda-forge", "defaults"],
        help="Channels to write (default: conda-forge defaults)",
    )
    exp.add_argument(
        "--exclude",
        nargs="*",
        default=["pip", "setuptools", "wheel"],
        help="Exclude these packages from requirements.txt (default: pip setuptools wheel)",
    )
    exp.add_argument(
        "--include-editable",
        action="store_true",
        help="Attempt to include editable installs (limited; see script notes).",
    )
    exp.add_argument(
        "--print",
        action="store_true",
        help="Also print resulting files to stdout.",
    )

    sub.add_parser(
        "install-help", help="Print the install/update commands you should run"
    )

    return p.parse_args()


# ----------------------------
# commands
# ----------------------------


def cmd_export(args: argparse.Namespace) -> None:
    paths = _resolve_paths(args.output, args.requirements_output)

    env_name = args.env_name or _current_conda_env_name()
    python_version = args.python_version or _current_python_version()

    # Requirements: top-level only, stable name==version lines
    reqs = _pip_top_level_freeze(
        exclude=args.exclude, include_editable=args.include_editable
    )

    # Write requirements first so the env references a real file name
    _write_requirements(paths.requirements_txt, reqs)

    # env.yml always references requirements by *filename* (portable)
    requirements_filename = paths.requirements_txt.name

    # Build YAML
    y = YAML()
    y.indent(mapping=2, sequence=4, offset=2)
    y.width = 4096

    root = CommentedMap()
    root["name"] = env_name
    root["channels"] = CommentedSeq(list(args.channels))

    deps = CommentedSeq()
    deps.append(f"python={python_version}")
    deps.append("pip")
    deps.append(CommentedMap({"pip": CommentedSeq([f"-r {requirements_filename}"])}))
    root["dependencies"] = deps

    import io

    buf = io.StringIO()
    y.dump(root, buf)
    yaml_text = buf.getvalue().rstrip() + "\n"

    # Footer comment block (with *correct* commands)
    # Assume user runs from the backend/ folder for brevity.
    env_yml_display = paths.env_yml.name
    req_display = paths.requirements_txt.name

    footer = (
        "\n"
        "# Update env + requirements.txt (pip packages go into requirements.txt)\n"
        f"# `python {pathlib.Path(__file__).name} export -o {env_yml_display}`\n"
        "# Overwrite environment from yaml\n"
        f"# `conda env update --file {env_yml_display} --prune`\n"
        "# Fresh create from yaml\n"
        f"# `conda env create --file {env_yml_display}`\n"
        "# Note: conda will run pip and install -r requirements.txt from the pip section.\n"
        f"# (requirements file written to: {req_display})\n"
    )

    _write_text(paths.env_yml, yaml_text + footer)

    if args.print:
        print("----- environment.yml -----")
        print((yaml_text + footer).rstrip())
        print("\n----- requirements.txt -----")
        print(paths.requirements_txt.read_text(encoding="utf-8").rstrip())


def cmd_install_help() -> None:
    # Keep it generic; user wanted the command(s) to install/update.
    print(
        "Install / create (first time):\n"
        "  conda env create --file backend/environment.yml\n\n"
        "Update in-place (prune removed deps):\n"
        "  conda env update --file backend/environment.yml --prune\n\n"
        "Notes:\n"
        "  - The environment.yml uses a pip section with `-r requirements.txt`.\n"
        "  - Conda will call pip during env create/update, so pip packages come from requirements.txt.\n"
    )


def main() -> None:
    args = _cli()

    if args.command == "export":
        cmd_export(args)
    elif args.command == "install-help":
        cmd_install_help()
    else:
        raise SystemExit(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
