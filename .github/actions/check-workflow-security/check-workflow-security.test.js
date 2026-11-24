const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { check, audit } = require('./check-workflow-security');
test('repository workflows and composite actions obey the immutable-reference policy', () => assert.deepEqual(audit(process.cwd()), []));
test('mutable references, absent version comments and broad/unsafe policies fail with line diagnostics', () => {
  for (const source of ['- uses: actions/checkout@v7', `- uses: actions/checkout@${'a'.repeat(40)}`, 'permissions: write-all', 'on: {pull_request_target: {}}', 'on: [pull_request_target]', 'on: "pull_request_target"', '"on": {"pull_request_target": {}}', 'steps: [{uses: actions/checkout@v7}]', 'permissions: "write-all"', 'on: [']) {
    assert.match(check(source, 'example.yml')[0], /^example.yml:1:/);
  }
});
test('local actions and reusable workflows retain local paths; verified external refs carry comments', () => {
  assert.deepEqual(check(`steps:\n- uses: ./local\n- uses: ./.github/workflows/test.yml\n- uses: actions/checkout@${'a'.repeat(40)} # v7`, 'example.yml'), []);
});
test('explicit permissions accept valid scopes and reject unknown scopes or levels', () => {
  for (const source of ['permissions: {all: write}', 'permissions: {contents: admin}']) {
    assert.match(check(source, 'example.yml')[0], /unknown permission scope or grant/);
  }
  assert.deepEqual(check('permissions: {contents: read, issues: none}', 'example.yml'), []);
});
test('effective write permissions cannot expand beyond the same trusted workflow and job', () => {
  const path = '.github/workflows/example.yml';
  const base = 'permissions: {contents: read, checks: write}\njobs: {lint: {runs-on: linux}, build: {permissions: {contents: read}}}';
  const compare = (before, after) => check(after, path, before);
  assert.deepEqual(compare(base, base), []);
  assert.match(compare(base, 'jobs: {lint: {runs-on: linux}}').join('\n'), /explicit workflow-level permissions/);
  assert.match(compare(null, 'jobs: {lint: {permissions: {contents: read}}}').join('\n'), /explicit workflow-level permissions/);
  assert.deepEqual(compare('jobs: {lint: {permissions: {checks: write}}}', 'permissions: {}\njobs: {lint: {permissions: {checks: write}}}'), []);
  assert.deepEqual(compare(base, 'permissions: {}\njobs: {lint: {permissions: {checks: write}}}'), []);
  assert.deepEqual(compare(null, 'permissions: {contents: read}'), []);
  assert.match(compare(null, 'permissions: {contents: write}').join('\n'), /workflow requests contents: write/);
  assert.match(compare(base, 'permissions: {}\njobs: {lint: {permissions: {pull-requests: write}}}').join('\n'), /jobs.lint requests pull-requests: write/);
  assert.match(compare(base, 'permissions: {checks: write}\njobs: {new: {runs-on: linux}}').join('\n'), /jobs.new requests checks: write/);
  assert.match(compare(base, 'permissions: {checks: write}\njobs: {build: {runs-on: linux}}').join('\n'), /jobs.build requests checks: write/);
});
test('the grant check reads exact Git blobs and fails closed on missing history', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-grants-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Workflow test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgSign', 'false');
  const dir = path.join(root, '.github', 'workflows');
  fs.mkdirSync(dir, { recursive: true });
  const workflow = path.join(dir, 'example.yml');
  fs.writeFileSync(workflow, 'permissions: {contents: read}\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'baseline');
  const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(workflow, 'permissions: {contents: write}\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'proposal');
  const head = git('rev-parse', 'HEAD');
  fs.writeFileSync(workflow, 'permissions: {contents: read}\n');
  const compare = (from, to) => spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    [path.join(__dirname, 'check.py'), '--compare-workflow-grants', from, to], { cwd: root, encoding: 'utf8' });
  assert.equal(compare(base, base).status, 0);
  const result = compare(base, head);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /workflow requests contents: write/);
  fs.writeFileSync(workflow, 'jobs: {build: {runs-on: ubuntu-latest}}\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'remove explicit workflow permissions');
  const missing = compare(base, git('rev-parse', 'HEAD'));
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /explicit workflow-level permissions/);
  assert.notEqual(compare('0'.repeat(40), head).status, 0);
});
test('YAML aliases cannot reuse permission or trigger declarations', () => {
  const source = 'jobs:\n  codeql: &granted\n    permissions: {security-events: write}\n  evil: *granted\n';
  assert.match(check(source, '.github/workflows/ci-orchestrator.yml').join('\n'), /aliases/);
  assert.match(check('on: &event push\nother: *event', 'example.yml').join('\n'), /aliases/);
});

const root = path.resolve(__dirname, "../../..");
function checkCodeqlPins(sources) {
  const directory = sources ? fs.mkdtempSync(path.join(os.tmpdir(), "codeql-pins-")) : root;
  try {
    if (sources) {
      const workflows = path.join(directory, ".github");
      fs.mkdirSync(workflows);
      for (const [name, content] of Object.entries(sources)) {
        const filename = path.extname(name) ? name : name + ".yml";
        fs.writeFileSync(path.join(workflows, filename), content);
      }
    }
    const output = execFileSync(process.platform === "win32" ? "python" : "python3",
      [path.join(__dirname, "check.py"), "--check-codeql-pins"], {
        cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      });
    return Number(output.match(/Verified (\d+) aligned immutable CodeQL references\./)[1]);
  } finally {
    if (sources) fs.rmSync(directory, { recursive: true, force: true });
  }
}

const sha = "a".repeat(40);
const source = (entry, pin = sha) => `  - uses: github/codeql-action/${entry}@${pin}\n`;

test("all repository CodeQL references remain immutable and aligned", () => {
  assert.ok(checkCodeqlPins());
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

test("case-variant GitHub owner/repository names cannot bypass pin validation", () => {
  const mixed = `- uses: GitHub/CodeQL-Action/init@${sha}\n- uses: GITHUB/CODEQL-ACTION/analyze@${sha}\n`;
  assert.equal(checkCodeqlPins({ gate: mixed }), 2);
  assert.throws(() => checkCodeqlPins({ gate: mixed.replace(sha, "v4") }), /immutable SHA/);
  assert.throws(() => checkCodeqlPins({ gate: mixed.replace(sha, "b".repeat(40)) }), /revisions differ/);
});

test("valid YAML flow mappings, quoted keys, folded scalars and aliases cannot evade validation", () => {
  for (const declaration of [
    '- { uses: github/codeql-action/upload-sarif@v4 }\n',
    '- "uses": github/codeql-action/upload-sarif@v4\n',
    '- uses: >-\n    github/codeql-action/upload-sarif@v4\n',
    '- value: &ref github/codeql-action/upload-sarif@v4\n- uses: *ref\n',
    '- "u\\u0073es": "github/codeql-\\u0061ction/upload-sarif@v4"\n',
  ]) {
    assert.throws(() => checkCodeqlPins({ valid: source("init") + source("analyze"), other: declaration }), /immutable SHA/);
    assert.throws(() => checkCodeqlPins({ valid: source("init") + source("analyze"), other: declaration.replace("@v4", `@${"b".repeat(40)}`) }), /revisions differ/);
    assert.equal(checkCodeqlPins({ valid: source("init") + source("analyze"), other: declaration.replace("@v4", `@${sha}`) }), 3);
  }
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
  assert.match(gate, /run: python3 \.github\/actions\/check-workflow-security\/check.py --check-codeql-pins/);
});
