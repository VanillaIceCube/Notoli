const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");

const github = path.resolve(__dirname, "..");
const actionDir = path.join(github, "actions/get-pr-diff");
const action = YAML.parse(fs.readFileSync(path.join(actionDir, "action.yml"), "utf8"));
const entry = action.runs.steps.find(step => step.id === "diff").run.match(/^node "\$GITHUB_ACTION_PATH\/([\w-]+\.js)"$/);
assert.ok(entry, "Expected the diff step to execute its Node entry point.");
const script = path.join(actionDir, entry[1]);
const defaultBudget = Number(action.inputs.max_bytes.default);
const lockfile = "frontend/package-lock.json";

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "review-diff-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo");
  const runner = path.join(temp, "runner");
  fs.mkdirSync(repo);
  fs.mkdirSync(runner);
  function git(...args) {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  }
  function write(name, content) {
    const file = path.join(repo, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  function commit() {
    git("add", "-A");
    git("commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  }
  git("init", "--quiet");
  git("config", "user.name", "Diff fixture");
  git("config", "user.email", "fixture@example.test");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  git("config", "core.abbrev", "7");
  write(lockfile, '{"lockfileVersion":3}\n');
  write("frontend/package.json", '{"name":"fixture"}\n');
  write("src/example.js", "first\nold\nthird\n");
  const base = commit();

  function diff(head, { budget = defaultBudget, omit = true, baseRef = base, expectFailure = false } = {}) {
    const output = path.join(runner, "output");
    const summary = path.join(runner, "summary");
    fs.writeFileSync(output, "");
    fs.writeFileSync(summary, "");
    const env = { ...process.env, RUNNER_TEMP: runner, BASE_SHA: baseRef, HEAD_SHA: head,
      MAX_BYTES: String(budget), OMIT_FRONTEND_NPM_LOCKFILE: String(omit), GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
    const result = spawnSync(process.execPath, [script], { cwd: repo, env, encoding: "utf8" });
    if (result.error) throw result.error;
    if (expectFailure) {
      assert.notEqual(result.status, 0);
      assert.equal(fs.readFileSync(output, "utf8"), "");
      return;
    }
    assert.equal(result.status, 0, result.stderr);
    const outputs = Object.fromEntries(fs.readFileSync(output, "utf8").trimEnd().split("\n").map(line => {
      const equals = line.indexOf("=");
      return [line.slice(0, equals), line.slice(equals + 1)];
    }));
    const dir = path.dirname(outputs.linediff_path);
    assert.equal(path.dirname(dir), runner);
    return { outputs, env, stdout: result.stdout,
      read: name => fs.readFileSync(path.join(dir, name), "utf8"),
      size: name => fs.statSync(path.join(dir, name)).size,
      summary: fs.readFileSync(summary, "utf8") };
  }
  return { repo, runner, git, write, commit, diff, base };
}

test("a large generated lockfile preserves source, right-side lines and auxiliary context", t => {
  const { repo, runner, write, commit, diff } = fixture(t);
  write(lockfile, JSON.stringify({ padding: "x".repeat(700_000) }));
  write("frontend/package.json", '{"name":"updated"}\n');
  write("src/example.js", "first\nnew\nthird\n");
  write("pr.diff", "repository-owned content\n");
  const { outputs, size, read, summary, env } = diff(commit(), { budget: 524288 });
  assert.equal(outputs.truncated, "false");
  assert.ok(size("pr_full.diff") > 524288);
  assert.ok(Number(outputs.diff_bytes) < 524288);
  assert.equal(outputs.excluded_files, lockfile);
  assert.equal(fs.readFileSync(path.join(repo, "pr.diff"), "utf8"), "repository-owned content\n");
  assert.doesNotMatch(read("pr.diff"), /package-lock\.json/);
  assert.match(read("pr.diff"), /frontend\/package\.json/);
  const lined = read("pr_lines.diff");
  for (const expected of ["A2: new", "R1: first", "D: old", "R3: third", "DIFF LEGEND",
    'Generated lockfile payloads excluded: ["frontend/package-lock.json"]',
    "have NOT been inspected", "Dependency Review and dependency malware review"]) assert.ok(lined.includes(expected), expected);
  assert.match(summary, /Generated lockfile payloads excluded/);

  const prior = path.join(runner, "prior.json");
  const context = path.join(runner, "context.txt");
  fs.writeFileSync(prior, "[]");
  const result = spawnSync(process.execPath, [path.join(github, "scripts/write-code-review-context.js")], {
    cwd: repo, encoding: "utf8", env: { ...env, CONTEXT_PATH: context, EXCLUDED_FILES: outputs.excluded_files,
      PRIOR_REVIEWS_PATH: prior, DIFF_PATH: outputs.linediff_path, DEPENDABOT_UPDATE_TYPE: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  const contents = fs.readFileSync(context, "utf8");
  assert.doesNotMatch(contents, /x{100}/);
  assert.match(contents, /generated lockfile payload excluded/);
  assert.match(contents, /A2: new/);
});

test("lockfile-only changes disclose the empty source and dependency evidence policy", t => {
  const { write, commit, diff } = fixture(t);
  write(lockfile, '{"lockfileVersion":3,"packages":{}}\n');
  const { outputs, read, summary } = diff(commit());
  assert.equal(outputs.diff_bytes, "0");
  assert.equal(outputs.truncated, "false");
  assert.match(read("pr_lines.diff"), /No source diff remains/);
  assert.match(summary, /Do not infer dependency safety/);
});

test("other lockfiles count towards the source budget", t => {
  const { write, commit, diff } = fixture(t);
  write("package-lock.json", "root-lockfile\n" + "x".repeat(3000));
  write("frontend/yarn.lock", "other-lockfile\n");
  const { outputs, size, read } = diff(commit(), { budget: 512 });
  assert.equal(outputs.excluded_files, "");
  assert.equal(outputs.truncated, "true");
  assert.equal(size("pr.diff"), 512);
  assert.match(read("pr_full.diff"), /yarn\.lock/);
});

test("the npm lockfile remains reviewable without opt-in", t => {
  const { write, commit, diff } = fixture(t);
  write(lockfile, '{"lockfileVersion":3,"packages":{}}\n');
  const { outputs, read } = diff(commit(), { omit: false });
  assert.equal(outputs.excluded_files, "");
  assert.ok(read("pr.diff").includes(lockfile));
});

test("source over a custom byte budget remains incomplete", t => {
  const { write, commit, diff } = fixture(t);
  write("src/example.js", "source line\n".repeat(1000));
  const { outputs, size, stdout } = diff(commit(), { budget: 1024 });
  assert.equal(outputs.truncated, "true");
  assert.ok(Number(outputs.diff_bytes) > 1024);
  assert.equal(size("pr.diff"), 1024);
  assert.match(stdout, /Truncated to 1024 bytes/);
});

test("a symlink at the generated path is reviewed", t => {
  const { git, write, diff } = fixture(t);
  write(lockfile, "source.js");
  const blob = git("hash-object", "-w", lockfile);
  git("update-index", "--cacheinfo", `120000,${blob},${lockfile}`);
  git("commit", "-qm", "symlink fixture");
  const { outputs, read } = diff(git("rev-parse", "HEAD"));
  assert.equal(outputs.excluded_files, "");
  assert.match(read("pr.diff"), /120000/);
});

test("renaming the lockfile to source retains its content", t => {
  const { git, commit, diff } = fixture(t);
  git("mv", lockfile, "src/former-lock.js");
  const { read } = diff(commit());
  assert.match(read("pr.diff"), /src\/former-lock\.js/);
  assert.match(read("pr_lines.diff"), /A1: {"lockfileVersion":3}/);
});

test("invalid revisions and Git failures leave action outputs unpublished", t => {
  const { diff, base } = fixture(t);
  for (const baseRef of ["invalid-commit", "0".repeat(40)]) diff(base, { baseRef, expectFailure: true });
});

test("real Git diffs remain complete up to the default 2 MB boundary", t => {
  const { write, commit, diff } = fixture(t);
  assert.equal(defaultBudget, 2_000_000);
  write("budget.txt", "x\n");
  const initial = diff(commit(), { omit: false });
  const overhead = initial.size("pr.diff") - 1;
  for (const bytes of [defaultBudget - 1, defaultBudget, defaultBudget + 1]) {
    write("budget.txt", "x".repeat(bytes - overhead) + "\n");
    const { outputs, size, stdout } = diff(commit(), { omit: false });
    assert.equal(Number(outputs.max_bytes), defaultBudget);
    assert.equal(Number(outputs.diff_bytes), bytes);
    assert.equal(size("pr.diff"), Math.min(defaultBudget, bytes));
    assert.equal(outputs.truncated, String(bytes > defaultBudget));
    assert.equal(stdout.includes("Truncated to 2000000 bytes"), bytes > defaultBudget);
  }
});
