"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { checkCodeqlPins, workflowSources } = require("./check-codeql-pins");
const root = path.resolve(__dirname, "../../..");
const sha = "a".repeat(40);
const source = (entry, pin = sha) => `  - uses: github/codeql-action/${entry}@${pin}\n`;

test("all repository CodeQL references remain immutable and aligned", () => {
  assert.ok(checkCodeqlPins(workflowSources(path.join(root, ".github"))));
});

test("rejects split init/analyze upgrades and drift in other workflows or entry points", () => {
  for (const entry of ["init", "analyze", "autobuild", "upload-sarif"]) {
    assert.throws(() => checkCodeqlPins({
      "gate.yml": source("init") + source("analyze"),
      "other.yaml": source(entry, "b".repeat(40)),
    }), /revisions differ/);
  }
});

test("rejects tags, short SHAs and missing CodeQL analysis", () => {
  for (const pin of ["v4", "v4.39.1", "abcdef0"]) {
    assert.throws(() => checkCodeqlPins({ gate: source("init", pin) + source("analyze") }), /immutable SHA/);
  }
  assert.throws(() => checkCodeqlPins({ gate: source("init") }), /Missing CodeQL analyze/);
  assert.throws(() => checkCodeqlPins({}), /Missing CodeQL init/);
});

test("allows an atomic upgrade without hard-coding a release version", () => {
  assert.equal(checkCodeqlPins({ gate: source("init", "b".repeat(40)) + source("analyze", "b".repeat(40)) }), 2);
});

test("version and security updates group every CodeQL entry point", () => {
  const config = fs.readFileSync(path.join(root, ".github/dependabot.yml"), "utf8");
  for (const group of ["codeql", "codeql-security"]) {
    const block = config.match(new RegExp(`      ${group}:\\r?\\n((?:        .*\\r?\\n)+)`))[1];
    assert.match(block, /"github\/codeql-action"/);
    assert.match(block, /"github\/codeql-action\/\*"/);
    assert.match(block, new RegExp(`applies-to: ${group === "codeql" ? "version" : "security"}-updates`));
  }
  const gate = fs.readFileSync(path.join(root, ".github/workflows/gate-codeql.yml"), "utf8");
  assert.match(gate, /run: node \.github\/actions\/check-codeql-pins\/check-codeql-pins.js/);
  assert.match(gate, /node --test \.github\/actions\/check-codeql-pins\/check-codeql-pins.test.js/);
});
