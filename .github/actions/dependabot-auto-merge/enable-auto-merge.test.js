"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { scopeAllowsSkip, enableAutoMerge, eligible, independentChecks, parseMetadata, policyContext, reviewers, resolveRun, verifyAlerts, verifyReviews } = require("./enable-auto-merge");

function harness() {
  const h = {
    pr: {
      number: 1, node_id: "PR_1", state: "open", merged: false, draft: false,
      user: { login: "dependabot[bot]", type: "Bot" },
      head: { sha: "a".repeat(40), repo: { full_name: "owner/app" } },
      base: { ref: "main", repo: { full_name: "owner/app" } },
      mergeable: true, mergeable_state: "blocked", auto_merge: null,
    },
    metadata: { updateType: "version-update:semver-patch", alertState: "", cvss: "0" },
    calls: [],
    policyCheckId: 10000,
  };
  h.context = { eventName: "pull_request", repo: { owner: "owner", repo: "app" }, payload: { pull_request: structuredClone(h.pr) } };
  const names = [...independentChecks, ...Object.values(reviewers)];
  h.rules = [{ type: "pull_request" }, { type: "required_status_checks", parameters: { required_status_checks: [...names.map((context) => ({ context })), { context: policyContext, integration_id: 15368 }] } }];
  h.checks = names.map((name, id) => ({ id, name, status: "completed", conclusion: "success", app: { id: 15368, slug: "github-actions" } }));
  h.checks.push({ id: h.policyCheckId, name: policyContext, status: "in_progress", conclusion: null, app: { id: 15368, slug: "github-actions" } });
  h.reviews = Object.keys(reviewers).map((login, id) => ({ id, user: { login, type: "Bot" }, state: "APPROVED", commit_id: h.pr.head.sha }));
  h.run = { id: 8, workflow_id: 7, event: "pull_request", conclusion: "success", head_repository: { full_name: "owner/app" }, head_sha: h.pr.head.sha };
  h.github = {
    rest: {
      pulls: { get: async () => ({ data: structuredClone(h.pr) }), listReviews() {}, listFiles() {}, listCommits() {} },
      dependabot: { listAlertsForRepo() {} },
      repos: { getBranchRules() {}, listPullRequestsAssociatedWithCommit() {} },
      checks: { listForRef() {} },
      actions: { getWorkflowRun: async () => ({ data: h.run }), getWorkflow: async () => ({ data: { id: 7 } }) },
    },
    async paginate(method, params) {
      assert.equal(params.per_page, 100);
      if (method === h.github.rest.pulls.listReviews) return h.reviews;
      if (method === h.github.rest.pulls.listFiles) return h.files || [];
      if (method === h.github.rest.pulls.listCommits) return h.commits || [{ sha: h.pr.head.sha, author: { login: "dependabot[bot]" }, commit: { verification: { verified: true }, message: `Update\n\n---\n${JSON.stringify({ "updated-dependencies": h.dependencies || [{ "dependency-name": "example", "update-type": h.metadata.updateType }] })}\n...\n` } }];
      if (method === h.github.rest.dependabot.listAlertsForRepo) return h.alerts || [];
      if (method === h.github.rest.repos.getBranchRules) return h.rules;
      if (method === h.github.rest.repos.listPullRequestsAssociatedWithCommit) return [h.pr];
      assert.equal(params.ref, h.context.payload.pull_request.head.sha);
      return h.checks;
    },
    async graphql(query, variables) {
      h.calls.push({ query, variables });
      h.pr.auto_merge = { merge_method: "merge" };
    },
  };
  h.core = { info() {} };
  h.sleep = async () => {};
  h.enable = () => enableAutoMerge(h);
  h.resolve = () => resolveRun({ ...h, context: { ...h.context, eventName: "workflow_run", payload: { workflow_run: { id: 8, head_sha: "a".repeat(40) } } } });
  return h;
}

test("enables only native auto-merge with an atomic expected head; repeats are idempotent", async () => {
  const h = harness();
  assert.equal(await h.enable(), "enabled");
  assert.equal(await h.enable(), "already-enabled");
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].query, /enablePullRequestAutoMerge/);
  assert.match(h.calls[0].query, /expectedHeadOid: \$head/);
  assert.equal(h.calls[0].variables.head, h.pr.head.sha);
});

test("patch/minor eligibility preserves CVSS ceiling and rejects malformed or major metadata", () => {
  for (const updateType of ["version-update:semver-patch", "version-update:semver-minor"]) {
    assert.equal(eligible({ updateType, alertState: "", cvss: "" }), true);
    for (const cvss of ["0", "6.9"]) assert.equal(eligible({ updateType, alertState: "OPEN", cvss }), true);
    for (const cvss of ["", "NaN", "6.9garbage", "7", "-1", "Infinity"]) assert.equal(eligible({ updateType, alertState: "OPEN", cvss }), false);
  }
  assert.equal(eligible({ updateType: "version-update:semver-major", alertState: "" }), false);
  assert.equal(eligible({ updateType: "version-update:semver-patch", alertState: "unknown" }), false);
});

test("human, fork, production and non-PR events skip without credentials or mutation", async () => {
  for (const mutate of [
    (h) => { h.context.payload.pull_request.user.login = "human"; },
    (h) => { h.context.payload.pull_request.head.repo.full_name = "fork/app"; },
    (h) => { h.context.payload.pull_request.base.ref = "env-prod"; },
    (h) => { h.context.eventName = "push"; },
    (h) => { h.context.payload = {}; },
  ]) {
    const h = harness(); mutate(h);
    h.github.rest.pulls.get = async () => { throw new Error("API must not be used"); };
    assert.equal(await h.enable(), "inapplicable");
    assert.equal(h.calls.length, 0);
  }
});

test("missing metadata fails; ineligible updates skip without mutation", async () => {
  const h = harness(); h.metadata = {};
  await assert.rejects(h.enable(), /metadata is missing/);
  h.metadata.updateType = "version-update:semver-major";
  assert.equal(await h.enable(), "ineligible");
  assert.equal(h.calls.length, 0);
});

test("failed, missing, pending, cancelled and skipped reviewers cannot enable auto-merge", async () => {
  for (const conclusion of ["failure", "cancelled", "skipped", "neutral", null]) {
    const h = harness(); h.checks.find((check) => check.name === Object.values(reviewers)[0]).conclusion = conclusion;
    await assert.rejects(h.enable(), /Required check/);
    assert.equal(h.calls.length, 0);
  }
  const h = harness(); h.checks = h.checks.filter((check) => check.name !== Object.values(reviewers)[0]);
  await assert.rejects(h.enable(), /Required check/);
});

test("all required gates, integration identity, and protected-branch rules are checked", async () => {
  for (const mutate of [
    (h) => { h.checks[0].conclusion = "failure"; },
    (h) => { h.checks[0].status = "in_progress"; },
    (h) => { h.checks[0].app.slug = "other-app"; },
    (h) => { h.rules = []; },
    (h) => { h.rules[1].parameters.required_status_checks.pop(); },
    (h) => { h.rules[1].parameters.required_status_checks[0].integration_id = 9; },
  ]) {
    const h = harness(); mutate(h);
    await assert.rejects(h.enable());
    assert.equal(h.calls.length, 0);
  }
});

test("latest check rerun supersedes an earlier failure, but not a newer pending rerun", async () => {
  const h = harness();
  h.checks.push({ ...h.checks[0], id: 100, conclusion: "failure" });
  await assert.rejects(h.enable(), /Required check/);
  h.checks.push({ ...h.checks[0], id: 101 });
  assert.equal(await h.enable(), "enabled");
  h.checks.push({ ...h.checks[0], id: 102, status: "queued", conclusion: null });
  await assert.rejects(h.enable(), /Required check/);
});

test("CodeQL skips require successful detection and authoritative matching diff scope", async () => {
  assert.equal(scopeAllowsSkip("CodeQL / Analyze Python", ["frontend/package-lock.json"]), true);
  assert.equal(scopeAllowsSkip("CodeQL / Analyze JavaScript/TypeScript", ["backend/requirements.txt"]), true);
  assert.equal(scopeAllowsSkip("CodeQL / Analyze GitHub Actions", ["README.md"]), true);
  for (const files of [undefined, ["backend/requirements.txt"], [".github/workflows/gate-codeql.yml"], [".github/actions/guard/action.yml"]]) {
    assert.equal(scopeAllowsSkip("CodeQL / Analyze Python", files), false);
  }
  const h = harness(); const name = "CodeQL / Analyze Python";
  h.rules[1].parameters.required_status_checks.push({ context: name });
  h.checks.push({ ...h.checks[0], name, conclusion: "skipped", id: 100 });
  h.files = [{ filename: "frontend/package-lock.json" }];
  assert.equal(await h.enable(), "enabled");
  h.files = [{ filename: ".github/workflows/gate-codeql.yml" }];
  await assert.rejects(h.enable(), /Required check/);
  h.files = [{ filename: "docs/moved.py", previous_filename: "backend/moved.py" }];
  await assert.rejects(h.enable(), /Required check/);
});

test("lint and test skips require the actual detector to authorize that path scope", async () => {
  for (const [name, file] of [
    ["Lints / Lint Frontend (ESLint + Prettier)", "frontend/package.json"],
    ["Lints / Lint Backend (Ruff)", "backend/requirements.txt"],
    ["Tests / Frontend Tests (React)", "frontend/package-lock.json"],
    ["Tests / Backend Tests (Django)", "backend/app/settings.py"],
    ["Tests / Automation Tests (Node)", ".github/actions/publish-ai-review/action.yml"],
  ]) {
    assert.equal(scopeAllowsSkip(name, [file]), false, name);
    assert.equal(scopeAllowsSkip(name, ["README.md"]), true, name);
    const h = harness();
    h.rules[1].parameters.required_status_checks.push({ context: name });
    h.checks.push({ ...h.checks[0], name, conclusion: "skipped", id: 100 });
    h.files = [{ filename: file }];
    await assert.rejects(h.enable(), /Required check/);
  }
});


test("approvals must come from every persona on this head; comments do not clear blockers", async () => {
  for (const mutate of [
    (h) => { h.reviews.pop(); },
    (h) => { h.reviews[0].state = "COMMENTED"; },
    (h) => { h.reviews[0].commit_id = "old"; },
    (h) => { h.reviews[0].user.type = "User"; },
    (h) => { h.reviews.push({ id: 100, user: { login: "human" }, state: "CHANGES_REQUESTED" }); },
  ]) {
    const h = harness(); mutate(h);
    await assert.rejects(h.enable(), /approval|requesting changes/);
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  h.reviews.push({ id: 100, user: { login: "human" }, state: "CHANGES_REQUESTED" });
  h.reviews.push({ id: 101, user: { login: "human" }, state: "COMMENTED" });
  assert.throws(() => verifyReviews(h.reviews, h.pr.head.sha), /requesting changes/);
});

test("unstable, conflicting, unknown and changed heads cannot merge", async () => {
  for (const state of ["unstable", "dirty", "unknown", "behind"]) {
    const h = harness(); h.pr.mergeable_state = state;
    await assert.rejects(h.enable(), /not stable/);
    assert.equal(h.calls.length, 0);
  }
  const h = harness(); h.pr.head.sha = "new";
  await assert.rejects(h.enable(), /head changed/);
  for (const field of ["draft", "merged"]) {
    const h = harness(); h.pr[field] = true;
    assert.equal(await h.enable(), "inactive");
  }
});

test("mutation races are idempotent only when the same head is already enabled", async () => {
  const h = harness();
  h.github.graphql = async () => { h.pr.auto_merge = {}; throw new Error("concurrent event"); };
  assert.equal(await h.enable(), "already-enabled");
  const failed = harness();
  failed.github.graphql = async () => { throw new Error("permission denied"); };
  await assert.rejects(failed.enable(), /permission denied/);
  const moved = harness();
  moved.github.graphql = async () => { moved.pr.head.sha = "new"; moved.pr.auto_merge = {}; throw new Error("head moved"); };
  await assert.rejects(moved.enable(), /head moved/);
});

test("transient unknown mergeability settles with bounded polling and head revalidation", async () => {
  const h = harness();
  h.pr.mergeable = null; h.pr.mergeable_state = "unknown";
  let retries = 0;
  h.sleep = async (ms) => {
    assert.equal(ms, 2000);
    retries += 1;
    h.pr.mergeable = true; h.pr.mergeable_state = "blocked";
  };
  assert.equal(await h.enable(), "enabled");
  assert.equal(retries, 1);
  const stuck = harness(); stuck.pr.mergeable = null; stuck.pr.mergeable_state = "unknown";
  let waits = 0; stuck.sleep = async () => { waits += 1; };
  await assert.rejects(stuck.enable(), /not stable/);
  assert.equal(waits, 5);
  assert.equal(stuck.calls.length, 0);
  const moved = harness(); moved.pr.mergeable = null;
  moved.sleep = async () => { moved.pr.head.sha = "new"; };
  await assert.rejects(moved.enable(), /head changed/);
});

test("follow-up validates authoritative CI identity, result and head, independent of rerun actor", async () => {
  const h = harness();
  assert.equal((await h.resolve()).number, 1);
  for (const patch of [
    { workflow_id: 99 }, { event: "push" }, { conclusion: "failure" },
    { conclusion: "cancelled" }, { head_sha: "new" },
  ]) {
    const h = harness(); Object.assign(h.run, patch);
    await assert.rejects(h.resolve(), /not successful/);
  }
  const human = harness(); human.pr.user.login = "human";
  assert.equal((await human.resolve()).user.login, "human");
  const fork = harness(); fork.pr.head.repo.full_name = "fork/app";
  fork.run.head_repository.full_name = "fork/app";
  assert.equal((await fork.resolve()).head.repo.full_name, "fork/app");
});

test("every group member needs explicit patch/minor metadata", async () => {
  const h = harness();
  h.dependencies = [{ "dependency-name": "one", "update-type": "version-update:semver-patch" }, { "dependency-name": "two", "update-type": "version-update:semver-major" }];
  assert.equal(await h.enable(), "ineligible");
  assert.equal(h.calls.length, 0);
  h.dependencies[1]["update-type"] = undefined;
  await assert.rejects(h.enable(), /metadata is missing/);
});

test("signed metadata is bound to the only PR commit and exact current head", async () => {
  for (const commits of [[], [{ sha: "other", author: { login: "dependabot[bot]" }, commit: { verification: { verified: true } } }],
    [{ sha: "a".repeat(40), author: { login: "human" }, commit: { verification: { verified: true } } }],
    [{ sha: "a".repeat(40), author: { login: "dependabot[bot]" }, commit: { verification: { verified: false } } }],
    [{}, {}]]) {
    const h = harness(); h.commits = commits;
    await assert.rejects(h.enable(), /exactly one verified Dependabot commit/);
    assert.equal(h.calls.length, 0);
  }
  assert.throws(() => parseMetadata("No metadata"), /metadata is missing/);
});

test("all open alerts across all group members enforce the CVSS ceiling", async () => {
  const dependencies = [{ dependencyName: "one" }, { dependencyName: "two" }];
  const alert = (name, state, score) => ({ state, dependency: { package: { name } }, security_advisory: { cvss: { score } } });
  verifyAlerts(dependencies, [alert("one", "dismissed", 9.8), alert("two", "fixed", 9.8)]);
  assert.throws(() => verifyAlerts(dependencies, [alert("one", "open", 1), alert("two", "open", 9.8)]), /CVSS/);
  assert.throws(() => verifyAlerts(dependencies, [alert("two", "open", null)]), /CVSS/);
  assert.throws(() => verifyAlerts([{ dependencyName: "github/codeql-action/init" }], [alert("github/codeql-action", "open", 9.8)]), /CVSS/);
  const h = harness(); h.alerts = Array.from({ length: 101 }, () => alert("other", "open", 1));
  h.alerts.push(alert("example", "open", 9.8));
  await assert.rejects(h.enable(), /CVSS/);
  assert.equal(h.calls.length, 0);
});

test("a required pending per-head policy holds native auto-merge through later pushes", async () => {
  const h = harness(); h.rules[1].parameters.required_status_checks.pop();
  await assert.rejects(h.enable(), /Policy must be required/);
  const changed = harness(); changed.checks.at(-1).id = 20000;
  await assert.rejects(changed.enable(), /Required check/);
  const clean = harness(); clean.pr.mergeable_state = "clean";
  await assert.rejects(clean.enable(), /not stable/);
});

test("policy check visibility is polled boundedly without trusting a stale head", async () => {
  const h = harness(); const paginate = h.github.paginate.bind(h.github);
  let reads = 0; let waits = 0;
  h.github.paginate = async (method, params) => {
    if (method === h.github.rest.checks.listForRef && reads++ === 0) return h.checks.filter((check) => check.name !== policyContext);
    return paginate(method, params);
  };
  h.sleep = async () => { waits += 1; };
  assert.equal(await h.enable(), "enabled");
  assert.equal(reads, 2); assert.equal(waits, 1);
  const stuck = harness(); stuck.checks = stuck.checks.filter((check) => check.name !== policyContext);
  let stuckWaits = 0; stuck.sleep = async () => { stuckWaits += 1; };
  await assert.rejects(stuck.enable(), /Required check/);
  assert.equal(stuckWaits, 5); assert.equal(stuck.calls.length, 0);
  const moved = harness(); moved.checks = moved.checks.filter((check) => check.name !== policyContext);
  moved.sleep = async () => { moved.pr.head.sha = "new"; };
  await assert.rejects(moved.enable(), /head changed/);
});

test("generated apps can configure three distinct reviewer bot identities", () => {
  const head = "head";
  const logins = ["app-code[bot]", "app-build[bot]", "app-security[bot]"];
  verifyReviews(logins.map((login, id) => ({ id, state: "APPROVED", commit_id: head, user: { login, type: "Bot" } })), head, logins);
  assert.throws(() => verifyReviews([], head, ["same[bot]", "same[bot]", "other[bot]"]), /Three distinct/);
});

test("privileged workflow uses only main code and verified metadata, with no immediate merge path", () => {
  const workflows = path.resolve(__dirname, "../../workflows");
  const workflow = fs.readFileSync(path.join(workflows, "ci-auto-merge.yml"), "utf8");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \[CI\]/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /context: \{ repo: context.repo, eventName: 'pull_request', payload \}/);
  assert.doesNotMatch(workflow, /pull_request_target|workflow_dispatch|secrets\.|download-artifact|actions\/cache|skip-verification|skip-commit-verification/);
  for (const pin of workflow.matchAll(/uses: ([^\s]+)@([^\s]+)/g)) assert.match(pin[2], /^[a-f0-9]{40}$/);
  const source = fs.readFileSync(__filename.replace(".test.js", ".js"), "utf8");
  assert.doesNotMatch(source, /pulls\.merge|mergePullRequest\(/);
  const orchestrator = fs.readFileSync(path.join(workflows, "ci-orchestrator.yml"), "utf8");
  assert.doesNotMatch(orchestrator, /uses: .*ci-auto-merge.yml/);
  assert.match(orchestrator, /needs: \[lints, tests, codeql, dependency-vulnerability, dependency-malware, code-review, build-review, security-review\]/);
  const gate = fs.readFileSync(path.join(workflows, "gate-test.yml"), "utf8");
  assert.match(gate, /\.github\/actions\/dependabot-auto-merge\/\*\.test.js/);
  assert.match(gate, /'\.github\/workflows\/ci-auto-merge.yml'/);
  assert.match(gate, /'\.github\/workflows\/ci-orchestrator.yml'/);
  assert.match(workflow, /vulnerability-alerts: read/);
  assert.match(workflow, /checks: write/);
  assert.match(workflow, /github.rest.checks.create/);
  assert.match(workflow, /github.rest.checks.update/);
  assert.doesNotMatch(workflow, /GITHUB_EVENT_PATH:/);
  const reviewCode = fs.readFileSync(path.join(workflows, "review-code.yml"), "utf8");
  assert.doesNotMatch(reviewCode, /require\(`\$\{process.env.GITHUB_WORKSPACE\}\/\.github\/actions\/dependabot-auto-merge/);
});


test("SHA-only signed Action metadata takes a reviewed manual path without semver guessing", async () => {
  const h = harness();
  h.dependencies = [{ "dependency-name": "dorny/paths-filter", "dependency-version": "f3360c560367c9daf72b88c0e6164162034c5721", "dependency-type": "direct:production" }];
  h.files = [{ filename: ".github/workflows/gate-test.yml" }];
  assert.equal(await h.enable(), "ineligible");
  assert.equal(h.calls.length, 0);
  h.reviews.pop();
  await assert.rejects(h.enable(), /approval/);
  h.reviews = harness().reviews;
  h.files.push({ filename: "frontend/package.json" });
  await assert.rejects(h.enable(), /exclusively GitHub Actions/);
  h.files = [{ filename: ".github/workflows/gate-test.yml" }];
  h.dependencies.push({ "dependency-name": "other" });
  await assert.rejects(h.enable(), /metadata is missing/);
});

test("inconsistent success/in-progress checks wait for actual completion, boundedly", async () => {
  const h = harness();
  const detector = h.checks.find(check => check.name === "Tests / Detect Changes");
  detector.status = "in_progress";
  detector.completed_at = "2026-11-05T00:06:10Z";
  let waits = 0;
  h.sleep = async () => { waits++; detector.status = "completed"; };
  assert.equal(await h.enable(), "enabled");
  assert.equal(waits, 1);
  const stuck = harness();
  Object.assign(stuck.checks[2], { status: "in_progress", conclusion: "success", completed_at: detector.completed_at });
  let attempts = 0;
  stuck.sleep = async () => { attempts++; };
  await assert.rejects(stuck.enable(), /Required check.*in_progress/);
  assert.equal(attempts, 5);
  assert.equal(stuck.calls.length, 0);
});

test("delayed checks cannot authorize failed or changed heads", async () => {
  for (const state of ["failure", "skipped", "cancelled"]) {
    const h = harness(); h.checks[0].conclusion = state;
    let waits = 0; h.sleep = async () => { waits++; };
    await assert.rejects(h.enable(), /Required check/);
    assert.equal(waits, 0); assert.equal(h.calls.length, 0);
  }
  const h = harness(); h.checks[0].status = "queued";
  h.sleep = async () => { h.pr.head.sha = "new"; };
  await assert.rejects(h.enable(), /head changed/);
  assert.equal(h.calls.length, 0);
});
