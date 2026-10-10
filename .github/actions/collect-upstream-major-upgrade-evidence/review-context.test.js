"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const workflow = fs
  .readFileSync(
    path.resolve(__dirname, "../../workflows/review-code.yml"),
    "utf8",
  )
  .replaceAll("\r\n", "\n");
const contextStep = workflow.slice(
  workflow.indexOf("      - name: Build code review context"),
  workflow.indexOf("      - name: Call Obi-Wan Code-nobi"),
);
const script = contextStep
  .split("        run: |\n")[1]
  .split("\n")
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n");
const bash =
  process.platform === "win32"
    ? path.join(
        process.env.ProgramFiles || "C:/Program Files",
        "Git/bin/bash.exe",
      )
    : "bash";

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("major review context includes each dependency's tracked usage and keeps PR text inert", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "notoli-review-context-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const write = (file, contents) => {
    const target = path.join(repo, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    return target.replaceAll("\\", "/");
  };
  const git = (...args) => run("git", args, repo);
  git("init", "-q");
  git("config", "user.name", "Review fixture");
  git("config", "user.email", "fixture@example.test");
  write(
    "frontend/package.json",
    '{"dependencies":{"first":"1.0.0","last":"1.0.0"}}',
  );
  write("frontend/package-lock.json", "LOCKFILE_PAYLOAD_OLD\n");
  write(
    "frontend/src/usage.js",
    'import first from "first";\nimport last from "last";\n',
  );
  git("add", ".");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  write(
    "frontend/package.json",
    '{"dependencies":{"first":"2.0.0","last":"2.0.0"}}',
  );
  write("frontend/package-lock.json", "LOCKFILE_PAYLOAD_NEW".repeat(10000));
  git("add", ".");
  git("commit", "-qm", "major");
  const head = git("rev-parse", "HEAD");
  const scriptPath = write("context.sh", script);
  const outputPath = write("context.txt", "");
  const commonEnv = {
    ...process.env,
    BASE_SHA: base,
    HEAD_SHA: head,
    DIFF_PATH: write("linediff.txt", "A1: manifest change\n"),
    PRIOR_REVIEWS_PATH: write("prior.json", "[]"),
    CONTEXT_PATH: outputPath,
    RUNNER_TEMP: repo.replaceAll("\\", "/"),
    DEPENDABOT_PREVIOUS_VERSION: "1.0.0",
    DEPENDABOT_NEW_VERSION: "2.0.0",
    DEPENDABOT_PACKAGE_ECOSYSTEM: "npm",
    PR_BODY: "Untrusted text $(touch injected.txt)",
    UPSTREAM_EVIDENCE_PATH: write(
      "upstream.json",
      '{"release_notes":"Removed the old API."}',
    ),
  };
  for (const dependencyNames of ["last", "first, last"]) {
    run(bash, [scriptPath], repo, {
      ...commonEnv,
      DEPENDABOT_UPDATE_TYPE: "version-update:semver-major",
      DEPENDABOT_DEPENDENCY_NAMES: dependencyNames,
    });
    const context = fs.readFileSync(outputPath, "utf8");
    assert.match(context, /MAJOR UPGRADE EVIDENCE/);
    assert.match(context, /frontend\/src\/usage\.js:2:import last/);
    if (dependencyNames.includes("first")) {
      assert.match(context, /frontend\/src\/usage\.js:1:import first/);
    }
    assert.match(context, /Removed the old API/);
    assert.ok(context.includes("$(touch injected.txt)"));
    assert.ok(!fs.existsSync(path.join(repo, "injected.txt")));
    assert.ok(!context.includes("LOCKFILE_PAYLOAD"));
  }
  for (const updateType of ["version-update:semver-minor", ""]) {
    run(bash, [scriptPath], repo, {
      ...commonEnv,
      DEPENDABOT_UPDATE_TYPE: updateType,
      DEPENDABOT_DEPENDENCY_NAMES: "last",
    });
    const context = fs.readFileSync(outputPath, "utf8");
    assert.doesNotMatch(context, /MAJOR UPGRADE EVIDENCE|Removed the old API/);
    assert.ok(!context.includes("LOCKFILE_PAYLOAD"));
  }
});
