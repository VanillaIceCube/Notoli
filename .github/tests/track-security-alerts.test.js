"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");
const {
  validateConfiguration,
  collectAlerts,
  writeSource,
} = require("../actions/track-security-alerts/track-security-alerts");

const root = path.resolve(__dirname, '../..');

const load = name => YAML.parse(fs.readFileSync(path.resolve(root, name), 'utf8'));

const manifest = load('.github/actions/track-security-alerts/action.yml');

const openai = load('.github/actions/request-ai-response/action.yml');

const defaults = { model: 'gpt-6-luna', 'reasoning-effort': 'medium', 'max-output-tokens': '16000' };

const variables = { model: 'AI_REVIEW_MODEL', 'reasoning-effort': 'AI_REVIEW_REASONING_EFFORT', 'max-output-tokens': 'AI_REVIEW_MAX_OUTPUT_TOKENS' };

const callers = ['codeql', 'vulnerability', 'malware'].map(feed => ({ feed, workflow: load(`.github/workflows/alert-${feed}.yml`) }));

function noCompositeVars(data) {
  if (data.runs?.using === 'composite') assert.doesNotMatch(JSON.stringify(data), /\$\{\{[^}]*\bvars(?:\.|\[)/, 'vars must be resolved by caller workflows, never a composite manifest');
}

function explicitCallerConfiguration(caller, vars = {}) {
  const aggregate = caller.workflow.jobs.aggregate.steps.find(step => step.uses === './.github/actions/track-security-alerts');
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

function entryPoint(action, command) {
  const match = command.match(/^node "\$GITHUB_ACTION_PATH\/([\w-]+\.js)"$/);
  assert.ok(match, command);
  return path.join(root, '.github/actions', action, match[1]);
}

async function fixture(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-alert-contract-'));
  try {
    return await callback(dir);
  } finally {
    const actual = fs.realpathSync(dir), parent = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(actual), parent);
    fs.rmSync(actual, { recursive: true, force: true });
  }
}

function configuration(dir, inputs = {}) {
  const step = manifest.runs.steps.find(step => step.id === 'ai-config');
  const output = path.join(dir, 'configuration');
  const result = spawnSync(process.execPath, [entryPoint('track-security-alerts', step.run)], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, ...inputEnvironment(step, inputs), FEED: 'codeql',
      ROBOCOP_TOKEN: 'synthetic-issue-token', GITHUB_OUTPUT: output },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Configuration failed');
  return Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').map(line => line.split('=')));
}

const fields = [
  { name: 'Domain', fullDatabaseId: 1, dataType: 'SINGLE_SELECT', options: ['Frontend', 'Backend', 'Cloud'].map(name => ({ name })) },
  { name: 'Priority', fullDatabaseId: 2, dataType: 'SINGLE_SELECT', options: ['P0', 'P1', 'P2'].map(name => ({ name })) },
  { name: 'Size', fullDatabaseId: 3, dataType: 'SINGLE_SELECT', options: [{ name: 'M' }] },
  { name: 'End date', fullDatabaseId: 5, dataType: 'DATE' },
];
const issueTypes = { nodes: [{ name: 'Bug' }] };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test('native schema validation fails before reading any alert feed', async () => {
  for (const name of ['Bug', 'Priority', 'End date']) {
    const repository = {
      issueTypes: name === 'Bug' ? { nodes: [] } : issueTypes,
      issueFields: { nodes: fields.filter(field => field.name !== name) },
    };
    const github = {
      graphql: async () => ({ repository }),
      paginate: () => assert.fail('must validate fields before reading alerts'),
    };
    await assert.rejects(writeSource({ github, context: { repo: {} } }), new RegExp(name));
  }
});

async function pipeline(dir, feed, config, nonempty, severity = 'medium') {
  const messages = [], outputs = {}, issues = [], fieldWrites = [];
  let fetches = 0, providerCalls = 0, mutations = 0;
  const core = { info: v => messages.push(v), warning: v => messages.push(v), setOutput: (k, v) => { outputs[k] = v; }, setFailed: message => { throw new Error(message); } };
  const sourceAlert = feed === 'codeql'
    ? { number: 1, html_url: 'https://example.test/alert/1', rule: { id: 'fixture', severity: 'warning' }, most_recent_instance: { location: { path: 'backend/synthetic.py' } } }
    : { number: 1, html_url: 'https://example.test/alert/1', security_advisory: { ghsa_id: 'GHSA-fixture', severity, summary: 'Synthetic fixture only' }, dependency: { package: { name: 'fixture', ecosystem: 'npm' }, manifest_path: 'frontend/synthetic.json' } };
  const github = {
    graphql: async () => ({ repository: { issueFields: { nodes: fields }, issueTypes } }),
    rest: { codeScanning: { listAlertsForRepo() {} }, dependabot: { listAlertsForRepo() {} }, issues: {
    listForRepo() {}, create: async request => { mutations++; const issue = { ...request, labels: request.labels.map(name => ({ name })), assignees: request.assignees.map(login => ({ login })), number: 1, node_id: 'ISSUE_1' }; issues.push(issue); return { data: issue }; },
    update: async request => { mutations++; Object.assign(issues[0], request); return { data: issues[0] }; },
    addLabels: async () => { mutations++; }, addAssignees: async () => { mutations++; },
  } }, paginate: async method => {
    if (method === github.rest.issues.listForRepo) return issues;
    assert.ok([github.rest.codeScanning.listAlertsForRepo, github.rest.dependabot.listAlertsForRepo].includes(method)); fetches++; return nonempty ? [sourceAlert] : [];
  }, request: async (route, args) => {
    if (route === 'GET /advisories/{ghsa_id}') return { data: { ghsa_id: args.ghsa_id, type: 'malware' } };
    if (route.startsWith('GET ') && route.endsWith('issue-field-values')) return { data: [] };
    assert.match(route, /^POST .*issue-field-values$/);
    fieldWrites.push(...args.issue_field_values);
    return { data: [] };
  } };
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { FEED: feed, RUNNER_TEMP: dir, GITHUB_WORKSPACE: root });
    const execute = async step => new AsyncFunction('github', 'context', 'core', 'require', step.with.script)(github, { repo: { owner: 'fixture', repo: 'fixture' } }, core, require);
    await execute(manifest.runs.steps.find(step => step.id === 'alerts'));
    if (outputs.has_alerts === 'true') {
      const nested = manifest.runs.steps.find(step => step.id === 'openai');
      for (const key of ['model', 'reasoning_effort', 'max_output_tokens']) assert.equal(nested.with[key], '${{ steps.ai-config.outputs.' + key + ' }}');
      const ref = (feed === 'codeql' ? 'code-scanning' : 'dependabot') + ':1';
      const groups = { groups: [{ title: 'Repair synthetic fixture', summary: 'Fixture summary', recommendation: 'Apply the fixture correction.', alert_refs: [ref] }] };
      const output = path.join(dir, 'provider-output');
      const { run } = require(entryPoint('request-ai-response', openai.runs.steps[0].run));
      let request;
      await run({
        MODEL: config.model, REASONING_EFFORT: config.reasoning_effort, MAX_OUTPUT_TOKENS: config.max_output_tokens,
        ENABLE_WEB_SEARCH: 'false', OPENAI_API_KEY: 'synthetic-api-key', OPENAI_PROJECT_ID: 'synthetic-ai-project',
        PROMPT_PREFIX: nested.with.prompt_prefix, SYSTEM_PROMPT: nested.with.system_prompt,
        DIFF_PATH: path.join(dir, 'security-alerts.json'), GITHUB_OUTPUT: output,
      }, async body => {
        providerCalls++;
        request = body;
        return JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(groups) }] }] });
      });
      assert.equal(request.model, config.model); assert.equal(request.reasoning.effort, config.reasoning_effort); assert.equal(request.max_output_tokens, Number(config.max_output_tokens));
      assert.match(request.input, /Synthetic fixture only|synthetic.py/);
      const content = fs.readFileSync(output, 'utf8').match(/content<<([^\n]+)\n([\s\S]*?)\n\1/); assert.ok(content);
      process.env.LLM_OUTPUT = content[2];
    } else {
      delete process.env.LLM_OUTPUT;
    }
    await execute(manifest.runs.steps.find(step => step.name === 'Reconcile grouped issues'));
    assert.equal(fetches, 1);
    assert.equal(issues.length, nonempty ? 1 : 0);
    assert.equal(mutations, nonempty ? 1 : 0, 'RoboCop repairs labels and assignees only when the issue response lacks them');
    assert.equal(fieldWrites.length, nonempty ? 3 : 0);
    if (nonempty) {
      const domain = fieldWrites.find(write => write.field_id === 1);
      assert.equal(domain.value, feed === 'codeql' ? 'Backend' : 'Frontend');
    }
    if (nonempty) assert.equal(issues[0].type, 'Bug');
    assert.equal(providerCalls, nonempty ? 1 : 0);
    assert.match(messages.join('\n'), nonempty ? /Created issue #1/ : /No open .* alerts or managed issues to reconcile/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

test('all local composite manifests avoid unsupported vars context, including the original failure fixture', () => {
  for (const dir of fs.readdirSync(path.join(root, '.github/actions'))) {
    const file = path.join(root, '.github/actions', dir, 'action.yml'); if (fs.existsSync(file)) noCompositeVars(load(file));
  }
  const broken = structuredClone(manifest); broken.runs.steps.find(step => step.id === 'openai').with.model = '${{ vars.AI_REVIEW_MODEL }}';
  assert.throws(() => noCompositeVars(broken), /vars must be resolved/);
});

test('composite inputs, validated nested forwarding and all three workflow callers preserve defaults and scoped authentication', () => {
  for (const [key, value] of Object.entries(defaults)) assert.equal(manifest.inputs[key].default, value);
  assert.ok(manifest.runs.steps.findIndex(step => step.id === 'ai-config') < manifest.runs.steps.findIndex(step => step.id === 'alerts'));
  for (const caller of callers) {
    const step = caller.workflow.jobs.aggregate.steps.find(step => step.uses === './.github/actions/track-security-alerts');
    assert.equal(step.with.feed, caller.feed);
    assert.equal(step.with['robocop-token'], '${{ steps.robocop-token.outputs.token }}');
    assert.deepEqual(explicitCallerConfiguration(caller), defaults);
    assert.deepEqual(explicitCallerConfiguration(caller, Object.fromEntries(Object.values(variables).map(key => [key, '']))), defaults);
  }
});

test('missing credentials and unsupported feeds fail configuration before any reads or writes', () => {
  const valid = { FEED: 'codeql', ROBOCOP_TOKEN: 'issues', MODEL: 'gpt-6-luna', MAX_OUTPUT_TOKENS: '16000' };
  assert.equal(validateConfiguration(valid).model, 'gpt-6-luna');
  for (const changed of [{ FEED: 'other' }, { ROBOCOP_TOKEN: '' }]) {
    assert.throws(() => validateConfiguration({ ...valid, ...changed }));
  }
});

test('absent and explicitly empty composite configuration deliberately select accepted defaults', async () => {
  for (const inputs of [{}, { model: '', 'reasoning-effort': '', 'max-output-tokens': '' }]) await fixture(dir => assert.deepEqual(configuration(dir, inputs), { model: 'gpt-6-luna', reasoning_effort: 'medium', max_output_tokens: '16000' }));
});

test('invalid model, effort and token limits fail before source reads, provider calls or any reconciliation', async () => {
  for (const inputs of [{ model: 'unknown' }, { 'reasoning-effort': 'ultra' }, { 'max-output-tokens': '0' }, { 'max-output-tokens': 'NaN' }, { 'max-output-tokens': '128001' }]) await fixture(dir => {
    assert.throws(() => configuration(dir, inputs), /Unsupported reviewer|Invalid reviewer/);
    assert.equal(fs.existsSync(path.join(dir, 'configuration')), false);
    assert.equal(fs.existsSync(path.join(dir, 'security-alerts.json')), false);
  });
});

for (const severity of ['high', 'critical']) {
  test(`vulnerability: ${severity} source reaches native issue reconciliation`, () =>
    fixture(dir => pipeline(dir, 'vulnerability', configuration(dir), true, severity)));
}

for (const caller of callers) {
  test(`${caller.feed}: empty feed reconciles the authoritative empty source with no provider or writes`, async () => fixture(async dir => pipeline(dir, caller.feed, configuration(dir, explicitCallerConfiguration(caller)), false)));
  for (const override of [{}, { AI_REVIEW_MODEL: 'gpt-6-luna', AI_REVIEW_REASONING_EFFORT: 'low', AI_REVIEW_MAX_OUTPUT_TOKENS: '1000' }]) {
    test(`${caller.feed}: nonempty mocked feed reaches actual config/provider/validation/reconciliation (${Object.keys(override).length ? 'override' : 'default'})`, async () => fixture(async dir => pipeline(dir, caller.feed, configuration(dir, explicitCallerConfiguration(caller, override)), true)));
  }
}

async function collect(feed, alerts, advisoryLookup = async (_route, params) => ({ data: { ghsa_id: params.ghsa_id, type: "reviewed" } })) {
  const github = {
    rest: { codeScanning: { listAlertsForRepo: "codeql" }, dependabot: { listAlertsForRepo: "dependabot" } },
    paginate: async () => alerts,
    request: advisoryLookup,
  };
  return collectAlerts(github, { owner: "owner", repo: "repo" }, feed);
}

function alert(number, severity, ghsa = `GHSA-${number}`) {
  return { number, html_url: `https://github.com/owner/repo/security/dependabot/${number}`,
    security_advisory: { ghsa_id: ghsa, severity, summary: "Authoritative advisory" },
    dependency: { package: { name: "example", ecosystem: "actions" }, manifest_path: ".github/workflows/ci.yml" },
  };
}

test("vulnerability feed retains every severity and authoritative source link", async () => {
  const source = ["critical", "high", "medium", "low", "unknown"].map((severity, index) => alert(index + 1, severity));
  const result = await collect("vulnerability", source);
  assert.deepEqual(result.alerts.map(value => value.severity), source.map(value => value.security_advisory.severity));
  assert.equal(result.alerts[0].url, source[0].html_url);
});

test("malware classification queries only unique advisories already affecting this repository", async () => {
  const lookedUp = [];
  const result = await collect("malware", [alert(1, "critical", "bad"), alert(2, "high", "bad"), alert(3, "medium", "ordinary")],
    async (_route, params) => {
      lookedUp.push(params.ghsa_id);
      return { data: { ghsa_id: params.ghsa_id, type: params.ghsa_id === "bad" ? "malware" : "reviewed" } };
    });
  assert.deepEqual(lookedUp, ["bad", "ordinary"]);
  assert.deepEqual(result.alerts.map(value => value.ref), ["dependabot:1", "dependabot:2"]);
});

test("empty malware feed does not query the global advisory corpus", async () => {
  const result = await collect("malware", [], async () => { throw new Error("Unexpected advisory lookup"); });
  assert.deepEqual(result.alerts, []);
});

test("scanner errors propagate before any group can be synchronized", async () => {
  await assert.rejects(collect("malware", [alert(1, "high")], async () => { throw new Error("API unavailable"); }), /API unavailable/);
  for (const advisory of [{ ghsa_id: "unexpected", type: "malware" }, { ghsa_id: "GHSA-1", type: "unknown" }]) {
    await assert.rejects(collect("malware", [alert(1, "high")], async () => ({ data: advisory })), /Cannot classify/);
  }
});

test("Dependabot alert compaction preserves the source URL used in issue links", async () => {
  const { collectAlerts } = require("../actions/track-security-alerts/track-security-alerts");
  const github = { rest: { dependabot: { listAlertsForRepo() {} } }, paginate: async () => [
    { number: 7, html_url: "https://example.test/advisory/7", security_advisory: { severity: "critical" } },
  ] };
  const { alerts } = await collectAlerts(github, { owner: "owner", repo: "repo" }, "vulnerability");
  assert.equal(alerts[0].url, "https://example.test/advisory/7");
  assert.equal(alerts[0].ref, "dependabot:7");
});

test("alert workflows scope RoboCop to alert and issue APIs", () => {
  const repositoryRoot = path.resolve(__dirname, "../..");
  const workflowNames = [
    "alert-codeql.yml",
    "alert-vulnerability.yml",
    "alert-malware.yml",
  ];

  for (const workflowName of workflowNames) {
    const workflow = fs.readFileSync(
      path.join(repositoryRoot, ".github", "workflows", workflowName),
      "utf8",
    );
    assert.match(
      workflow,
      /uses: actions\/create-github-app-token@f418cff399f7aef4c2f0ad47e25ca7a6abbdd6fc # v3\.4\.0/,
    );
    assert.match(workflow, /permission-issues: write/);
    assert.equal(workflow.includes("permission-security-events: read"), workflowName === "alert-codeql.yml");
    assert.doesNotMatch(workflow, /permission-contents:/);
    assert.match(
      workflow,
      /robocop-token: \$\{\{ steps\.robocop-token\.outputs\.token \}\}/,
    );
    assert.doesNotMatch(workflow, /SECURITY_ALERTS_(PROJECT_ID|TOKEN)/);
    if (workflowName === "alert-codeql.yml") {
      assert.doesNotMatch(workflow, /permission-vulnerability-alerts: read/);
    } else {
      assert.match(workflow, /permission-vulnerability-alerts: read/);
    }
  }

  const action = fs.readFileSync(
    path.join(
      repositoryRoot,
      ".github",
      "actions",
      "track-security-alerts",
      "action.yml",
    ),
    "utf8",
  );
  assert.match(action, /github-token: \$\{\{ inputs\.robocop-token \}\}/);
  assert.doesNotMatch(action, /PROJECT_TOKEN|PROJECT_ID:|getOctokit/);
});

test("malware fetch inspects only unique repository source advisories and fails before writes on uncertain classification", async () => {
  const { collectAlerts } = require("../actions/track-security-alerts/track-security-alerts");
  const raw = (number, ghsa) => ({ number, html_url: `https://example.test/${number}`, security_advisory: { ghsa_id: ghsa, severity: "medium" }, dependency: { package: { name: "example", ecosystem: "npm" } } });
  for (const mode of ["empty", "mixed", "unavailable", "malformed"]) {
    const calls = [];
    const github = {
      rest: { dependabot: { listAlertsForRepo() {} } },
      paginate: async method => { assert.equal(method, github.rest.dependabot.listAlertsForRepo); return mode === "empty" ? [] : [raw(1, "GHSA-one"), raw(2, "GHSA-one"), raw(3, "GHSA-two")]; },
      request: async (route, input) => {
        assert.equal(route, "GET /advisories/{ghsa_id}"); calls.push(input.ghsa_id);
        if (mode === "unavailable") throw new Error("advisory unavailable");
        if (mode === "malformed") return { data: { ghsa_id: input.ghsa_id } };
        return { data: { ghsa_id: input.ghsa_id, type: input.ghsa_id === "GHSA-one" ? "malware" : "reviewed" } };
      },
    };
    const execute = () => collectAlerts(github, { owner: "owner", repo: "repo" }, "malware");
    if (["unavailable", "malformed"].includes(mode)) await assert.rejects(execute());
    else {
      const source = await execute();
      assert.deepEqual(calls, mode === "empty" ? [] : ["GHSA-one", "GHSA-two"]);
      assert.deepEqual(source.alerts.map(alert => alert.ref), mode === "empty" ? [] : ["dependabot:1", "dependabot:2"]);
    }
  }
});
