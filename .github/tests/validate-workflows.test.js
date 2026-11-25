"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");
const { audit, changedGrants, check, checkCodeqlPins } = require("../scripts/validate-workflows");

test("grant comparison fetches Git objects from main and drops the token before examining immutable revisions", () => {
  const manifest = YAML.parse(fs.readFileSync(path.resolve(__dirname, "../workflows/ci-auto-merge.yml"), "utf8"));
  const steps = manifest.jobs["dependabot-auto-merge"].steps;
  const checkouts = steps.filter(step => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkouts.length, 1);
  assert.equal(checkouts[0].with.ref, "main");
  assert.equal(checkouts[0].with["persist-credentials"], false);
  const step = steps.find(item => item.name === "Compare workflow write grants using reviewed main code");
  assert.equal(step.shell, "node {0}");
  assert.deepEqual(step.env, {
    GH_TOKEN: "${{ github.token }}", BASE_SHA: "${{ steps.pr.outputs.base_sha }}",
    HEAD_SHA: "${{ steps.pr.outputs.head_sha }}", PR_NUMBER: "${{ steps.pr.outputs.number }}",
  });
  const run = new Function("require", "process", step.run);
  const base = "a".repeat(40), head = "b".repeat(40);
  const env = { BASE_SHA: base, HEAD_SHA: head, PR_NUMBER: "17", GH_TOKEN: "fixture-token" };
  const commands = [];
  function load(name) {
    assert.equal(name, "node:child_process");
    return { execFileSync(program, args) { commands.push({ program, args, token: env.GH_TOKEN }); } };
  }
  run(load, { env, execPath: process.execPath });
  assert.deepEqual(commands, [
    { program: "git", args: ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential",
      "fetch", "--no-tags", "--depth=1", "origin", base, "refs/pull/17/head"], token: "fixture-token" },
    { program: process.execPath, args: [".github/scripts/validate-workflows.js", "--compare-workflow-grants", base, head], token: undefined },
  ]);
  for (const override of [{ BASE_SHA: "main" }, { HEAD_SHA: "HEAD" }, { PR_NUMBER: "refs/heads/main" }]) {
    assert.throws(() => run(load, { env: { ...env, ...override } }), /Invalid pull request or commit reference/);
    assert.equal(commands.length, 2);
  }
});

const workflow = ".github/workflows/example.yml";

const revision = "a".repeat(40);

test("policy errors identify the source line", () => {
  for (const snippet of [
    "- uses: actions/checkout@v7",
    "- uses: actions/checkout@" + revision,
    "permissions: write-all", "permissions: {contents: admin}", "permissions: {unknown: write}",
    "on: [pull_request_target]", 'on: {"pull_request_target": {}}', 'on: "pull_request_target"',
    "on: [", "on: push\non: pull_request", "on: &trigger push\nother: *trigger",
    "jobs: {a: &job {permissions: {issues: write}}, b: *job}",
  ]) {
    assert.match(check(snippet, "example.yml")[0], /^example\.yml:\d+:/, snippet);
  }
  assert.match(check("on: push\nsteps:\n- uses: actions/checkout@v7", "example.yml")[0], /^example\.yml:3:/);
});

test("local references and pinned actions are valid", () => {
  const source = [
    "permissions: {contents: read, issues: none}", "steps:",
    "- uses: ./.github/actions/setup-uv", "- uses: ./.github/workflows/example.yml",
    "- uses: actions/checkout@" + revision + " # v7",
  ].join("\n");
  assert.deepEqual(check(source, workflow), []);
  assert.match(check("jobs: {}", workflow)[0], /explicit workflow-level permissions/);
});

test("write permission is scoped to the same workflow and job", () => {
  const base = "permissions: {checks: write}\njobs: {lint: {}, build: {permissions: {contents: read}}}";
  for (const [proposal, problem] of [
    [base, null],
    ["permissions: {}\njobs: {lint: {permissions: {checks: write}}}", null],
    ["permissions: {checks: write}\njobs: {other: {}}", "jobs.other requests checks: write"],
    ["permissions: {checks: write}\njobs: {build: {}}", "jobs.build requests checks: write"],
    ["permissions: {}\njobs: {lint: {permissions: {issues: write}}}", "jobs.lint requests issues: write"],
  ]) {
    const result = changedGrants(base, proposal, workflow);
    if (problem) assert.ok(result.join("\n").includes(problem), problem);
    else assert.deepEqual(result, []);
  }
  assert.deepEqual(changedGrants(null, "permissions: {contents: read}", workflow), []);
  assert.match(changedGrants(null, "permissions: {contents: write}", workflow)[0], /workflow requests contents: write/);
  const old = "jobs: {lint: {permissions: {checks: write}}}";
  assert.deepEqual(changedGrants(old, "permissions: {}\n" + old, workflow), []);
});

test("Dependabot updates all CodeQL entry points together", () => {
  const config = YAML.parse(fs.readFileSync(path.join(__dirname, "../dependabot.yml"), "utf8"));
  const updates = config.updates.find((item) => item["package-ecosystem"] === "github-actions");
  for (const [group, kind] of [["codeql", "version-updates"], ["codeql-security", "security-updates"]]) {
    const rule = updates.groups[group];
    assert.equal(rule["applies-to"], kind);
    for (const pattern of ["github/codeql-action", "github/codeql-action/*"]) assert.ok(rule.patterns.includes(pattern));
  }
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function git(...args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  }
  function write(name, source) {
    const destination = path.join(root, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
  }
  function commit() {
    git("add", ".github");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false",
      "commit", "--quiet", "-m", "workflow fixture");
    return git("rev-parse", "HEAD");
  }
  git("init", "--quiet");
  return { root, write, commit };
}

test("compares immutable Git objects even if working files change", (t) => {
  const { root, write, commit } = fixture(t);
  write(workflow, "permissions: {contents: read}");
  const base = commit();
  write(workflow, "permissions: {contents: write}");
  const head = commit();
  write(workflow, "permissions: {contents: read}");
  function compare(first, last) {
    return spawnSync(process.execPath, [require.resolve("../scripts/validate-workflows"), "--compare-workflow-grants", first, last], {
      cwd: root, encoding: "utf8",
    });
  }
  assert.equal(compare(base, base).status, 0);
  const result = compare(base, head);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow requests contents: write/);
  assert.notEqual(compare("0".repeat(40), head).status, 0);
});

test("audits the layout, referenced scripts and reachable composite actions", (t) => {
  const { root, write } = fixture(t);
  const command = ".github/scripts/run-example.js";
  const call = "permissions: {}\njobs:\n  test:\n    steps:\n      - uses: ./.github/actions/example\n      - run: node " + command + "\n";
  write(command, "process.exitCode = 0;\n");
  write(workflow, call);
  write(".github/actions/example/example.js", "");
  write(".github/actions/example/action.yml", "runs: {using: composite, steps: [{shell: bash, run: node $GITHUB_ACTION_PATH/example.js}]}");
  write(".github/tests/example.test.js", "");
  write(".github/tests/run-example.test.js", "");
  write(".github/fixtures/example.yml", "on: ["); // Data fixtures are outside policy discovery.
  assert.deepEqual(audit(root), []);
  const oldCommand = ".github/workflows/scripts/run-example.js";
  write(workflow, call.replace(command, oldCommand));
  assert.ok(audit(root).includes(workflow + ": missing workflow script " + oldCommand));
  write(workflow, call.replace("actions/example", "actions/missing") + "      - run: node .github/scripts/run-missing.js\n");
  write(".github/actions/example/example.test.js", "");
  write(".github/actions/orphan/check.js", "");
  write(".github/workflows/nested/bad.yml", "");
  write(".github/scripts/nested/run-example.js", "");
  write(".github/scripts/old.py", "");
  write(".github/actions/example/old.sh", "");
  write(".github/actions/example/action.yml", "runs: {using: composite, steps: [{run: node $GITHUB_ACTION_PATH/missing.js}]}");
  write(".github/tests/untested.js", "");
  write(".github/tests/integration/unwired.test.js", "");
  write(".github/tests/no-owner.test.js", "");
  write(".github/old.sh", "");
  write(".github/tests/fixtures/example.json", "{}");
  write(".github/fixtures/example.test.js", "");
  write(".github/fixtures/review_Bodies.json", "{}");
  write(".github/workflows/embedded.yml", "permissions: {}\njobs:\n  read:\n    steps:\n      - run: |\n          python3 - <<'PY'\n          print(1)\n          PY\n");
  write(".github/actions/loop/action.yml", "runs: {using: composite, steps: [{uses: ./.github/actions/loop}]}");
  const report = audit(root).join("\n");
  for (const problem of [
    "local uses target", "missing workflow script", "no local workflow or action calls",
    "each reusable action needs", "keep automation tests", "directly in .github/workflows",
    "directly in .github/scripts", "<implementation-name>.test.js", "test discovery",
    ".github/tests/integration/unwired.test.js: test discovery",
    ".github/tests/no-owner.test.js: name the test after its script, action implementation or workflow",
    "composite run step needs its shell", "missing action implementation",
    "embedded Python or JavaScript", ".github/actions/loop: no local workflow",
    ".github/fixtures/review_Bodies.json: use a lowercase, hyphen-separated fixture name",
    ".github/old.sh:", ".github/scripts/old.py:", ".github/actions/example/old.sh:", ".github/fixtures/example.test.js:",
  ]) {
    assert.ok(report.includes(problem), problem + "\n" + report);
  }
});

test("composite steps invoke the adjacent JavaScript entry point named for their directory", (t) => {
  const { root, write } = fixture(t);
  write(workflow, "permissions: {}\njobs: {build: {steps: [{uses: ./.github/actions/example}]}}");
  const directory = ".github/actions/example";
  const manifest = directory + "/action.yml";
  const run = (file) => ({ shell: "bash", run: 'node "$GITHUB_ACTION_PATH/' + file + '"' });
  const githubScript = (script) => ({ uses: "actions/github-script@" + revision, with: { script } });
  function action(step) {
    const source = YAML.stringify({ description: "example.js", runs: { using: "composite", steps: [step] } });
    write(manifest, source.replace("actions/github-script@" + revision, "actions/github-script@" + revision + " # v9"));
  }

  write(directory + "/helper.js", "module.exports = {};\n");
  action(run("helper.js"));
  assert.ok(audit(root).includes(manifest + ": missing primary action implementation example.js"));
  write(directory + "/example.js", "require('./helper.js');\n");
  for (const step of [
    run("helper.js"),
    { shell: "bash", run: '# node "$GITHUB_ACTION_PATH/example.js"\nnode "$GITHUB_ACTION_PATH/helper.js"' },
    githubScript("// require(process.env.GITHUB_WORKSPACE + '/.github/actions/example/example.js')"),
    githubScript("require(process.env.GITHUB_WORKSPACE + '/.github/actions/other/example.js')"),
  ]) {
    action(step);
    assert.ok(audit(root).includes(manifest + ": a composite step must invoke example.js"));
  }
  for (const step of [
    run("example.js"),
    githubScript("require(process.env.GITHUB_WORKSPACE + '/.github/actions/example/example.js')"),
    githubScript("require(\n  `${process.env.GITHUB_WORKSPACE}/.github/actions/example/example.js`,\n)"),
  ]) {
    action(step);
    assert.deepEqual(audit(root), []);
  }
});

test("CodeQL entry points use one immutable revision across YAML files", (t) => {
  const { root, write } = fixture(t);
  for (const entry of ["init", "analyze"]) write(".github/workflows/" + entry + ".yml", "- uses: GitHub/CodeQL-Action/" + entry + "@" + revision);
  assert.equal(checkCodeqlPins(root), 2);
  const extra = ".github/actions/example/action.yml";
  for (const step of [
    "- {uses: github/codeql-action/upload-sarif@REF}",
    '- "uses": github/codeql-action/upload-sarif@REF',
    "- uses: >-\n    github/codeql-action/upload-sarif@REF",
    "- value: &ref github/codeql-action/upload-sarif@REF\n- uses: *ref",
  ]) {
    write(extra, step.replace("REF", revision));
    assert.equal(checkCodeqlPins(root), 3);
    for (const [pin, error] of [["v4", /immutable SHA/], ["abc1234", /immutable SHA/], ["b".repeat(40), /revisions differ/]]) {
      write(extra, step.replace("REF", pin));
      assert.throws(() => checkCodeqlPins(root), error);
    }
  }
  write(extra, "");
  write(".github/workflows/analyze.yml", "");
  assert.throws(() => checkCodeqlPins(root), /Missing CodeQL analyze/);
});
