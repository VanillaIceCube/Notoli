"""Authorize skips using API diff paths and the actual reviewed detector filters."""
import json
from pathlib import Path
import sys

import yaml

root = Path(__file__).resolve().parents[3]
request = json.load(sys.stdin)
name = request["name"]
files = request["files"]
mapping = {
    "Lints / Lint Frontend (ESLint + Prettier)": ("gate-lint.yml", "frontend"),
    "Lints / Lint Backend (Ruff)": ("gate-lint.yml", "backend"),
    "Tests / Frontend Tests (React)": ("gate-test.yml", "frontend"),
    "Tests / Backend Tests (Django)": ("gate-test.yml", "backend"),
    "Tests / Automation Tests (Node)": ("gate-test.yml", "automation"),
    "CodeQL / Analyze Python": ("gate-codeql.yml", "python"),
    "CodeQL / Analyze JavaScript/TypeScript": ("gate-codeql.yml", "javascript"),
    "CodeQL / Analyze GitHub Actions": ("gate-codeql.yml", "actions"),
}
workflow, scope = mapping[name]
source = yaml.safe_load((root / ".github/workflows" / workflow).read_text(encoding="utf-8"))
steps = source["jobs"]["changes"]["steps"]
filters = yaml.safe_load(next(step["with"]["filters"] for step in steps if step.get("id") == "filter"))


def relevant(selected):
    patterns = filters[selected]
    if not isinstance(patterns, list):
        raise ValueError("Unsupported detector filter structure")
    for pattern in patterns:
        if not isinstance(pattern, str) or pattern.startswith("!"):
            raise ValueError("Unsupported detector filter")
        plain = pattern[:-3] if pattern.endswith("/**") else pattern
        if any(char in plain for char in "*?[]{}!"):
            raise ValueError("Unsupported detector glob; refuse to authorize a skip")
        if any(file.startswith(plain + "/") if pattern.endswith("/**") else file == plain for file in files):
            return True
    return False


applies = relevant(scope)
if scope == "actions":
    # gate-codeql's Set analysis scope keeps Actions present for any language.
    applies = applies or relevant("python") or relevant("javascript")
print(json.dumps(not applies))
