"""Inspect YAML nodes (including flow syntax) without executing YAML tags."""
import json
import re
import sys

import yaml
from yaml.nodes import MappingNode, ScalarNode, SequenceNode


def check(text, name):
    errors = []
    lines = text.splitlines()

    def error(node, message):
        errors.append(f"{name}:{node.start_mark.line + 1}: {message}")

    try:
        document = yaml.compose(text, Loader=yaml.BaseLoader)
    except yaml.YAMLError as exc:
        return [f"{name}:{getattr(exc, 'problem_mark', None).line + 1 if getattr(exc, 'problem_mark', None) else 1}: invalid YAML"]
    visited = set()

    def walk(node):
        if node is None or id(node) in visited:
            return
        visited.add(id(node))
        if isinstance(node, MappingNode):
            keys = set()
            for key, value in node.value:
                if not isinstance(key, ScalarNode) or key.value in keys:
                    error(key, "unsupported or duplicate YAML key")
                    continue
                keys.add(key.value)
                if key.value == "<<":
                    error(key, "YAML merge keys require explicit policy review")
                if key.value == "uses":
                    if not isinstance(value, ScalarNode):
                        error(value, "uses must be a scalar")
                    elif not value.value.startswith("./"):
                        ref = value.value
                        pattern = r".+@sha256:[0-9a-f]{64}" if ref.startswith("docker://") else r".+@[0-9a-f]{40}"
                        line = lines[value.start_mark.line]
                        if not re.fullmatch(pattern, ref) or not re.search(r"\s+#\s*\S", line):
                            error(value, "external actions require an immutable SHA and readable version comment")
                if key.value == "permissions" and not isinstance(value, MappingNode):
                    error(value, "enumerate required permissions")
                if key.value == "on":
                    triggers = ([value.value] if isinstance(value, ScalarNode) else
                                [x.value for x in value.value if isinstance(x, ScalarNode)] if isinstance(value, SequenceNode) else
                                [k.value for k, _ in value.value if isinstance(k, ScalarNode)] if isinstance(value, MappingNode) else [])
                    if "pull_request_target" in triggers:
                        error(value, "privileged PR-target execution requires a separately reviewed policy")
                walk(value)
        elif isinstance(node, SequenceNode):
            for value in node.value:
                walk(value)

    walk(document)
    return errors


if __name__ == "__main__":
    data = json.load(sys.stdin)
    print(json.dumps(check(data["text"], data["name"])))
