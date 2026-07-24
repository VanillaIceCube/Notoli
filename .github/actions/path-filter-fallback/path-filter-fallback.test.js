"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  conservativeScopes,
  scopesForFiles,
} = require("./path-filter-fallback");

test("lint fallback mirrors frontend, backend, and shared-action filters", () => {
  assert.deepEqual(scopesForFiles("lint", ["frontend/src/App.js"]), {
    frontend: true,
    backend: false,
    automation: false,
    python: false,
    javascript: false,
    actions: false,
  });
  assert.deepEqual(
    scopesForFiles("lint", [".github/actions/prepare-lint-commit/action.yml"]),
    {
      frontend: true,
      backend: true,
      automation: false,
      python: false,
      javascript: false,
      actions: false,
    },
  );
});

test("test fallback enables only the affected application or automation suites", () => {
  assert.deepEqual(
    scopesForFiles("test", [
      "backend/notes/tests.py",
      ".github/actions/security-alerts/sync-security-alerts.js",
    ]),
    {
      frontend: false,
      backend: true,
      automation: true,
      python: false,
      javascript: false,
      actions: false,
    },
  );
  assert.equal(
    scopesForFiles("test", [
      ".github/actions/path-filter-fallback/path-filter-fallback.js",
    ]).automation,
    true,
  );
});

test("CodeQL fallback mirrors the workflow automation scope expansion", () => {
  assert.deepEqual(
    scopesForFiles("codeql", [".github/workflows/gate-test.yml"]),
    {
      frontend: false,
      backend: false,
      automation: false,
      python: true,
      javascript: true,
      actions: true,
    },
  );
  assert.deepEqual(scopesForFiles("codeql", ["frontend/src/App.js"]), {
    frontend: false,
    backend: false,
    automation: false,
    python: false,
    javascript: true,
    actions: false,
  });
});

test("conservative fallback runs every scope owned by the selected gate", () => {
  assert.deepEqual(conservativeScopes("lint"), {
    frontend: true,
    backend: true,
  });
  assert.deepEqual(conservativeScopes("test"), {
    frontend: true,
    backend: true,
    automation: true,
  });
  assert.deepEqual(conservativeScopes("codeql"), {
    python: true,
    javascript: true,
    actions: true,
  });
});
