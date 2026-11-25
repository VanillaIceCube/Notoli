"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");

const actionDirectory = path.resolve(__dirname, '../actions/setup-lint-bot');
const actionSteps = YAML.parse(fs.readFileSync(path.join(actionDirectory, 'action.yml'), 'utf8')).runs.steps;

function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'composite-action-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('lint push attribution requires a valid App identity', t => {
  const step = actionSteps.find(step => step.run);
  assert.equal(step.run.trim(), 'node "$GITHUB_ACTION_PATH/setup-lint-bot.js"');
  const { setupLintBot } = require("../actions/setup-lint-bot/setup-lint-bot");
  const output = path.join(temporaryDirectory(t), 'output');
  const env = { GITHUB_OUTPUT: output, APP_SLUG: 'fixture-lint', GH_TOKEN: 'synthetic-token', GITHUB_REPOSITORY: 'fixture/repo' };
  const calls = [];
  function run(program, args) {
    calls.push([program, ...args]);
    return { status: 0, stdout: '123\n' };
  }
  setupLintBot(env, run);
  assert.equal(fs.readFileSync(output, 'utf8'), 'bot_email=123+fixture-lint[bot]@users.noreply.github.com\n');
  assert.deepEqual(calls, [
    ['gh', 'api', '/users/fixture-lint[bot]', '--jq', '.id'],
    ['git', 'remote', 'set-url', '--push', 'origin', 'https://x-access-token:synthetic-token@github.com/fixture/repo.git'],
  ]);
  let called = false;
  assert.throws(() => setupLintBot({ ...env, APP_SLUG: '' }, () => { called = true; }), /slug is unavailable/);
  assert.equal(called, false);
  assert.throws(() => setupLintBot(env, program => {
    assert.equal(program, 'gh');
    return { status: 0, stdout: 'invalid' };
  }), /invalid bot account ID/);
});
