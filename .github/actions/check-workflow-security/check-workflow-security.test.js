const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { check, audit } = require('./check-workflow-security');
test('repository workflows and composite actions obey the immutable-reference policy', () => assert.deepEqual(audit(process.cwd()), []));
test('mutable references, absent version comments and broad/unsafe policies fail with line diagnostics', () => {
  for (const source of ['- uses: actions/checkout@v7', `- uses: actions/checkout@${'a'.repeat(40)}`, 'permissions: write-all', 'on: {pull_request_target: {}}', 'on: [pull_request_target]', 'on: "pull_request_target"', '"on": {"pull_request_target": {}}', 'steps: [{uses: actions/checkout@v7}]', 'permissions: "write-all"', 'on: [']) {
    assert.match(check(source, 'example.yml')[0], /^example.yml:1:/);
  }
});
test('PR policy is loaded from the platform base commit even when the checkout adds grants', () => {
  const { policyFor } = require('./check-workflow-security');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch2-policy-'));
  const prior = { name: process.env.GITHUB_EVENT_NAME, path: process.env.GITHUB_EVENT_PATH };
  try {
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github/workflows/example.yml'), 'permissions: {contents: read}\n');
    git('init'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(root, '.github/workflow-write-grants.json'), JSON.stringify({ '.github/workflows/example.yml': { permissions: ['contents'] } }));
    const event = path.join(root, 'event.json');
    fs.writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base } } }));
    process.env.GITHUB_EVENT_NAME = 'pull_request'; process.env.GITHUB_EVENT_PATH = event;
    assert.match(check('permissions: {contents: write}', '.github/workflows/example.yml', policyFor(root)).join('\n'), /reviewed/);
    git('add', '.github/workflow-write-grants.json'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'approved policy fixture');
    fs.writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: git('rev-parse', 'HEAD') } } }));
    assert.deepEqual(check('permissions: {contents: write}', '.github/workflows/example.yml', policyFor(root)), []);
  } finally {
    for (const [key, value] of [['GITHUB_EVENT_NAME', prior.name], ['GITHUB_EVENT_PATH', prior.path]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('local actions and reusable workflows retain local paths; verified external refs carry comments', () => {
  assert.deepEqual(check(`steps:\n- uses: ./local\n- uses: ./.github/workflows/test.yml\n- uses: actions/checkout@${'a'.repeat(40)} # v7`, 'example.yml'), []);
});
test('mapping grants cannot introduce unknown scopes, values, or unapproved writes', () => {
  for (const source of ['permissions: {contents: write}', 'permissions: {all: write}', 'permissions: {contents: admin}', 'jobs: {evil: {permissions: {issues: write}}}']) {
    assert.ok(check(source, 'example.yml').length);
  }
  assert.deepEqual(check('permissions: {contents: read, issues: none}', 'example.yml'), []);
});
test('an approved mapping cannot authorize another job through a YAML alias', () => {
  const source = 'jobs:\n  codeql: &granted\n    permissions: {security-events: write}\n  evil: *granted\n';
  assert.match(check(source, '.github/workflows/ci-orchestrator.yml').join('\n'), /aliases/);
  assert.match(check('on: &event push\nother: *event', 'example.yml').join('\n'), /aliases/);
});
test('a proposed policy cannot authorize a new write before the base policy approves it', () => {
  const source = 'permissions: {contents: write}';
  const proposed = { 'example.yml': { permissions: ['contents'] } };
  const trustedBase = {};
  assert.equal(check(source, 'example.yml', proposed).length, 0);
  assert.match(check(source, 'example.yml', trustedBase).join('\n'), /reviewed/);
});
