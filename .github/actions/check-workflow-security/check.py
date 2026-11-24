"""Inspect YAML nodes (including flow syntax) without executing YAML tags."""
import json
import re
import subprocess
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

    scopes = {"actions", "artifact-metadata", "attestations", "checks", "contents",
              "deployments", "discussions", "id-token", "issues", "models", "packages",
              "pages", "pull-requests", "repository-projects", "security-events",
              "statuses", "vulnerability-alerts"}

    def walk(node):
        if node is None:
            return
        if id(node) in visited:
            error(node, "YAML aliases require explicit declarations in each policy context")
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
                if key.value == "permissions":
                    if not isinstance(value, MappingNode):
                        error(value, "enumerate required permissions")
                    else:
                        for scope, level in value.value:
                            if (not isinstance(scope, ScalarNode) or scope.value not in scopes
                                    or not isinstance(level, ScalarNode) or level.value not in {"read", "write", "none"}):
                                error(scope, "unknown permission scope or grant")
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


def effective_writes(source):
    workflow = yaml.load(source, Loader=yaml.BaseLoader)
    if not isinstance(workflow, dict):
        raise ValueError("workflow must be a YAML mapping")

    def writes(permissions):
        if not isinstance(permissions, dict):
            raise ValueError("workflow permissions must enumerate scopes")
        return {scope for scope, level in permissions.items() if level == "write"}

    defaults = workflow.get("permissions", {})
    result = {None: writes(defaults)}
    for job, definition in workflow.get("jobs", {}).items():
        result[job] = writes(definition.get("permissions", defaults))
    return result


def changed_grants(base_text, proposed_text, path):
    approved = effective_writes(base_text) if base_text is not None else {}
    errors = []
    for job, writes in effective_writes(proposed_text).items():
        for scope in sorted(writes - approved.get(job, set())):
            context = f"jobs.{job}" if job is not None else "workflow"
            errors.append(f"{path}: {context} requests {scope}: write outside the trusted base grant")
    return errors


def workflow_blobs(revision):
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ValueError("expected an exact GitHub commit SHA")
    records = subprocess.check_output(["git", "ls-tree", "-z", revision + "^{commit}", "--", ".github/workflows/"])
    blobs = {}
    for record in records.split(b"\0"):
        if not record:
            continue
        metadata, filename = record.split(b"\t", 1)
        mode, kind, oid = metadata.split(b" ")
        path = filename.decode("utf-8")
        if not path.endswith((".yml", ".yaml")):
            continue
        if kind != b"blob" or mode not in (b"100644", b"100755"):
            raise ValueError(f"{path}: expected a regular workflow file")
        blobs[path] = oid.decode("ascii")
    return blobs


def compare_commits(base, head):
    before = workflow_blobs(base)
    after = workflow_blobs(head)
    errors = []

    def read(oid):
        size = int(subprocess.check_output(["git", "cat-file", "-s", oid]))
        if size > 1024 * 1024:
            raise ValueError("workflow exceeds the one MiB inspection limit")
        return subprocess.check_output(["git", "cat-file", "blob", oid]).decode("utf-8")

    for path, oid in after.items():
        if before.get(path) == oid:
            continue
        proposed = read(oid)
        invalid = check(proposed, path)
        if invalid:
            errors.extend(invalid)
            continue
        errors.extend(changed_grants(read(before[path]) if path in before else None, proposed, path))
    return errors


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--compare-workflow-grants":
        problems = compare_commits(sys.argv[2], sys.argv[3])
        if problems:
            raise SystemExit("\n".join(problems))
        print("Workflow write grants are within the trusted base permissions.")
    else:
        data = json.load(sys.stdin.buffer)
        result = check(data["text"], data["name"])
        if not result and "base_text" in data:
            result = changed_grants(data["base_text"], data["text"], data["name"])
        print(json.dumps(result))
