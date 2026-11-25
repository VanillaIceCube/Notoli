"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("security review requires all three evidence files before the request can run", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "security-review-context-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.resolve(__dirname, "../scripts/write-security-review-context.js");
  const env = { ...process.env, CONTEXT_PATH: "context", EVIDENCE_PATH: "security", PRIOR_REVIEWS_PATH: "prior", DIFF_PATH: "diff" };
  const inputs = ["security", "prior", "diff"];
  for (const name of inputs) fs.writeFileSync(path.join(root, name), name + " fixture\n");
  const assemble = () => spawnSync(process.execPath, [script], { cwd: root, env, encoding: "utf8" });
  assert.equal(assemble().status, 0);
  const context = fs.readFileSync(path.join(root, "context"), "utf8");
  for (const name of inputs) {
    assert.ok(context.includes(name + " fixture"));
    fs.unlinkSync(path.join(root, name));
    assert.notEqual(assemble().status, 0, "missing " + name);
    fs.writeFileSync(path.join(root, name), name + " fixture\n");
  }
});
