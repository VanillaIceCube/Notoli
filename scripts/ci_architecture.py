"""Check documentation's workflow contracts and snapshot without running CI code."""
import argparse
import hashlib
import json
from pathlib import Path
import re

import yaml


def inventory(root):
    result = {"workflows": {}, "custom_action_consumers": {}}
    files = sorted((root / ".github/workflows").glob("*.yml"))
    files += sorted((root / ".github/actions").glob("*/action.y*ml"))
    for file in files:
        text = file.read_text(encoding="utf-8")
        data = yaml.load(text, Loader=yaml.BaseLoader)
        relative = file.relative_to(root).as_posix()
        if file.parent == root / ".github/workflows":
            result["workflows"][file.name] = {
                "name": data.get("name"),
                "source_sha256": hashlib.sha256(text.encode()).hexdigest(),
                "events": data.get("on", {}),
                "permissions": data.get("permissions", {}),
                "jobs": {
                    name: {key: value for key, value in job.items() if key in {"name", "needs", "uses", "if", "permissions"}}
                    for name, job in data.get("jobs", {}).items()
                },
                "credential_names": sorted(set(re.findall(r"\bsecrets\.([A-Z][A-Z0-9_]*)", text))),
                "variable_names": sorted(set(re.findall(r"\bvars\.([A-Z][A-Z0-9_]*)", text))),
            }
        for target in re.findall(r"uses:\s*(\./\.github/actions/[^\s]+)", text):
            folder = root / target[2:]
            if not (folder / "action.yml").is_file() and not (folder / "action.yaml").is_file():
                raise ValueError(f"Missing documented custom action: {relative} -> {target}")
            result["custom_action_consumers"].setdefault(target, []).append(relative)
    result["custom_action_consumers"] = {
        action: sorted(set(consumers))
        for action, consumers in result["custom_action_consumers"].items()
    }
    return result


def as_list(value):
    return value if isinstance(value, list) else [value] if value else []


def contracts(data, root):
    workflows = data["workflows"]
    ci = workflows["ci-orchestrator.yml"]
    events = ci["events"]
    infrastructure = "deploy-gateway.yml" in workflows
    boundary = events.get("pull_request", {})
    production_excluded = boundary.get("branches") == ["main"] if infrastructure else "env-prod" in boundary.get("branches-ignore", [])
    if "pull_request" not in events or not production_excluded:
        raise ValueError("PR-path diagram no longer matches orchestrator event/production boundary")
    jobs = ci["jobs"]
    for job in ["lints", "tests", "codeql", "dependency-vulnerability", "dependency-malware", "code-review", "build-review", "security-review"]:
        if job not in jobs:
            raise ValueError(f"Missing diagram job: {job}")
    if set(as_list(jobs["build-review"].get("needs"))) != {"lints", "tests"}:
        raise ValueError("Build-review diagram dependency drift")
    expected = {"codeql", "dependency-vulnerability", "dependency-malware"}
    if infrastructure:
        expected.add("secrets")
        if jobs.get("result", {}).get("name") != "Required CI" or "gate-secrets.yml" not in workflows:
            raise ValueError("Infrastructure Required CI/secret-scan diagram drift")
    if set(as_list(jobs["security-review"].get("needs"))) != expected:
        raise ValueError("Security-review diagram dependency drift")
    for name in ["review-code.yml", "review-build.yml", "review-security.yml"]:
        if set(workflows[name]["events"]) != {"workflow_call"}:
            raise ValueError(f"Reviewer event/trust diagram drift: {name}")
    for name in ["alert-codeql.yml", "alert-vulnerability.yml", "alert-malware.yml"]:
        if set(workflows[name]["events"]) != {"schedule", "workflow_dispatch"}:
            raise ValueError(f"Scheduled-alert diagram drift: {name}")
        for schedule in workflows[name]["events"]["schedule"]:
            if schedule["cron"].split()[2:] != ["*", "*", "*"]:
                raise ValueError("Daily-alert diagram drift")
    codeql = workflows["gate-codeql.yml"]["events"]
    if "main" not in codeql.get("push", {}).get("branches", []) or not {"schedule", "workflow_dispatch"}.issubset(codeql):
        raise ValueError("Default-branch/manual/scheduled CodeQL diagram drift")
    deploy = workflows["deploy-gateway.yml" if infrastructure else "ci-deploy.yml"]["events"]
    if deploy.get("push", {}).get("branches") != ["env-prod"] or "workflow_dispatch" not in deploy:
        raise ValueError("Production/manual diagram drift")
    summary = workflows["promotion-summary.yml"]["events"]
    if set(summary) != {"workflow_run", "workflow_dispatch"} or summary["workflow_run"] != {"workflows": ["Promotion summary request"], "types": ["completed"]}:
        raise ValueError("Trusted promotion summary event diagram drift")
    request = workflows["promotion-summary-request.yml"]
    if request["events"].get("pull_request", {}).get("branches") != ["env-prod"] or request["events"].get("push", {}).get("branches") != ["env-prod"] or request["permissions"] != {"contents": "read"}:
        raise ValueError("Read-only promotion listener boundary drift")
    raw_request = (root / ".github/workflows/promotion-summary-request.yml").read_text(encoding="utf-8")
    raw_summary = (root / ".github/workflows/promotion-summary.yml").read_text(encoding="utf-8")
    if "uses:" in raw_request or "secrets." in raw_request or "ref: main" not in raw_summary or "persist-credentials: false" not in raw_summary:
        raise ValueError("Promotion summary must never execute a PR checkout or request artifact/cache")
    document = (root / "docs/CI-CD-ARCHITECTURE.md").read_text(encoding="utf-8")
    diagrams = re.findall(r"```mermaid\n(.*?)```", document, flags=re.S)
    if len(diagrams) != 4 or not all(text.startswith("flowchart ") for text in diagrams):
        raise ValueError("Expected the four maintained Mermaid architecture diagrams")
    # These four small flowcharts use one explicit edge per line. Validate key
    # relationships against the workflow contracts above, not merely the fences.
    edges = [set(re.findall(r"^\s*(\w+)(?:\[[^\]\n]*\])?\s*-->(?:\|[^|\n]*\|)?\s*(\w+)", text, flags=re.M)) for text in diagrams]
    build_sources = {"lints": "LintTest", "tests": "LintTest"}
    security_sources = {"codeql": "Scanners", "dependency-vulnerability": "Scanners", "dependency-malware": "Scanners", "secrets": "Secrets"}
    required = [
        {("Human", "CI"), ("Dependabot", "CI"), ("Fork", "Isolated"), ("CI", "Obi"), ("Obi", "Gate"), ("Lint", "Gate"), ("Robo", "Gate")}
        | {(build_sources[job], "Lint") for job in as_list(jobs["build-review"].get("needs"))}
        | {(security_sources[job], "Robo") for job in as_list(jobs["security-review"].get("needs"))},
        {("Human", "Collector"), ("Prior", "Collector"), ("Collector", "Request"), ("Checks", "Request"), ("Request", "Luna"), ("Luna", "Schema"), ("Schema", "Publish"), ("Schema", "Reconcile"), ("Reconcile", "Proof"), ("Proof", "Own"), ("Luna", "Usage")},
        {("Schedule", "Feeds"), ("Feeds", "Source"), ("Source", "Robo"), ("Robo", "Validate"), ("Validate", "Issues"), ("Issues", "Project")},
        {("Reviewed", "PR"), ("PR", "Request"), ("Request", "Trusted"), ("Trusted", "Summary"), ("PR", "Gates"), ("Gates", "Merge"), ("Merge", "Gateway" if infrastructure else "App"), ("Manual", "Gateway" if infrastructure else "App"), ("Recovery", "RecoveryGuard"), ("RecoveryGuard", "Verify")},
    ]
    if infrastructure:
        required[0] |= {("CI", "Secrets"), ("Secrets", "Gate"), ("Gate", "RequiredCI"), ("RequiredCI", "Main")}
    else:
        required[0] |= {("Gate", "Main"), ("Gate", "Auto"), ("Auto", "Platform")}
    for index, (actual, expected_edges) in enumerate(zip(edges, required)):
        if not expected_edges.issubset(actual):
            raise ValueError(f"Mermaid diagram {index + 1} edge drift from checked workflow contracts")
    for action in ["collect-prior-ai-reviews", "openai-chat", "publish-ai-review"]:
        consumers = set(data["custom_action_consumers"].get("./.github/actions/" + action, []))
        if not {".github/workflows/" + name for name in ["review-code.yml", "review-build.yml", "review-security.yml"]}.issubset(consumers):
            raise ValueError("Reviewer diagram/custom-action consumer drift")
    for target in re.findall(r"\]\((\.\./[^)#]+)(?:#[^)]*)?\)", document):
        if not (root / "docs" / target).is_file():
            raise ValueError(f"Broken local architecture source link: {target}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    data = inventory(root)
    contracts(data, root)
    target = root / "docs/CI-CD-SOURCE-INVENTORY.json"
    text = json.dumps(data, indent=2, sort_keys=True) + "\n"
    if args.check:
        if target.read_text(encoding="utf-8") != text:
            raise ValueError("Workflow architecture inventory drift; review diagrams and regenerate with python scripts/ci_architecture.py")
        print("CI architecture source inventory and diagram contracts match")
    else:
        target.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
