"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { scopeAllowsSkip } = require("../scripts/check-dependabot-skip-scope");

test("repository automation documentation and helper changes cannot authorize a skip", () => {
  for (const file of ["README.md", "CHANGELOG.md", "AGENTS.md", ".github/workflows/README.md", ".github/workflows/gate-test.yml", ".github/workflows/ci-orchestrator.yml"]) {
    assert.equal(scopeAllowsSkip("Tests / Automation Tests (Node)", [file]), false, file);
  }
});

test("matches changed files against CodeQL filters", () => {
  assert.equal(scopeAllowsSkip("CodeQL / Analyze Python", ["frontend/package-lock.json"]), true);
  assert.equal(scopeAllowsSkip("CodeQL / Analyze JavaScript/TypeScript", ["backend/uv.lock"]), true);
  assert.equal(scopeAllowsSkip("CodeQL / Analyze GitHub Actions", ["README.md"]), true);
  assert.equal(scopeAllowsSkip("CodeQL / Analyze Python", []), true);
  for (const files of [ ["backend/uv.lock"], [".github/workflows/gate-codeql.yml"], [".github/actions/guard/action.yml"]]) {
    assert.equal(scopeAllowsSkip("CodeQL / Analyze Python", files), false);
  }
});

test("matches changed files against lint and test filters", () => {
  const automation = "Tests / Automation Tests (Node)";
  const frontend = "Tests / Frontend Tests (React)";
  assert.equal(scopeAllowsSkip(automation, ["frontend/package.json"]), true);
  assert.equal(scopeAllowsSkip(frontend, ["frontend/package.json"]), false);
  for (const file of [".github/package.json", ".github/package-lock.json"]) {
    assert.equal(scopeAllowsSkip(automation, [file]), false);
    assert.equal(scopeAllowsSkip(frontend, [file]), true);
  }
  for (const [name, file] of [
    ["Lints / Lint Frontend (ESLint + Prettier)", "frontend/package.json"],
    ["Lints / Lint Backend (Ruff)", "backend/uv.lock"],
    ["Tests / Frontend Tests (React)", "frontend/package-lock.json"],
    ["Tests / Backend Tests (Django)", "backend/config/settings.py"],
    ["Tests / Automation Tests (Node)", ".github/actions/publish-ai-review/action.yml"],
  ]) {
    assert.equal(scopeAllowsSkip(name, [file]), false, name);
    assert.equal(scopeAllowsSkip(name, ["LICENSE"]), true, name);
  }
});

test("requires checks for changes to the auto-merge and CI workflows", () => {
  for (const file of [".github/workflows/ci-auto-merge.yml", ".github/workflows/ci-orchestrator.yml"]) {
    assert.equal(scopeAllowsSkip("Tests / Automation Tests (Node)", [file]), false, file);
  }
});
