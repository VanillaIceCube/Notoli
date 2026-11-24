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
  assert.deepEqual(compare(base, 'jobs: {lint: {permissions: {checks: write}}}'), []);
  assert.deepEqual(compare(null, 'permissions: {contents: read}'), []);
  assert.match(compare(null, 'permissions: {contents: write}').join('\n'), /workflow requests contents: write/);
  assert.match(compare(base, 'jobs: {lint: {permissions: {pull-requests: write}}}').join('\n'), /jobs.lint requests pull-requests: write/);
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
  assert.notEqual(compare('0'.repeat(40), head).status, 0);
});
test('YAML aliases cannot reuse permission or trigger declarations', () => {
  const source = 'jobs:\n  codeql: &granted\n    permissions: {security-events: write}\n  evil: *granted\n';
  assert.match(check(source, '.github/workflows/ci-orchestrator.yml').join('\n'), /aliases/);
  assert.match(check('on: &event push\nother: *event', 'example.yml').join('\n'), /aliases/);
});
