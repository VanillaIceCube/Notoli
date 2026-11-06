const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');
const root = process.cwd();
const python = process.platform === 'win32' ? 'python' : 'python3';
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const posix = p => p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase());
function steps(action) {
  return JSON.parse(execFileSync(python, ['-c', 'import json,sys,yaml;print(json.dumps(yaml.safe_load(open(sys.argv[1],encoding="utf-8"))["runs"]["steps"]))', path.join(root, '.github/actions', action, 'action.yml')], { encoding: 'utf8' }));
}
function fixture(run, env, stubs, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch2-action-'));
  try {
    fs.mkdirSync(path.join(dir, 'bin'));
    for (const [name, body] of Object.entries(stubs)) {
      const file = path.join(dir, 'bin', name);
      fs.writeFileSync(file, '#!/bin/sh\nset -eu\n' + body + '\n'); fs.chmodSync(file, 0o755);
    }
    fs.writeFileSync(path.join(dir, 'run.sh'), run);
    fs.writeFileSync(path.join(dir, 'diff.txt'), 'quoted "change"\nsecond line');
    fs.writeFileSync(path.join(dir, 'response.json'), JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'fixture response' }] }] }));
    const values = { ...process.env, GITHUB_OUTPUT: posix(path.join(dir, 'output')), GITHUB_STEP_SUMMARY: posix(path.join(dir, 'summary')), MOCK_BIN: posix(path.join(dir, 'bin')), MOCK_CWD: posix(dir), MOCK_RESPONSE: posix(path.join(dir, 'response.json')), DIFF_PATH: posix(path.join(dir, 'diff.txt')), GIT_LOG: posix(path.join(dir, 'git.log')), ...env };
    const result = spawnSync(bash, ['-c', 'export PATH="$MOCK_BIN:$PATH"; cd "$MOCK_CWD"; bash run.sh'], { env: values, encoding: 'utf8', timeout: 15000 });
    check(result, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('Responses request construction and unavailable-output paths execute with mocked curl only', () => {
  const run = steps('openai-chat')[0].run;
  const env = { OPENAI_API_KEY: 'synthetic-key', OPENAI_PROJECT_ID: 'synthetic-project', PROMPT_PREFIX: 'prefix\n', SYSTEM_PROMPT: 'system', MODEL: 'fixture-model', MAX_OUTPUT_TOKENS: '100', ENABLE_WEB_SEARCH: 'true' };
  const stubs = { curl: 'cat "$MOCK_RESPONSE"; exit "${CURL_EXIT:-0}"', uuidgen: 'printf "fixture-id\\n"' };
  fixture(run, env, stubs, (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(fs.readFileSync(path.join(dir, 'body.json'), 'utf8'));
    assert.equal(body.input, 'prefix\nquoted "change"\nsecond line');
    assert.equal(body.instructions, 'system'); assert.equal(body.max_output_tokens, 100);
    assert.equal(body.tools[0].type, 'web_search'); assert.equal(body.tool_choice, 'required');
    assert.equal(JSON.stringify(body).includes('synthetic-key'), false);
    assert.match(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /fixture response/);
  });
  for (const extra of [{ OPENAI_API_KEY: '' }, { CURL_EXIT: '7' }]) {
    fixture(run, { ...env, ...extra }, stubs, (result, dir) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(fs.readFileSync(path.join(dir, 'summary'), 'utf8'), /unavailable/);
      assert.doesNotMatch(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /fixture response/);
    });
  }
  fixture(run, env, { ...stubs, curl: 'printf "not-json"' }, (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /not valid JSON/);
  });
});

test('prior review context separates persona history and bounded untrusted human discussion', async () => {
  const step = steps('collect-prior-ai-reviews')[0];
  const script = step.with.script.replaceAll('${{ inputs.persona_name }}', 'Fixture').replaceAll('${{ inputs.output_path }}', '/fixture/context.json').replaceAll('${{ inputs.max_reviews }}', '2');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('github', 'context', 'core', 'require', script);
  const own = id => ({ id, user: { login: 'fixture[bot]', type: 'Bot' }, submitted_at: `2026-11-0${id}`, body: 'old finding' });
  const reviews = [own(1), own(2), own(3), { id: 4, user: { login: 'human', type: 'User' }, author_association: 'OWNER', body: 'h'.repeat(7000) }, { id: 5, user: { login: 'outsider', type: 'User' }, author_association: 'NONE', body: 'untrusted outsider' }];
  const comments = [{ id: 10, user: { login: 'fixture[bot]' }, pull_request_review_id: 3, body: 'own inline' }, { id: 11, in_reply_to_id: 10, user: { login: 'human' }, body: 'r'.repeat(2000) }];
  const listReviews = () => {}, listReviewComments = () => {};
  let output;
  const github = { rest: { apps: { getAuthenticated: async () => ({ data: { slug: 'fixture' } }) }, pulls: { listReviews, listReviewComments } }, paginate: async method => method === listReviews ? reviews : comments };
  const req = name => name === 'fs' ? { mkdirSync() {}, writeFileSync(_path, text) { output = JSON.parse(text); } } : require(name);
  await run(github, { repo: { owner: 'fixture', repo: 'repo' }, payload: { pull_request: { number: 1 } } }, { warning() {} }, req);
  assert.deepEqual(output.prior_reviews.map(r => r.id), [2, 3]);
  assert.equal(output.human_reviews.length, 1); assert.equal(output.human_reviews[0].body.length, 6000);
  assert.equal(output.replies_to_prior_findings[0].body.length, 1500);
  assert.match(output.instruction.join(' '), /untrusted discussion evidence/);
  github.paginate = async () => { throw new Error('API unavailable'); };
  await assert.rejects(run(github, { repo: {}, payload: { pull_request: { number: 1 } } }, { warning() {} }, req), /API unavailable/);
});

if (fs.existsSync(path.join(root, '.github/actions/prepare-lint-commit/action.yml'))) {
  test('lint push attribution requires a valid App identity and never calls real gh or git', () => {
    const run = steps('prepare-lint-commit').find(step => step.run).run;
    const env = { APP_SLUG: 'fixture-lint', GH_TOKEN: 'synthetic-token', GITHUB_REPOSITORY: 'fixture/repo', BOT_ID: '123' };
    const stubs = { gh: 'printf "%s\\n" "$BOT_ID"', git: 'printf "%s\\n" "$@" >> "$GIT_LOG"' };
    fixture(run, env, stubs, (result, dir) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(fs.readFileSync(path.join(dir, 'output'), 'utf8'), /123\+fixture-lint\[bot\]@users.noreply.github.com/);
      assert.match(fs.readFileSync(path.join(dir, 'git.log'), 'utf8'), /remote\nset-url\n--push\norigin/);
    });
    for (const extra of [{ APP_SLUG: '' }, { BOT_ID: 'invalid' }]) fixture(run, { ...env, ...extra }, stubs, (result, dir) => {
      assert.equal(result.status, 1); assert.equal(fs.existsSync(path.join(dir, 'git.log')), false);
    });
  });
}
