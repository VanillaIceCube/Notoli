"""Read action references structurally, including flow YAML, aliases and folded scalars."""
import json
import sys

import yaml


def references(value, seen):
    if not isinstance(value, (dict, list)) or id(value) in seen:
        return
    seen.add(id(value))
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "uses" and isinstance(child, str):
                yield child
            yield from references(child, seen)
    else:
        for child in value:
            yield from references(child, seen)


sources = json.load(sys.stdin)
print(json.dumps({name: list(references(yaml.safe_load(source), set())) for name, source in sources.items()}))
