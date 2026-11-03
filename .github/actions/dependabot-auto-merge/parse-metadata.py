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
    if not isinstance(dependency, dict) or not dependency.get("dependency-name") or not dependency.get("update-type"):
        raise ValueError("Dependabot update metadata is missing or incomplete")
    result.append({"dependencyName": dependency["dependency-name"], "updateType": dependency["update-type"]})
print(json.dumps(result))
