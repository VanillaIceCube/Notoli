"use strict";

const reviewers = {
  "obi-wan-code-nobi-reviewer[bot]": "AI Code Review / Obi-Wan Code-nobi code review",
  "lint-eastwood-build-sheriff[bot]": "AI Build Sheriff Review / Lint Eastwood build sheriff review",
  "robocop-security-officer[bot]": "AI Security Review / RoboCop security review",
};
const independentChecks = [
  "Lints / Detect Changes", "Lints / Lint Results", "Tests / Detect Changes",
  "Tests / Test Results", "CodeQL / Detect CodeQL Scope",
  "Vulnerability / Vulnerability", "Malware / Malware", "Auto Merge",
];
const scopedChecks = new Set([
  "Lints / Lint Frontend (ESLint + Prettier)", "Lints / Lint Backend (Ruff)",
  "Tests / Frontend Tests (React)", "Tests / Backend Tests (Django)",
  "Tests / Automation Tests (Node)", "CodeQL / Analyze Python",
  "CodeQL / Analyze JavaScript/TypeScript", "CodeQL / Analyze GitHub Actions",
]);

function trusted(pr, repository) {
  return pr?.user?.login === "dependabot[bot]" && pr.user.type === "Bot" &&
    pr.head?.repo?.full_name === repository && pr.base?.repo?.full_name === repository &&
    pr.base.ref === "main";
}

function eligible({ updateType, alertState, cvss }) {
  if (!["version-update:semver-patch", "version-update:semver-minor"].includes(updateType)) return false;
  if (alertState === "OPEN") {
    const score = cvss?.trim() ? Number(cvss) : NaN;
    return Number.isFinite(score) && score >= 0 && score <= 6.9;
  }
  return ["", "CLOSED", "DISMISSED", "FIXED"].includes(alertState);
}

function verifyReviews(reviews, head) {
  const latest = new Map();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    // A later comment does not clear a requested-changes review.
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) {
      latest.set(review.user?.login, review);
    }
  }
  if ([...latest.values()].some((review) => review.state === "CHANGES_REQUESTED")) {
    throw new Error("A reviewer is requesting changes");
  }
  for (const login of Object.keys(reviewers)) {
    const review = latest.get(login);
    if (review?.state !== "APPROVED" || review.user.type !== "Bot" || review.commit_id !== head) {
      throw new Error(`Missing current-head approval: ${login}`);
    }
  }
}

function verifyChecks(rules, checks) {
  const required = rules.filter((rule) => rule.type === "required_status_checks")
    .flatMap((rule) => rule.parameters.required_status_checks);
  if (!rules.some((rule) => rule.type === "pull_request") || required.length === 0) {
    throw new Error("Protected-branch PR and status-check rules are required");
  }
  for (const name of Object.values(reviewers)) {
    if (!required.some((check) => check.context === name)) {
      throw new Error(`Reviewer is not required by branch rules: ${name}`);
    }
  }
  const requirements = [...required];
  for (const context of independentChecks) {
    if (!requirements.some((item) => item.context === context)) requirements.push({ context });
  }
  for (const requirement of requirements) {
    const check = checks.filter((item) => item.name === requirement.context &&
      item.app?.slug === "github-actions" &&
      (!requirement.integration_id || item.app.id === requirement.integration_id))
      .sort((a, b) => b.id - a.id)[0];
    const expectedSkip = scopedChecks.has(requirement.context) && check?.conclusion === "skipped";
    if (check?.status !== "completed" || (check.conclusion !== "success" && !expectedSkip)) {
      throw new Error(`Required check is not passing: ${requirement.context}`);
    }
  }
}

async function resolveRun({ github, context }) {
  const { owner, repo } = context.repo;
  const eventRun = context.payload.workflow_run;
  if (context.eventName !== "workflow_run" || !eventRun?.id) throw new Error("Expected a CI workflow_run event");
  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: eventRun.id });
  const { data: workflow } = await github.rest.actions.getWorkflow({ owner, repo, workflow_id: "ci-orchestrator.yml" });
  if (run.workflow_id !== workflow.id || run.event !== "pull_request" || run.conclusion !== "success" ||
      run.head_repository?.full_name !== `${owner}/${repo}` || run.head_sha !== eventRun.head_sha) {
    throw new Error("Run is not successful same-repository PR CI");
  }
  const candidates = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit,
    { owner, repo, commit_sha: run.head_sha, per_page: 100 });
  const matches = candidates.filter((pr) => trusted(pr, `${owner}/${repo}`) && pr.head.sha === run.head_sha && pr.state === "open");
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("CI head does not identify exactly one trusted Dependabot PR");
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: matches[0].number });
  if (!trusted(pr, `${owner}/${repo}`) || pr.head.sha !== run.head_sha) throw new Error("PR changed after CI");
  return pr;
}

async function enableAutoMerge({ github, context, core, metadata, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const eventPr = context.payload.pull_request;
  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`;
  if (context.eventName !== "pull_request" || !trusted(eventPr, repository)) {
    core.info("Auto-merge is not applicable to this PR.");
    return "inapplicable";
  }
  if (!metadata.updateType) throw new Error("Dependabot update metadata is missing");
  if (!eligible(metadata)) {
    core.info("Update requires manual merge under the dependency policy.");
    return "ineligible";
  }
  const request = { owner, repo, pull_number: eventPr.number };
  let pr;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    ({ data: pr } = await github.rest.pulls.get(request));
    if (!trusted(pr, repository) || pr.head.sha !== eventPr.head.sha || pr.node_id !== eventPr.node_id) {
      throw new Error("PR identity or head changed; run CI for the current head");
    }
    if (pr.state !== "open" || pr.merged || pr.draft) return "inactive";
    if (pr.mergeable !== null && pr.mergeable_state !== "unknown") break;
    if (attempt < 5) {
      core.info("GitHub is calculating mergeability; retrying in two seconds.");
      await sleep(2000);
    }
  }
  if (pr.mergeable !== true || !["clean", "blocked"].includes(pr.mergeable_state)) {
    throw new Error(`PR merge state is not stable: ${pr.mergeable_state}`);
  }
  const rules = await github.paginate(github.rest.repos.getBranchRules, { owner, repo, branch: pr.base.ref, per_page: 100 });
  const checks = await github.paginate(github.rest.checks.listForRef, { owner, repo, ref: pr.head.sha, per_page: 100 });
  verifyChecks(rules, checks);
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...request, per_page: 100 });
  verifyReviews(reviews, pr.head.sha);
  if (pr.auto_merge) {
    core.info("Auto-merge is already enabled for this reviewed head.");
    return "already-enabled";
  }
  try {
    await github.graphql(`mutation($id: ID!, $head: GitObjectID!) {
      enablePullRequestAutoMerge(input: {pullRequestId: $id, expectedHeadOid: $head, mergeMethod: MERGE}) {
        pullRequest { number }
      }
    }`, { id: pr.node_id, head: pr.head.sha });
  } catch (error) {
    // A concurrent copy may have enabled auto-merge; every other error remains visible.
    const { data: current } = await github.rest.pulls.get(request);
    if (!current.auto_merge || current.head.sha !== pr.head.sha) throw error;
    core.info("A concurrent event already enabled auto-merge for this head.");
    return "already-enabled";
  }
  core.info("Native protected-branch auto-merge enabled; GitHub enforces remaining branch requirements.");
  return "enabled";
}

module.exports = { enableAutoMerge, eligible, independentChecks, reviewers, resolveRun, trusted, verifyChecks, verifyReviews };
