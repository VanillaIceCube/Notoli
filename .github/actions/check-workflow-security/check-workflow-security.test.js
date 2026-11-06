const assert = require('node:assert/strict');
const test = require('node:test');
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
