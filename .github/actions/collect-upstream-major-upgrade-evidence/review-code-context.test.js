"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("code review context searches every dependency within the existing evidence limits", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-context-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workflow = fs.readFileSync(path.join(__dirname, "../../workflows/review-code.yml"), "utf8");
  const step = workflow.split("      - name: Build code review context")[1].split(/^      - (?:name:|uses:)/m)[0];
  const script = step.split("        run: |")[1].trimEnd()
    .replace(/^          /gm, "").replace(/\r/g, "");
  fs.writeFileSync(path.join(root, "build-context.sh"), script);
  fs.writeFileSync(path.join(root, "app.js"), 'import "alpha";\nimport "omega";\n' +
    "oversized " + "x".repeat(31000) + " past-limit\n");
  fs.writeFileSync(path.join(root, "package-lock.json"), "alpha omega excluded-lockfile-content\n");
  fs.writeFileSync(path.join(root, "untracked.js"), "alpha omega excluded-untracked-content\n");
  for (const file of ["diff", "prior", "upstream"]) fs.writeFileSync(path.join(root, file), "{}");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("add", "app.js", "package-lock.json");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture");
  const head = git("rev-parse", "HEAD").trim();
  const run = (names, type = "version-update:semver-major") => {
    execFileSync(process.env.TEST_BASH || "bash", ["build-context.sh"], {
      cwd: root,
      env: {
        ...process.env,
        BASE_SHA: head,
        HEAD_SHA: head,
        CONTEXT_PATH: "context",
        DIFF_PATH: "diff",
        EXCLUDED_FILES: "",
        PRIOR_REVIEWS_PATH: "prior",
        RUNNER_TEMP: ".",
        DEPENDABOT_UPDATE_TYPE: type,
        DEPENDABOT_DEPENDENCY_NAMES: names,
        UPSTREAM_EVIDENCE_PATH: "upstream",
        PR_BODY: "",
      },
    });
    return fs.readFileSync(path.join(root, "context"), "utf8");
  };

  assert.match(run("omega"), /exact matches for omega ---\napp\.js:2:import "omega"/);
  const group = run("alpha, , omega");
  assert.match(group, /exact matches for alpha ---\napp\.js:1:import "alpha"/);
  assert.match(group, /exact matches for omega ---\napp\.js:2:import "omega"/);
  assert.doesNotMatch(group, /excluded-lockfile-content|excluded-untracked-content/);
  assert.doesNotMatch(run(" , "), /exact matches for|no exact tracked-text matches/);
  assert.doesNotMatch(run("omega", "version-update:semver-minor"), /DEPENDABOT MAJOR UPGRADE EVIDENCE/);
  const bounded = run("oversized");
  assert.match(bounded, /\[truncated: dependency-usage evidence was \d+ bytes\]/);
  assert.doesNotMatch(bounded, /past-limit/);
});
