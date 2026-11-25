"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");
const { payload, metrics } = require("../actions/request-ai-response/request-ai-response");

test("OpenAI review requests reserve a bounded output budget", () => {
  const actionPath = path.resolve(__dirname, "../actions/request-ai-response/action.yml");
  const action = fs.readFileSync(actionPath, "utf8");

  assert.match(action, /max_output_tokens:[\s\S]*?default: "16000"/);
  assert.match(
    action,
    /MAX_OUTPUT_TOKENS: \$\{\{ inputs\.max_output_tokens \}\}/,
  );
  assert.match(action, /request-ai-response\.js/);
  const request = fs.readFileSync(path.resolve(__dirname, "../actions/request-ai-response/request-ai-response.js"), "utf8");
  assert.match(request, /payload\(env, prompt\)/);
  assert.match(request, /max_output_tokens: budget/);
  assert.match(action, /enable_web_search:[\s\S]*?default: "false"/);
  assert.match(
    action,
    /ENABLE_WEB_SEARCH: \$\{\{ inputs\.enable_web_search \}\}/,
  );
  assert.match(request, /type: "web_search"/);
  assert.match(request, /search_context_size: "medium"/);
  assert.match(request, /tool_choice: "required"/);
});

const env = { MODEL: 'gpt-6-luna', SYSTEM_PROMPT: 'policy', MAX_OUTPUT_TOKENS: '16000', ENABLE_WEB_SEARCH: 'false' };

test('accepted model/effort payloads and owner token limits validate without silent substitutions', () => {
  assert.equal(payload(env, 'untrusted diff').reasoning.effort, 'medium');
  for (const effort of ['none', 'low', 'medium', 'high', 'xhigh', 'max']) assert.equal(payload({ ...env, REASONING_EFFORT: effort }, '').reasoning.effort, effort);
  for (const override of [{ MODEL: 'unknown' }, { REASONING_EFFORT: 'ultra' }, { MAX_OUTPUT_TOKENS: 'NaN' }, { MAX_OUTPUT_TOKENS: '128001' }, { ENABLE_WEB_SEARCH: 'yes' }]) assert.throws(() => payload({ ...env, ...override }, ''));
});

test('telemetry distinguishes measured tokens/latency, dated estimate and unknown billed total', () => {
  const r = metrics({ model: 'gpt-6-luna', service_tier: 'default', usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 100 }, output_tokens_details: { reasoning_tokens: 50 } } }, 2345, env);
  assert.equal(r.estimated_known_token_cost_usd, 0.000191);
  assert.equal(r.request_latency_ms, 2345); assert.equal(r.total_billed_cost_usd, null);
  assert.equal(metrics({}, 20, env).input_tokens, null);
  assert.equal(metrics({}, 20, env).estimated_known_token_cost_usd, null);
  assert.equal(metrics({ usage: { input_tokens: 1, output_tokens: 1 } }, 1, env).estimated_known_token_cost_usd, null);
  assert.doesNotMatch(JSON.stringify(r), /untrusted diff|sk-/);
});

test('valid non-object JSON and long-context usage remain unknown rather than throwing or underpricing', () => {
  for (const response of [null, [], 1, true, 'private response']) {
    const result = metrics(response, 1, env);
    assert.equal(result.input_tokens, null); assert.equal(result.estimated_known_token_cost_usd, null);
  }
  assert.equal(metrics({ model: 'gpt-6-luna', service_tier: 'default', usage: { input_tokens: 272001, output_tokens: 1, input_tokens_details: { cached_tokens: 0 } } }, 1, env).estimated_known_token_cost_usd, null);
});

const actionDirectory = path.resolve(__dirname, '../actions/request-ai-response');
const actionSteps = YAML.parse(fs.readFileSync(path.join(actionDirectory, 'action.yml'), 'utf8')).runs.steps;

function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'composite-action-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('Responses action validates requests and handles unavailable output without a live provider', async t => {
  const step = actionSteps[0];
  assert.equal(step.run.trim(), 'node "$GITHUB_ACTION_PATH/request-ai-response.js"');
  const { run } = require("../actions/request-ai-response/request-ai-response");
  const dir = temporaryDirectory(t);
  const diff = path.join(dir, 'diff.txt');
  fs.writeFileSync(diff, 'quoted "change"\nsecond line');
  const base = {
    OPENAI_API_KEY: 'synthetic-key', OPENAI_PROJECT_ID: 'synthetic-project', PROMPT_PREFIX: 'prefix\n',
    SYSTEM_PROMPT: 'system', MODEL: 'gpt-6-luna', MAX_OUTPUT_TOKENS: '100', ENABLE_WEB_SEARCH: 'true',
    DIFF_PATH: diff, GITHUB_OUTPUT: path.join(dir, 'output'), GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
  };
  async function invoke(overrides, send) {
    fs.writeFileSync(base.GITHUB_OUTPUT, '');
    fs.writeFileSync(base.GITHUB_STEP_SUMMARY, '');
    await run({ ...base, ...overrides }, send);
    return {
      output: fs.readFileSync(base.GITHUB_OUTPUT, 'utf8'),
      summary: fs.readFileSync(base.GITHUB_STEP_SUMMARY, 'utf8'),
    };
  }
  let request;
  const https = require('node:https');
  const { Readable, Writable } = require('node:stream');
  t.mock.method(https, 'request', (url, options, respond) => {
    request = { url, options };
    return new Writable({
      write(chunk, _encoding, callback) { request.body = JSON.parse(chunk); callback(); },
      final(callback) {
        const response = { output: [{ type: 'message', content: [{ type: 'output_text', text: 'fixture response' }] }] };
        respond(Readable.from([Buffer.from(JSON.stringify(response))]));
        callback();
      },
    });
  });
  const success = await invoke({});
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer synthetic-key');
  assert.equal(request.options.headers['OpenAI-Project'], 'synthetic-project');
  const body = request.body;
  assert.equal(body.input, 'prefix\nquoted "change"\nsecond line');
  assert.equal(body.instructions, 'system');
  assert.equal(body.max_output_tokens, 100);
  assert.equal(body.tools[0].type, 'web_search');
  assert.equal(body.tool_choice, 'required');
  assert.doesNotMatch(JSON.stringify(body), /synthetic-key/);
  assert.match(success.output, /fixture response/);
  let contacted = false;
  const missing = await invoke({ OPENAI_API_KEY: '' }, () => { contacted = true; });
  assert.equal(contacted, false);
  assert.match(missing.output, /Missing secret\(s\): OPENAI_API_KEY/);
  assert.match(missing.summary, /unavailable/);
  for (const [send, expected] of [
    [async () => { throw new Error('private transport details'); }, /request failed before a response/],
    [async () => 'not-json', /not valid JSON/],
    [async () => 'null', /did not return a response/],
    [async () => '{"error":{"message":"private provider details"}}', /provider rejected the request/],
  ]) {
    const result = await invoke({}, send);
    assert.match(result.output, expected);
    assert.match(result.summary, /unavailable/);
    assert.match(result.summary, /"input_tokens": null/);
    assert.doesNotMatch(result.output + result.summary, /private (transport|provider) details/);
  }
});
