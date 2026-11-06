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
