const assert = require('node:assert/strict');
const test = require('node:test');
const { run, render, classify, MARKER } = require('./summary');
const HEAD = 'b'.repeat(40), BASE = 'a'.repeat(40);
const context = { repo: { owner: 'VanillaIceCube', repo: 'Notoli' } };
function fixture() {
  const pr = { state: 'open', labels: [], base: { ref: 'env-prod', sha: BASE }, head: { sha: HEAD, repo: { full_name: 'VanillaIceCube/Notoli' } }, changed_files: 1 };
  const comments = [], writes = [];
  const bot = { id: 41898282, login: 'github-actions[bot]', type: 'Bot' };
  const github = { rest: { pulls: {
    get: async () => ({ data: structuredClone(pr) }),
    listFiles: async () => ({ data: [{ filename: 'backend/authentication/views.py', additions: 3, deletions: 1 }] }),
  }, users: { getByUsername: async () => ({ data: bot }) }, issues: {
    listComments: async () => ({ data: structuredClone(comments) }),
    createComment: async request => { writes.push(request); const comment = { ...request, id: 10, user: bot }; comments.push(comment); return { data: comment }; },
    updateComment: async request => { writes.push(request); const comment = comments.find(c => c.id === request.comment_id); Object.assign(comment, request); return { data: comment }; },
  } } };
  const call = () => run({ github, context, core: { info() {} }, number: 1 });
  return { pr, github, bot, comments, writes, call };
}
test('summary derives observed areas and separate risks from actual metadata, including renames', () => {
  const files = [{ filename: 'backend/app/migrations/0002_change.py', status: 'added', additions: 5, deletions: 0 }, { filename: 'frontend/package-lock.json', previous_filename: 'backend/environment.yml', status: 'renamed' }, { filename: '.github/workflows/ci-deploy.yml' }];
  const groups = classify(files);
  assert.equal(groups.migrations, 1); assert.equal(groups.dependencies, 1); assert.equal(groups.release, 1);
  const text = render({ repo: 'Notoli', number: 1, base: BASE, head: HEAD, files });
  assert.match(text, /Inferred review considerations/); assert.match(text, /never restore an older database/);
  assert.match(text, /5 added \/ 0 removed/); assert.match(text, new RegExp(BASE));
});
test('untrusted names and PR prose cannot enter output or commands', () => {
  const name = 'backend/`$(touch hacked)`-sk-private-key-recipient@example.test-reset?token=secret.py';
  const text = render({ repo: 'Notoli', number: 1, base: BASE, head: HEAD, files: [{ filename: name, additions: 0, deletions: 0 }] });
  for (const word of ['touch hacked', 'sk-private-key', 'recipient@example.test', 'token=secret']) assert.equal(text.includes(word), false);
  assert.throws(() => render({ repo: 'bad`repo', number: 1, base: BASE, head: HEAD, files: [] }));
});
test('empty comparisons are explicit; gateway uses separate owner/RequiredCI and recovery language', () => {
  const text = render({ repo: 'JudeAndrewAlabaInfrastructure', number: 1, base: BASE, head: HEAD, files: [] });
  assert.match(text, /No changed files/); assert.match(text, /Required CI/); assert.match(text, /running gateway/);
  assert.doesNotMatch(text, /universal rollback/i);
});
test('first publish, rerun and changed head maintain one own summary', async () => {
  const h = fixture(); assert.equal((await h.call()).status, 'created');
  assert.equal((await h.call()).status, 'unchanged'); assert.equal(h.writes.length, 1);
  h.pr.head.sha = 'c'.repeat(40);
  assert.equal((await h.call()).status, 'updated'); assert.equal(h.comments.length, 1); assert.equal(h.writes.length, 2);
});
test('human and other bot markers are never edited; concurrent runs do not duplicate', async () => {
  const h = fixture(); h.comments.push({ id: 11, user: { ...h.bot, id: 999 }, body: MARKER + 'fake' });
  const result = await Promise.all([h.call(), h.call(), h.call()]);
  assert.deepEqual(result.map(r => r.status), ['created', 'unchanged', 'unchanged']);
  assert.equal(h.writes.length, 1); assert.equal(h.comments[0].body, MARKER + 'fake');
});
test('fresh labels, forks, wrong branches and closed PRs suppress mutations', async () => {
  for (const update of [h => h.pr.labels.push({ name: 'codex' }), h => h.pr.labels.push({ name: 'jules' }), h => { h.pr.base.ref = 'main'; }, h => { h.pr.state = 'closed'; }, h => { h.pr.head.repo.full_name = 'fork/repo'; }]) {
    const h = fixture(); update(h); assert.equal((await h.call()).status, 'skipped'); assert.equal(h.writes.length, 0);
  }
});
test('head/base movement or new protected labels during collection never publish stale evidence', async () => {
  for (const update of [h => { h.pr.head.sha = 'c'.repeat(40); }, h => { h.pr.base.sha = 'c'.repeat(40); }, h => h.pr.labels.push({ name: 'codex' })]) {
    const h = fixture(); const original = h.github.rest.pulls.listFiles;
    h.github.rest.pulls.listFiles = async args => { update(h); return original(args); };
    await assert.rejects(h.call(), /comparison_changed_or_protected/); assert.equal(h.writes.length, 0);
  }
});
test('pagination is complete or fails visibly; truncated inventory cannot create a misleading summary', async () => {
  const h = fixture(); h.pr.changed_files = 101;
  h.github.rest.pulls.listFiles = async ({ page }) => ({ data: Array.from({ length: page === 1 ? 100 : 1 }, () => ({ filename: 'frontend/file.js' })) });
  assert.equal((await h.call()).status, 'created');
  h.pr.changed_files = 102;
  await assert.rejects(h.call(), /incomplete_file_comparison/);
  const more = fixture(); more.github.rest.issues.listComments = async () => ({ data: Array.from({ length: 100 }, () => ({ body: 'comment' })) });
  await assert.rejects(more.call(), /incomplete_inventory/); assert.equal(more.writes.length, 0);
});
test('permission failure and unconfirmed writes remain failures, not reported success', async () => {
  for (const denied of [true, false]) {
    const h = fixture(); h.github.rest.issues.createComment = async () => denied ? Promise.reject(Object.assign(new Error('denied'), { status: 403 })) : { data: {} };
    await assert.rejects(h.call(), denied ? /denied/ : /unconfirmed/);
  }
});

test('documentation-only files do not manufacture runtime or release-input impact', () => {
  const groups = classify([{ filename: 'backend/README.md' }, { filename: 'deploy/production/README.md' }, { filename: '.github/README-WORKFLOWS.md' }]);
  assert.equal(groups.documentation, 3); assert.equal(groups.other, 0); assert.equal(groups.backend, 0); assert.equal(groups.release, 0); assert.equal(groups.automation, 0);
});


test('a newly protected PR retains historical evidence without another mutation', async () => {
  const h = fixture(); await h.call(); const original = h.comments[0].body;
  h.pr.labels = [{ name: 'codex' }]; h.pr.head.sha = 'c'.repeat(40);
  assert.equal((await h.call()).status, 'skipped');
  assert.equal(h.writes.length, 1); assert.equal(h.comments[0].body, original);
  h.pr.labels = [];
  assert.equal((await h.call()).status, 'updated'); assert.equal(h.comments.length, 1);
});
