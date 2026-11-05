"""Parse explicit update types from the API-verified, signed Dependabot commit."""
import json
import re
import sys

import yaml

message = json.load(sys.stdin)
blocks = re.findall(r"(?ms)^---\r?\n(.*?)^\.\.\.[ \t]*(?:\r?\n|$)", message)
if len(blocks) != 1:
    raise ValueError("Dependabot update metadata is missing or ambiguous")
data = yaml.safe_load(blocks[0])
dependencies = data.get("updated-dependencies") if isinstance(data, dict) else None
if not isinstance(dependencies, list) or not dependencies:
    raise ValueError("Dependabot update metadata is missing")
result = []
for dependency in dependencies:
    if not isinstance(dependency, dict) or not isinstance(dependency.get("dependency-name"), str) or not dependency["dependency-name"].strip():
        raise ValueError("Dependabot update metadata is missing or incomplete")
    update_type = dependency.get("update-type")
    # SHA-only Actions updates legitimately omit update-type. They can only be
    # manually merged; never derive a semver classification from a commit SHA.
    sha_only = (
        "update-type" not in dependency
        and re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_./-]+)?", dependency["dependency-name"])
        and re.fullmatch(r"[a-f0-9]{40}", str(dependency.get("dependency-version", "")))
    )
    if update_type not in {"version-update:semver-patch", "version-update:semver-minor", "version-update:semver-major"} and not sha_only:
        raise ValueError("Dependabot update metadata is missing or invalid")
    result.append({"dependencyName": dependency["dependency-name"], "updateType": update_type, "shaOnly": bool(sha_only)})
print(json.dumps(result))
