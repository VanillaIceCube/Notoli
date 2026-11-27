"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { reconcile, probeReadEvidence, APP_CHECKS } = require("../actions/publish-ai-review/reconcile-ai-review");

const bot = { id: 123, login: 'fixture[bot]', type: 'Bot' };

const context = { repo: { owner: 'owner', repo: 'repo' }, payload: { repository: { id: 1 }, pull_request: { number: 1, head: { sha: 'new', repo: { full_name: 'owner/repo' } } } } };

const core = { warning() {}, info() {} };

function lifecycle() {
  let resolved = false;
  const replies = [], resolutions = [];
  const root = { id: 'comment-node', databaseId: 10, author: { login: 'fixture', databaseId: bot.id }, body: 'old finding', path: 'backend/example.py', originalLine: 1, diffHunk: '@@ -1 +1 @@\n+unsafe_call()', originalCommit: { oid: 'old' } };
  const thread = { id: 'thread', isResolved: false, isOutdated: true, viewerCanResolve: true, comments: { pageInfo: { hasNextPage: false }, nodes: [root] } };
  const github = { rest: { users: { getByUsername: async () => ({ data: bot }) }, pulls: {
    get: async () => ({ data: { head: context.payload.pull_request.head, state: 'open', base: { ref: 'main' }, labels: [] } }),
    createReplyForReviewComment: async request => { replies.push(request); thread.comments.nodes.push({ author: { login: 'fixture', databaseId: bot.id }, body: request.body }); },
  }, repos: { getBranchRules: async () => ({ data: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'CodeQL' }] } }] }), getCombinedStatusForRef: async () => ({ data: { total_count: 0, statuses: [], state: 'pending' } }), compareCommitsWithBasehead: async () => ({ data: { merge_base_commit: { sha: 'old' }, files: [{ filename: 'backend/example.py', status: 'modified', patch: '@@ -1 +1 @@\n-unsafe_call()\n+safe_call()' }] } }), getContent: async () => ({ data: { content: Buffer.from('safe_call()').toString('base64'), encoding: 'base64', size: 11 } }) }, checks: { listForRef: async () => ({ data: { total_count: 3, check_runs: [{ name: 'CodeQL', status: 'completed', conclusion: 'success' }, { name: 'AI Build Sheriff Review / Lint Eastwood build sheriff review', status: 'completed', conclusion: 'success' }, { name: 'AI Security Review / RoboCop security review', status: 'completed', conclusion: 'success' }, ...APP_CHECKS.map(name => ({ name, app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success' }))] } }) } },
  graphql: async (query, args) => {
    if (query.includes('unresolveReviewThread')) { resolved = false; thread.isResolved = false; return { unresolveReviewThread: { thread: { id: 'thread', isResolved: false } } }; }
    if (query.startsWith('mutation')) { resolutions.push(args); resolved = true; thread.isResolved = true; return { resolveReviewThread: { thread: { id: 'thread', isResolved: true } } }; }
    if (query.includes('node(id:')) return { node: { ...thread, isResolved: resolved } };
    return { repository: { pullRequest: { headRefOid: 'new', reviewThreads: { nodes: [thread], pageInfo: { hasNextPage: false } } } } };
  } };
  const parsed = { event: 'APPROVE', findings: [], comments: [], reconciliations: [{ comment_id: 10, action: 'resolve', evidence: { head_sha: 'new', removed_code: 'unsafe_call()', replacement_code: 'safe_call()', reason: 'The unsafe call is replaced by the validated safe implementation.' } }] };
  const run = () => reconcile({ github, context, core, parsed, appSlug: 'fixture', readGithub: github, personaName: 'Obi-Wan Code-nobi' });
  return { github, parsed, root, thread, replies, resolutions, run };
}

test('own outdated finding resolves with exact-head source/check evidence, verified mutation, one bounded follow-up', async () => {
  const h = lifecycle(); const r = await h.run();
  assert.equal(r.resolved, 1); assert.equal(h.replies.length, 1);
  await h.run(); assert.equal(h.replies.length, 1); assert.equal(h.resolutions.length, 1);
  assert.doesNotMatch(h.replies[0].body, /unsafe_call|safe_call/);
});

test('human/other bot ownership, stale heads, unchanged source, security failures and incomplete threads never resolve', async () => {
  const changes = [h => { h.root.author.databaseId = 999; }, h => { h.root.author.login = 'human'; }, h => { h.parsed.event = 'REQUEST_CHANGES'; }, h => { h.parsed.findings.push('still insecure'); }, h => { h.thread.comments.pageInfo.hasNextPage = true; }, h => { h.parsed.reconciliations[0].evidence.head_sha = 'stale'; }, h => { h.github.rest.pulls.get = async () => ({ data: { head: { sha: 'stale' } } }); }, h => { h.github.rest.repos.getContent = async () => ({ data: { encoding: 'base64', size: 20, content: Buffer.from('unsafe_call()\nsafe_call()').toString('base64') } }); }, h => { h.github.rest.checks.listForRef = async () => ({ data: { total_count: 1, check_runs: [{ name: 'security', status: 'completed', conclusion: 'failure' }] } }); }];
  for (const change of changes) { const h = lifecycle(); change(h); await h.run(); assert.equal(h.resolutions.length, 0); assert.equal(h.replies.length, 0); }
});

test('denied or uncertain resolution is reported as incomplete, never completed', async () => {
  for (const denied of [true, false]) {
    const h = lifecycle(); const original = h.github.graphql;
    h.github.graphql = async (query, args) => query.startsWith('mutation') ? (denied ? Promise.reject(Object.assign(new Error('private denied payload'), { status: 403 })) : { resolveReviewThread: { thread: { id: 'thread', isResolved: false } } }) : original(query, args);
    const result = await h.run(); assert.equal(result.resolved, 0); assert.equal(result.unavailable, true); assert.equal(h.replies.length, 0);
  }
});

test('concurrent same-persona reconciliation calls serialize and do not duplicate follow-ups', async () => {
  const h = lifecycle(); h.parsed.reconciliations[0].action = 'follow_up';
  await Promise.all([h.run(), h.run(), h.run()]);
  assert.equal(h.replies.length, 1); assert.equal(h.resolutions.length, 0);
});

test('persona workflow writers serialize by PR without altering required review gates', () => {
  const fs = require('node:fs');
  for (const file of ['review-code.yml', 'review-build.yml', 'review-security.yml']) {
    const workflow = require('node:path').join(__dirname, '../workflows', file);
    const text = fs.readFileSync(workflow, 'utf8');
    assert.match(text, /cancel-in-progress: false/);
    assert.match(text, /app_slug: \$\{\{ steps.app-token.outputs.app-slug \}\}/);
  }
});

test('resolution evidence must identify the actual cited added line, not another line in its hunk', async () => {
  const h = lifecycle(); h.root.diffHunk = '@@ -1 +1,2 @@\n+still_insecure()\n+unsafe_call()';
  await h.run(); assert.equal(h.resolutions.length, 0);
});

test('unrelated replacement text, broad edits, renamed/missing files and nonancestor proofs cannot close findings', async () => {
  for (const data of [
    { merge_base_commit: { sha: 'old' }, files: [{ filename: 'backend/example.py', status: 'modified', patch: '@@ -2 +2 @@\n-unrelated()\n+safe_call()' }] },
    { merge_base_commit: { sha: 'old' }, files: [{ filename: 'backend/example.py', status: 'modified', patch: '@@ -1 +1,2 @@\n-unsafe_call()\n+still_unsafe()\n+safe_call()' }] },
    { merge_base_commit: { sha: 'other' }, files: [] },
    { merge_base_commit: { sha: 'old' }, files: [{ filename: 'backend/example.py', status: 'renamed', previous_filename: 'old.py' }] },
  ]) {
    const h = lifecycle(); h.github.rest.repos.compareCommitsWithBasehead = async () => ({ data });
    await h.run(); assert.equal(h.resolutions.length, 0); assert.equal(h.replies.length, 0);
  }
});

test('failing, pending, incomplete and unavailable legacy statuses block resolution; other persona findings stay authoritative', async () => {
  for (const legacy of [{ total_count: 1, state: 'failure', statuses: [{ state: 'failure' }] }, { total_count: 1, state: 'pending', statuses: [{ state: 'pending' }] }, { total_count: 101, state: 'success', statuses: [] }]) {
    const h = lifecycle(); h.github.rest.repos.getCombinedStatusForRef = async () => ({ data: legacy });
    await h.run(); assert.equal(h.resolutions.length, 0);
  }
  const denied = lifecycle(); denied.github.rest.repos.getCombinedStatusForRef = async () => { throw Object.assign(new Error('denied'), { status: 403 }); };
  assert.equal((await denied.run()).unavailable, true); assert.equal(denied.resolutions.length, 0);
  const security = lifecycle(); security.github.rest.checks.listForRef = async () => ({ data: { total_count: 1, check_runs: [{ name: 'AI Security Review / RoboCop security review', status: 'completed', conclusion: 'failure' }] } });
  await security.run(); assert.equal(security.resolutions.length, 0);
});

test('missing/skipped/neutral independent reviewers and missing/skipped required contexts keep threads open', async () => {
  for (const mode of ['missing-reviewer', 'skipped-reviewer', 'neutral-reviewer', 'missing-required', 'skipped-required']) {
    const h = lifecycle(); const original = h.github.rest.checks.listForRef;
    h.github.rest.checks.listForRef = async args => {
      const result = await original(args); const checks = result.data.check_runs;
      if (mode === 'missing-reviewer') checks.pop();
      if (mode === 'skipped-reviewer') checks[1].conclusion = 'skipped';
      if (mode === 'neutral-reviewer') checks[1].conclusion = 'neutral';
      if (mode === 'skipped-required') checks[0].conclusion = 'skipped';
      if (mode === 'missing-required') checks.shift();
      return result;
    };
    await h.run(); assert.equal(h.resolutions.length, 0);
  }
});

test('human or other-bot participants prevent own-root resolution, including a late participant race', async () => {
  for (const author of [{ login: 'human', databaseId: 999 }, { login: 'other-bot', databaseId: 999 }]) {
    const h = lifecycle(); h.thread.comments.nodes.push({ databaseId: 20, author, body: 'separate concern' });
    await h.run(); assert.equal(h.resolutions.length, 0);
  }
  const h = lifecycle(); const original = h.github.graphql; let undone = false;
  h.github.graphql = async (query, args) => {
    const result = await original(query, args);
    if (query.includes('resolveReviewThread(input:') && !query.includes('unresolveReviewThread')) h.thread.comments.nodes.push({ databaseId: 20, author: { login: 'human', databaseId: 999 } });
    if (query.includes('unresolveReviewThread')) undone = true;
    return result;
  };
  const result = await h.run(); assert.equal(undone, true); assert.equal(h.thread.isResolved, false); assert.equal(result.resolved, 0); assert.equal(result.unavailable, true);
});

test('full independent check inventory is required for automatic resolution, including aggregate and analysis presence', async () => {
  for (const mode of ['missing', 'skipped', 'neutral', 'wrong-app']) {
    const h = lifecycle(); const original = h.github.rest.checks.listForRef;
    h.github.rest.checks.listForRef = async args => {
      const result = await original(args); const rows = result.data.check_runs;
      const index = rows.findIndex(c => c.name === 'Tests / Test Results');
      if (mode === 'missing') rows.splice(index, 1);
      else if (mode === 'wrong-app') rows[index].app.slug = 'other-app';
      else rows[index].conclusion = mode;
      return result;
    };
    await h.run(); assert.equal(h.resolutions.length, 0);
  }
});

test('read evidence and App mutation clients stay separate without broader App permissions', async () => {
  const h = lifecycle();
  const readGithub = { rest: { repos: { ...h.github.rest.repos }, checks: { ...h.github.rest.checks } } };
  h.github.rest.repos = new Proxy({}, { get() { throw new Error('App token must not read repository/check evidence'); } });
  h.github.rest.checks = new Proxy({}, { get() { throw new Error('App token must not read check evidence'); } });
  const r = await reconcile({ github: h.github, readGithub, context, core, parsed: h.parsed, appSlug: 'fixture', personaName: 'Obi-Wan Code-nobi' });
  assert.equal(r.resolved, 1);
});

test('actual read-evidence probe exposes permission outcomes without raw errors or writes', async () => {
  const h = lifecycle(); const reports = [];
  const result = await probeReadEvidence({ readGithub: h.github, context: { ...context, payload: { repository: { id: 1 }, pull_request: { ...context.payload.pull_request, base: { ref: 'main' } } } }, core: { info: text => reports.push(text), warning() {} } });
  assert.deepEqual(result, { checks: 'readable', statuses: 'readable', branch_rules: 'readable' });
  h.github.rest.repos.getBranchRules = async () => { throw Object.assign(new Error('private-token'), { status: 403 }); };
  const denied = await probeReadEvidence({ readGithub: h.github, context: { ...context, payload: { repository: { id: 1 }, pull_request: { ...context.payload.pull_request, base: { ref: 'main' } } } }, core: { info: text => reports.push(text), warning() {} } });
  assert.equal(denied.branch_rules, 'unavailable_http_403');
  assert.equal(h.resolutions.length, 0); assert.doesNotMatch(reports.join(' '), /private-token/);
});
