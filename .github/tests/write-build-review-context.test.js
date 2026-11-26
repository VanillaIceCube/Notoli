"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("build reviews include the reported gate logs and fail on a missing log", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "build-review-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "prior"), "prior review");
  fs.writeFileSync(path.join(directory, "diff"), "changed line");

  const run = (lint, tests) => spawnSync(process.execPath, [
    path.join(__dirname, "../scripts/write-build-review-context.js"),
  ], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env, PRIOR_REVIEWS_PATH: "prior", DIFF_PATH: "diff", CONTEXT_PATH: "context",
      LINT_RESULT: "success", TEST_RESULT: "failure",
      LINT_EVIDENCE: JSON.stringify(lint), TEST_EVIDENCE: JSON.stringify(tests),
    },
  });
  for (const [lint, suite] of [
    ["lint_frontend", "test_backend"], ["lint_infrastructure", "test_release"],
  ]) {
    const result = run(
      { [lint + "_status"]: "success", [lint + "_log"]: "lint output" },
      { [suite + "_status"]: "failure", [suite + "_log"]: "failed assertion" },
    );
    assert.equal(result.status, 0, result.stderr);
    const context = fs.readFileSync(path.join(directory, "context"), "utf8");
    assert.ok(context.includes(lint + "_log ---\nlint output"));
    assert.ok(context.includes(suite + "_status: failure"));
    assert.ok(context.includes(suite + "_log ---\nfailed assertion"));
  }

  const incomplete = run({}, { test_release_status: "failure" });
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /Missing diagnostic log for test_release/);
});
