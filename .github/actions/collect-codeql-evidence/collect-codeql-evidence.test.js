"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectCodeqlEvidence } = require("./collect-codeql-evidence");
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('docs-only PRs require all three completed default-branch baselines', () => {
  const input = {
    upstreamResult: 'success', scopeStatus: 'success',
    scope: { python: false, javascript: false, actions: false },
    defaultBranchAnalyses: [baseline('/language:python', 'python'), baseline('/language:javascript-typescript', 'javascript'), baseline('/language:actions', 'actions')],
  };
  assert.equal(collectCodeqlEvidence(input).approval_eligible, true);
  for (let index = 0; index < 3; index++) {
    const partial = input.defaultBranchAnalyses.filter((_, candidate) => candidate !== index);
    assert.equal(collectCodeqlEvidence({ ...input, defaultBranchAnalyses: partial }).approval_eligible, false);
  }
});

test('failed out-of-scope analyses stay gaps and successful reruns use the newest check', () => {
  const input = { upstreamResult: 'success', scopeStatus: 'success', scope: { python: false, javascript: true, actions: true },
    defaultBranchAnalyses: [baseline('/language:python', 'python')],
    checkRuns: [successfulCheck('Analyze JavaScript/TypeScript'), successfulCheck('Analyze GitHub Actions'), { ...successfulCheck('Analyze Python'), id: 10, conclusion: 'cancelled' }],
  };
  assert.equal(collectCodeqlEvidence(input).approval_eligible, false);
  input.checkRuns.push({ ...successfulCheck('Analyze Python'), id: 11 });
  assert.equal(collectCodeqlEvidence(input).approval_eligible, true);
});

test('workflow executes accurate PR scope and full push/schedule/manual scope', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../workflows/gate-codeql.yml'), 'utf8');
  const match = workflow.match(/      - name: Set analysis scope[\s\S]*?        run: \|\n([\s\S]*?)\n  analyze-python:/);
  assert.ok(match);
  const source = match[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-scope-'));
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  try {
    for (const [event, python, javascript, actions, expected] of [
      ['pull_request', 'false', 'false', 'false', ['false', 'false', 'false']],
      ['pull_request', 'true', 'false', 'false', ['true', 'false', 'true']],
      ['pull_request', 'false', 'true', 'false', ['false', 'true', 'true']],
      ['pull_request', 'false', 'false', 'true', ['false', 'false', 'true']],
      ['push', '', '', '', ['true', 'true', 'true']],
      ['schedule', '', '', '', ['true', 'true', 'true']],
      ['workflow_dispatch', '', '', '', ['true', 'true', 'true']],
      ['pull_request', '', '', '', null],
    ]) {
      const output = path.join(directory, 'output').replaceAll('\\', '/');
      fs.writeFileSync(output, '');
      let script = source.replaceAll('${{ github.event_name }}', event);
      for (const [key, value] of Object.entries({ python, javascript, actions })) script = script.replaceAll('${{ steps.filter.outputs.' + key + ' }}', value);
      const result = spawnSync(bash, ['-c', script], { env: { ...process.env, GITHUB_OUTPUT: output, EVENT_NAME: event, PYTHON_SCOPE: python, JAVASCRIPT_SCOPE: javascript, ACTIONS_SCOPE: actions }, encoding: 'utf8' });
      assert.equal(result.status, expected ? 0 : 1, result.stderr);
      const values = Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map((line) => line.split('=')));
      if (expected) {
        assert.equal(values.scope_status, 'success');
        assert.deepEqual([values.python, values.javascript, values.actions], expected);
      } else assert.equal(values.scope_status, undefined);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('scope workflow outputs are forwarded to RoboCop and evidence handling stays bounded', () => {
  const base = path.join(__dirname, '../../workflows');
  const gate = fs.readFileSync(path.join(base, 'gate-codeql.yml'), 'utf8');
  const orchestrator = fs.readFileSync(path.join(base, 'ci-orchestrator.yml'), 'utf8');
  const review = fs.readFileSync(path.join(base, 'review-security.yml'), 'utf8');
  for (const language of ['status', 'python', 'javascript', 'actions']) {
    assert.ok(gate.includes('      scope_' + language + ':'));
    assert.ok(orchestrator.includes('codeql_scope_' + language + ': ${{ needs.codeql.outputs.scope_' + language + ' }}'));
    assert.ok(review.includes('inputs.codeql_scope_' + language));
  }
  assert.match(review, /codeql_interpretation: codeqlInterpretation/);
  assert.match(review, /approval_eligible is false/);
  const evidence = collectCodeqlEvidence({ checkRuns: Array.from({ length: 100 }, (_, id) => ({ id, name: 'CodeQL', conclusion: 'neutral', output: { summary: 'x'.repeat(100000) } })) });
  assert.ok(Buffer.byteLength(JSON.stringify(evidence)) < 16000);
});

const successfulCheck = (name) => ({
  id: name,
  name: `CodeQL / ${name}`,
  status: "completed",
  conclusion: "success",
  output: { summary: "" },
});

const baseline = (category, language, overrides = {}) => ({
  category,
  language,
  commit_sha: "abc123",
  created_at: "2026-08-14T00:00:00Z",
  error: "",
  ...overrides,
});

test("accepts a frontend-only pull request with an expected Python skip", () => {
  const evidence = collectCodeqlEvidence({
    upstreamResult: "success",
    scopeStatus: "success",
    scope: { python: "false", javascript: "true", actions: "true" },
    checkRuns: [
      successfulCheck("Analyze JavaScript/TypeScript"),
      successfulCheck("Analyze GitHub Actions"),
      {
        id: 99,
        name: "CodeQL",
        status: "completed",
        conclusion: "neutral",
        output: {
          summary:
            "The /language:python configuration present on refs/heads/main was not present in this analysis.",
        },
      },
    ],
    defaultBranch: "main",
    defaultBranchAnalyses: [baseline("/language:python", "python")],
  });

  assert.equal(evidence.approval_eligible, true);
  assert.equal(evidence.languages.python.status, "expected_skip");
  assert.equal(evidence.languages.javascript.status, "analyzed");
  assert.equal(evidence.languages.actions.status, "analyzed");
  assert.equal(
    evidence.synthetic_codeql_summaries[0].interpretation,
    "informational_expected_scope_omission",
  );
});

test("accepts a backend-only pull request with an expected JavaScript skip", () => {
  const evidence = collectCodeqlEvidence({
    upstreamResult: "success",
    scopeStatus: "success",
    scope: { python: true, javascript: false, actions: true },
    checkRuns: [
      successfulCheck("Analyze Python"),
      successfulCheck("Analyze GitHub Actions"),
    ],
    defaultBranch: "main",
    defaultBranchAnalyses: [
      baseline("/language:javascript-typescript", "javascript-typescript"),
    ],
  });

  assert.equal(evidence.approval_eligible, true);
  assert.equal(evidence.languages.python.status, "analyzed");
  assert.equal(evidence.languages.javascript.status, "expected_skip");
  assert.equal(evidence.languages.actions.status, "analyzed");
});

test("requires all analyzers for workflow or shared-automation changes", () => {
  const evidence = collectCodeqlEvidence({
    upstreamResult: "success",
    scopeStatus: "success",
    scope: { python: true, javascript: true, actions: true },
    checkRuns: [
      successfulCheck("Analyze Python"),
      successfulCheck("Analyze JavaScript/TypeScript"),
      successfulCheck("Analyze GitHub Actions"),
    ],
    defaultBranch: "main",
  });

  assert.equal(evidence.approval_eligible, true);
  assert.deepEqual(
    Object.values(evidence.languages).map((language) => language.status),
    ["analyzed", "analyzed", "analyzed"],
  );
});

test("preserves an evidence gap when scope detection fails", () => {
  const evidence = collectCodeqlEvidence({
    upstreamResult: "failure",
    scopeStatus: "failure",
    scope: {},
    checkRuns: [],
    defaultBranch: "main",
  });

  assert.equal(evidence.approval_eligible, false);
  assert.equal(evidence.interpretation, "evidence_gap");
  assert.match(evidence.blocking_reasons[0], /aggregate CodeQL gate/);
  assert.match(evidence.blocking_reasons[1], /scope detector/);
});

test("preserves an evidence gap when the aggregate gate fails", () => {
  const evidence = collectCodeqlEvidence({
    upstreamResult: "failure",
    scopeStatus: "success",
    scope: { python: true, javascript: true, actions: true },
    checkRuns: [
      successfulCheck("Analyze Python"),
      successfulCheck("Analyze JavaScript/TypeScript"),
      successfulCheck("Analyze GitHub Actions"),
    ],
    defaultBranch: "main",
  });

  assert.equal(evidence.approval_eligible, false);
  assert.match(evidence.blocking_reasons[0], /concluded failure/);
});

test("preserves an evidence gap for a genuinely missing default-branch baseline", () => {
  const evidence = collectCodeqlEvidence({
    upstreamResult: "success",
    scopeStatus: "success",
    scope: { python: false, javascript: true, actions: true },
    checkRuns: [
      successfulCheck("Analyze JavaScript/TypeScript"),
      successfulCheck("Analyze GitHub Actions"),
    ],
    defaultBranch: "main",
    defaultBranchAnalyses: [],
  });

  assert.equal(evidence.approval_eligible, false);
  assert.equal(evidence.languages.python.status, "evidence_gap");
  assert.match(
    evidence.languages.python.reason,
    /no matching default-branch baseline/,
  );
});

test("rejects failed or incomplete default-branch analyses as baselines", () => {
  for (const invalidBaseline of [
    baseline("/language:python", "python", { error: "analysis failed" }),
    baseline("/language:python", "python", { commit_sha: "" }),
    baseline("/language:python", "python", { created_at: "" }),
    baseline("/language:python", "python", { status: "in_progress" }),
    baseline("/language:python", "python", { conclusion: "failure" }),
  ]) {
    const evidence = collectCodeqlEvidence({
      upstreamResult: "success",
      scopeStatus: "success",
      scope: { python: false, javascript: true, actions: true },
      checkRuns: [
        successfulCheck("Analyze JavaScript/TypeScript"),
        successfulCheck("Analyze GitHub Actions"),
      ],
      defaultBranch: "main",
      defaultBranchAnalyses: [invalidBaseline],
    });

    assert.equal(evidence.approval_eligible, false);
    assert.equal(
      evidence.languages.python.default_branch_baseline_present,
      false,
    );
    assert.equal(evidence.languages.python.status, "evidence_gap");
  }
});

test("preserves an evidence gap when an omitted baseline cannot be queried", () => {
  const evidence = collectCodeqlEvidence({
    upstreamResult: "success",
    scopeStatus: "success",
    scope: { python: false, javascript: true, actions: true },
    checkRuns: [
      successfulCheck("Analyze JavaScript/TypeScript"),
      successfulCheck("Analyze GitHub Actions"),
    ],
    defaultBranch: "main",
    baselineQueryError: "API rate limit exceeded",
  });

  assert.equal(evidence.approval_eligible, false);
  assert.match(evidence.languages.python.reason, /could not be verified/);
});

test("does not reinterpret an unknown scope output as an intentional skip", () => {
  const evidence = collectCodeqlEvidence({
    upstreamResult: "success",
    scopeStatus: "success",
    scope: { python: "unknown", javascript: true, actions: true },
    checkRuns: [
      successfulCheck("Analyze JavaScript/TypeScript"),
      successfulCheck("Analyze GitHub Actions"),
    ],
    defaultBranch: "main",
    defaultBranchAnalyses: [baseline("/language:python", "python")],
  });

  assert.equal(evidence.approval_eligible, false);
  assert.equal(evidence.languages.python.scope_value_known, false);
  assert.match(
    evidence.languages.python.reason,
    /did not report a true or false/,
  );
});
