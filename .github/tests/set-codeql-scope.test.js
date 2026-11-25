"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test('workflow executes accurate PR scope and full scheduled and manual scope', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../workflows/gate-codeql.yml'), 'utf8').replaceAll('\r\n', '\n');
  assert.match(workflow, /- name: Set analysis scope[\s\S]*?run: node \.github\/scripts\/set-codeql-scope\.js/);
  const script = path.join(__dirname, '../scripts/set-codeql-scope.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-scope-'));
  try {
    for (const [event, python, javascript, actions, expected] of [
      ['pull_request', 'false', 'false', 'false', ['false', 'false', 'false']],
      ['pull_request', 'true', 'false', 'false', ['true', 'false', 'true']],
      ['pull_request', 'false', 'true', 'false', ['false', 'true', 'true']],
      ['pull_request', 'false', 'false', 'true', ['false', 'false', 'true']],
      ['schedule', '', '', '', ['true', 'true', 'true']],
      ['workflow_dispatch', '', '', '', ['true', 'true', 'true']],
      ['pull_request', '', '', '', null],
    ]) {
      const output = path.join(directory, 'output');
      fs.writeFileSync(output, '');
      const result = spawnSync(process.execPath, [script], { env: { ...process.env, GITHUB_OUTPUT: output, EVENT_NAME: event, PYTHON_SCOPE: python, JAVASCRIPT_SCOPE: javascript, ACTIONS_SCOPE: actions }, encoding: 'utf8' });
      assert.equal(result.status, expected ? 0 : 1, result.stderr);
      const values = Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map((line) => line.split('=')));
      if (expected) {
        assert.equal(values.scope_status, 'success');
        assert.deepEqual([values.python, values.javascript, values.actions], expected);
      } else assert.equal(values.scope_status, undefined);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
