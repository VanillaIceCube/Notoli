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
const load = name => JSON.parse(execFileSync(python, ['-c', 'import json,sys,yaml;print(json.dumps(yaml.load(open(sys.argv[1],encoding="utf-8"),Loader=yaml.BaseLoader)))', name], { encoding: 'utf8' }));
const manifest = load('.github/actions/security-alerts/action.yml');
const openai = load('.github/actions/openai-chat/action.yml');
const defaults = { model: 'gpt-6-luna', 'reasoning-effort': 'medium', 'max-output-tokens': '16000' };
const variables = { model: 'AI_REVIEW_MODEL', 'reasoning-effort': 'AI_REVIEW_REASONING_EFFORT', 'max-output-tokens': 'AI_REVIEW_MAX_OUTPUT_TOKENS' };
const callers = ['codeql', 'vulnerability', 'malware'].map(feed => ({ feed, workflow: load(`.github/workflows/alert-${feed}.yml`) }));
function noCompositeVars(data) {
  if (data.runs?.using === 'composite') assert.doesNotMatch(JSON.stringify(data), /\$\{\{[^}]*\bvars(?:\.|\[)/, 'vars must be resolved by caller workflows, never a composite manifest');
}
function explicitCallerConfiguration(caller, vars = {}) {
  const aggregate = caller.workflow.jobs.aggregate.steps.find(step => step.uses === './.github/actions/security-alerts');
  return Object.fromEntries(Object.keys(defaults).map(key => {
    assert.equal(aggregate.with[key], '${{ vars.' + variables[key] + " || '" + defaults[key] + "' }}");
    return [key, vars[variables[key]] || defaults[key]];
  }));
}
function inputEnvironment(step, inputs) {
  return Object.fromEntries(Object.entries(step.env || {}).map(([key, value]) => {
    const match = value.match(/^\$\{\{ inputs\.([\w-]+) \|\| '([^']+)' \}\}$/);
    return [key, match ? inputs[match[1]] || match[2] : value];
  }));
}
function shell(dir, run, env, outputName) {
  const output = path.join(dir, outputName);
  fs.writeFileSync(path.join(dir, 'run.sh'), run);
  const result = spawnSync(bash, ['-c', 'export PATH="$MOCK_BIN:$PATH"; test "$(command -v curl)" = "$MOCK_BIN/curl" || exit 90; cd "$MOCK_CWD"; bash run.sh'], {
    encoding: 'utf8', timeout: 20000,
    env: { ...process.env, GITHUB_WORKSPACE: root, GITHUB_OUTPUT: posix(output), MOCK_BIN: posix(path.join(dir, 'bin')), MOCK_CWD: posix(dir), MOCK_RESPONSE: posix(path.join(dir, 'response.json')), CURL_CALLS: posix(path.join(dir, 'curl-calls')), ...env },
  });
  return { ...result, output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '' };
}
async function fixture(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-alert-contract-'));
  try {
    fs.mkdirSync(path.join(dir, 'bin'));
    for (const [name, text] of Object.entries({ curl: 'echo called >> "$CURL_CALLS"\ncat "$MOCK_RESPONSE"', uuidgen: 'echo fixture-delimiter' })) {
      const file = path.join(dir, 'bin', name); fs.writeFileSync(file, '#!/bin/sh\nset -eu\n' + text + '\n'); fs.chmodSync(file, 0o755);
    }
    return await callback(dir);
  } finally {
    const actual = fs.realpathSync(dir), parent = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(actual), parent);
    fs.rmSync(actual, { recursive: true, force: true });
  }
}
function configuration(dir, inputs = {}) {
  const step = manifest.runs.steps.find(step => step.id === 'ai-config');
  const result = shell(dir, step.run, inputEnvironment(step, inputs), 'configuration');
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Configuration failed');
  return Object.fromEntries(result.output.trim().split('\n').map(line => line.split('=')));
}
const fields = Object.entries({ Status: ['Backlog', 'Done'], Domain: ['CI/CD'], 'Work type': ['Security'], Priority: ['P0', 'P1', 'P2'], Size: ['M'] }).map(([name, names]) => ({ name, id: name, dataType: 'SINGLE_SELECT', options: names.map(name => ({ name, id: name })) }));
fields.push({ name: 'Estimate', id: 'Estimate', dataType: 'NUMBER' }, { name: 'End date', id: 'End date', dataType: 'DATE' });
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function pipeline(dir, feed, config, nonempty) {
  const messages = [], outputs = {}, issues = [], cards = new Map();
  let fetches = 0, mutations = 0, projectWrites = 0;
  const core = { info: v => messages.push(v), warning: v => messages.push(v), setOutput: (k, v) => { outputs[k] = v; }, setFailed: message => { throw new Error(message); } };
  const sourceAlert = feed === 'codeql'
    ? { number: 1, html_url: 'https://example.test/alert/1', rule: { id: 'fixture', severity: 'warning' }, most_recent_instance: { location: { path: 'synthetic.py' } } }
    : { number: 1, html_url: 'https://example.test/alert/1', security_advisory: { ghsa_id: 'GHSA-fixture', severity: 'medium', summary: 'Synthetic fixture only' }, dependency: { package: { name: 'fixture', ecosystem: 'npm' }, manifest_path: 'synthetic.json' } };
  const projectGithub = { graphql: async (query, values) => {
    if (query.includes('fields(first: 100)')) return { node: { title: 'Fixture Project', fields: { nodes: fields } } };
    if (query.includes('items(first: 100')) return { node: { items: { nodes: [...cards].map(([content, id]) => ({ id, content: { id: content } })), pageInfo: {} } } };
    if (query.includes('fieldValues(first: 100)')) return { node: { fieldValues: { nodes: fields.map(field => ({ field: { name: field.name } })) } } };
    if (query.includes('addProjectV2ItemById')) { projectWrites++; cards.set(values.content, 'CARD_1'); return { addProjectV2ItemById: { item: { id: 'CARD_1' } } }; }
    if (query.includes('updateProjectV2ItemFieldValue')) { projectWrites++; return { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'CARD_1' } } }; }
    throw new Error('Unexpected mocked Project operation');
  } };
  const github = { rest: { codeScanning: { listAlertsForRepo() {} }, dependabot: { listAlertsForRepo() {} }, issues: {
    listForRepo() {}, create: async request => { mutations++; const issue = { ...request, number: 1, node_id: 'ISSUE_1' }; issues.push(issue); return { data: issue }; },
    update: async request => { mutations++; Object.assign(issues[0], request); return { data: issues[0] }; },
    addLabels: async () => { mutations++; }, addAssignees: async () => { mutations++; },
  } }, paginate: async method => {
    if (method === github.rest.issues.listForRepo) return issues;
    assert.ok([github.rest.codeScanning.listAlertsForRepo, github.rest.dependabot.listAlertsForRepo].includes(method)); fetches++; return nonempty ? [sourceAlert] : [];
  }, request: async (route, args) => { assert.equal(route, 'GET /advisories/{ghsa_id}'); return { data: { ghsa_id: args.ghsa_id, type: 'malware' } }; } };
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { FEED: feed, PROJECT_ID: 'PROJECT_FIXTURE', RUNNER_TEMP: dir, GITHUB_WORKSPACE: root });
    const execute = async step => new AsyncFunction('github', 'context', 'core', 'require', 'getOctokit', step.with.script)(github, { repo: { owner: 'fixture', repo: 'fixture' } }, core, require, token => { assert.equal(token, 'synthetic-project-token'); return projectGithub; });
    const preflight = manifest.runs.steps.find(step => step.name.startsWith('Validate Project access'));
    if (preflight) await new AsyncFunction('github', 'core', preflight.with.script)(projectGithub, core);
    await execute(manifest.runs.steps.find(step => step.id === 'alerts'));
    if (outputs.has_alerts === 'true') {
      const nested = manifest.runs.steps.find(step => step.id === 'openai');
      for (const key of ['model', 'reasoning_effort', 'max_output_tokens']) assert.equal(nested.with[key], '${{ steps.ai-config.outputs.' + key + ' }}');
      const ref = (feed === 'codeql' ? 'code-scanning' : 'dependabot') + ':1';
      const groups = { groups: [{ title: 'Repair synthetic fixture', summary: 'Fixture summary', recommendation: 'Apply the fixture correction.', alert_refs: [ref] }] };
      fs.writeFileSync(path.join(dir, 'response.json'), JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(groups) }] }] }));
      const result = shell(dir, openai.runs.steps[0].run, { MODEL: config.model, REASONING_EFFORT: config.reasoning_effort, MAX_OUTPUT_TOKENS: config.max_output_tokens, ENABLE_WEB_SEARCH: 'false', OPENAI_API_KEY: 'synthetic-api-key', OPENAI_PROJECT_ID: 'synthetic-ai-project', PROMPT_PREFIX: nested.with.prompt_prefix, SYSTEM_PROMPT: nested.with.system_prompt, DIFF_PATH: posix(path.join(dir, 'security-alerts.json')), GITHUB_ACTION_PATH: posix(path.join(root, '.github/actions/openai-chat')) }, 'provider-output');
      assert.equal(result.status, 0, result.stderr);
      const request = JSON.parse(fs.readFileSync(path.join(dir, 'body.json'), 'utf8'));
      assert.equal(request.model, config.model); assert.equal(request.reasoning.effort, config.reasoning_effort); assert.equal(request.max_output_tokens, Number(config.max_output_tokens));
      assert.match(request.input, /Synthetic fixture only|synthetic.py/);
      const content = result.output.match(/content<<([^\n]+)\n([\s\S]*?)\n\1/); assert.ok(content, result.output);
      Object.assign(process.env, { ALERT_PATH: path.join(dir, 'security-alerts.json'), GROUP_PATH: path.join(dir, 'security-alert-groups.json'), LLM_OUTPUT: content[2] });
      await execute(manifest.runs.steps.find(step => step.name === 'Validate LLM output'));
    } else {
      Object.assign(process.env, { ALERT_PATH: path.join(dir, 'security-alerts.json'), GROUP_PATH: path.join(dir, 'security-alert-groups.json') });
      await execute(manifest.runs.steps.find(step => step.name === 'Prepare empty alert groups'));
    }
    process.env.PROJECT_TOKEN = 'synthetic-project-token';
    await execute(manifest.runs.steps.find(step => step.name === 'Reconcile grouped issues'));
    assert.equal(fetches, 1);
    assert.equal(issues.length, nonempty ? 1 : 0); assert.equal(cards.size, nonempty ? 1 : 0);
    assert.equal(mutations > 0, nonempty); assert.equal(projectWrites > 0, nonempty);
    assert.equal(fs.existsSync(path.join(dir, 'curl-calls')), nonempty);
    assert.match(messages.join('\n'), nonempty ? /Created issue #1/ : /No open .* alerts or managed issues to reconcile/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

test('all local composite manifests avoid unsupported vars context, including the original failure fixture', () => {
  for (const dir of fs.readdirSync('.github/actions')) {
    const file = path.join('.github/actions', dir, 'action.yml'); if (fs.existsSync(file)) noCompositeVars(load(file));
  }
  const broken = structuredClone(manifest); broken.runs.steps.find(step => step.id === 'openai').with.model = '${{ vars.AI_REVIEW_MODEL }}';
  assert.throws(() => noCompositeVars(broken), /vars must be resolved/);
});
test('composite inputs, validated nested forwarding and all three workflow callers preserve defaults and token separation', () => {
  for (const [key, value] of Object.entries(defaults)) assert.equal(manifest.inputs[key].default, value);
  assert.ok(manifest.runs.steps.findIndex(step => step.id === 'ai-config') < manifest.runs.steps.findIndex(step => step.id === 'alerts'));
  for (const caller of callers) {
    const step = caller.workflow.jobs.aggregate.steps.find(step => step.uses === './.github/actions/security-alerts');
    assert.equal(step.with.feed, caller.feed);
    assert.equal(step.with['project-token'], '${{ secrets.SECURITY_ALERTS_TOKEN }}');
    assert.equal(step.with['robocop-token'], '${{ steps.robocop-token.outputs.token }}');
    assert.equal(step.with['project-id'], '${{ vars.SECURITY_ALERTS_PROJECT_ID }}');
    assert.deepEqual(explicitCallerConfiguration(caller), defaults);
    assert.deepEqual(explicitCallerConfiguration(caller, Object.fromEntries(Object.values(variables).map(key => [key, '']))), defaults);
  }
});
test('absent and explicitly empty composite configuration deliberately select accepted defaults', async () => {
  for (const inputs of [{}, { model: '', 'reasoning-effort': '', 'max-output-tokens': '' }]) await fixture(dir => assert.deepEqual(configuration(dir, inputs), { model: 'gpt-6-luna', reasoning_effort: 'medium', max_output_tokens: '16000' }));
});
test('invalid model, effort and token limits fail before source reads, provider calls or any reconciliation', async () => {
  for (const inputs of [{ model: 'unknown' }, { 'reasoning-effort': 'ultra' }, { 'max-output-tokens': '0' }, { 'max-output-tokens': 'NaN' }, { 'max-output-tokens': '128001' }]) await fixture(dir => {
    assert.throws(() => configuration(dir, inputs), /Unsupported reviewer|Invalid reviewer/);
    assert.equal(fs.existsSync(path.join(dir, 'curl-calls')), false); assert.equal(fs.existsSync(path.join(dir, 'security-alerts.json')), false);
  });
});
for (const caller of callers) {
  test(`${caller.feed}: empty feed executes the actual empty-group and reconciliation scripts with no provider or writes`, async () => fixture(async dir => pipeline(dir, caller.feed, configuration(dir, explicitCallerConfiguration(caller)), false)));
  for (const override of [{}, { AI_REVIEW_MODEL: 'gpt-6-luna', AI_REVIEW_REASONING_EFFORT: 'low', AI_REVIEW_MAX_OUTPUT_TOKENS: '1000' }]) {
    test(`${caller.feed}: nonempty mocked feed reaches actual config/provider/validation/reconciliation (${Object.keys(override).length ? 'override' : 'default'})`, async () => fixture(async dir => pipeline(dir, caller.feed, configuration(dir, explicitCallerConfiguration(caller, override)), true)));
  }
}
