"""Regression tests for diagram drift without changing any checkout files."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("ci_architecture", ROOT / "scripts/ci_architecture.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ArchitectureTests(unittest.TestCase):
    def test_diagram_only_dependency_change_fails(self):
        target = ROOT / "docs/CI-CD-ARCHITECTURE.md"
        original = Path.read_text
        document = target.read_text(encoding="utf-8")
        self.assertIn("LintTest --> Lint[", document)
        changed = document.replace("LintTest --> Lint[", "CI --> Lint[")
        def read(path, *args, **kwargs):
            return changed if path == target else original(path, *args, **kwargs)
        with patch.object(Path, "read_text", read):
            with self.assertRaisesRegex(ValueError, "Mermaid diagram 1 edge drift"):
                MODULE.contracts(MODULE.inventory(ROOT), ROOT)

    def test_workflow_dependency_change_fails(self):
        data = copy.deepcopy(MODULE.inventory(ROOT))
        data["workflows"]["ci-orchestrator.yml"]["jobs"]["build-review"]["needs"] = ["codeql"]
        with self.assertRaisesRegex(ValueError, "Build-review diagram dependency drift"):
            MODULE.contracts(data, ROOT)

    def test_privileged_pr_event_cannot_replace_trusted_consumer(self):
        data = copy.deepcopy(MODULE.inventory(ROOT))
        data["workflows"]["promotion-summary.yml"]["events"] = {"pull_request": {}}
        with self.assertRaisesRegex(ValueError, "Trusted promotion summary event diagram drift"):
            MODULE.contracts(data, ROOT)
