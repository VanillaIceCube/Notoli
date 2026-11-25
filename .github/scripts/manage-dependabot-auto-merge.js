"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const policyContext = "Dependabot Policy";

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

function verifyReviews(reviews, head, reviewerLogins = Object.keys(reviewers)) {
  if (reviewerLogins.length !== 3 || new Set(reviewerLogins).size !== 3 ||
      !reviewerLogins.every((login) => /^[\w-]+\[bot\]$/.test(login))) {
    throw new Error("Three distinct configured reviewer bot logins are required");
  }
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
  for (const login of reviewerLogins) {
    const review = latest.get(login);
    if (review?.state !== "APPROVED" || review.user.type !== "Bot" || review.commit_id !== head) {
      throw new Error(`Missing current-head approval: ${login}`);
    }
  }
}

function scopeAllowsSkip(name, files) {
  if (!Array.isArray(files)) return false;
  const result = spawnSync(process.execPath, [path.join(__dirname, "check-dependabot-skip-scope.js")], {
    input: JSON.stringify({ name, files }), encoding: "utf8", maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("Unable to authorize skipped check against the reviewed scope detector");
  return JSON.parse(result.stdout) === true;
}

function verifyChecks(rules, checks, files, policyCheckId) {
  const required = rules.filter((rule) => rule.type === "required_status_checks")
    .flatMap((rule) => rule.parameters.required_status_checks);
  if (!rules.some((rule) => rule.type === "pull_request") || required.length === 0) {
    throw new Error("Protected-branch PR and status-check rules are required");
  }
  if (!required.some((check) => check.context === policyContext && check.integration_id === 15368)) {
    throw new Error("Dependabot Policy must be required from GitHub Actions before activation");
  }
  for (const name of Object.values(reviewers)) {
    if (!required.some((check) => check.context === name)) {
      throw new Error(`Reviewer is not required by branch rules: ${name}`);
    }
  }
  const externalCheck = required.find((check) => check.integration_id != null &&
    check.integration_id !== 15368);
  if (externalCheck) {
    throw new Error(`Manual merge required: ${externalCheck.context} is bound to a provider outside this policy`);
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
    if (requirement.context === policyContext) {
      if (check && check.id === policyCheckId && check.status === "in_progress" && !check.conclusion) continue;
      const error = new Error("Required check Dependabot Policy is not pending for this run");
      error.retryable = !check || check.id < policyCheckId || (check.id === policyCheckId && check.status === "queued");
      throw error;
    }
    const expectedSkip = scopedChecks.has(requirement.context) && check?.conclusion === "skipped" &&
      scopeAllowsSkip(requirement.context, files);
    if (check?.status !== "completed" || (check.conclusion !== "success" && !expectedSkip)) {
      const error = new Error(`Required check is not passing: ${requirement.context} (status=${check?.status ?? "missing"}, conclusion=${check?.conclusion ?? "none"})`);
      error.retryable = !check || ["queued", "in_progress", "waiting", "pending"].includes(check.status);
      throw error;
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
      !run.head_repository?.full_name || run.head_sha !== eventRun.head_sha) {
    throw new Error("Run is not successful PR CI from the configured workflow");
  }
  const candidates = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit,
    { owner, repo, commit_sha: run.head_sha, per_page: 100 });
  const matches = candidates.filter((pr) => pr.base?.repo?.full_name === `${owner}/${repo}` &&
    pr.base.ref === "main" && pr.head.repo?.full_name === run.head_repository.full_name && pr.head.sha === run.head_sha && pr.state === "open");
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("CI head matches multiple open main pull requests");
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: matches[0].number });
  if (pr.base?.repo?.full_name !== `${owner}/${repo}` || pr.base.ref !== "main" ||
      pr.head.repo?.full_name !== run.head_repository.full_name || pr.head.sha !== run.head_sha) throw new Error("PR changed after CI");
  return pr.state === "open" ? pr : null;
}

function parseMetadata(message) {
  const result = spawnSync(process.execPath, [path.join(__dirname, "parse-dependabot-metadata.js")], {
    input: JSON.stringify(message), encoding: "utf8", maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`Dependabot update metadata is missing or invalid: ${result.error?.message || result.stderr}`);
  return JSON.parse(result.stdout);
}

function verifyAlerts(dependencies, alerts) {
  const normalize = (name) => name.toLowerCase().replace(/[-_.]+/g, "-");
  for (const alert of alerts) {
    const packageName = normalize(alert.dependency?.package?.name || "");
    if (alert.state !== "open" || !packageName || !dependencies.some((dependency) => {
      const name = normalize(dependency.dependencyName);
      return name === packageName || name.startsWith(packageName + "/") || packageName.startsWith(name + "/");
    })) continue;
    const scores = [alert.security_advisory?.cvss?.score,
      alert.security_advisory?.cvss_severities?.cvss_v3?.score,
      alert.security_advisory?.cvss_severities?.cvss_v4?.score].filter((score) => typeof score === "number" && Number.isFinite(score));
    if (!scores.length || Math.max(...scores) > 6.9 || Math.min(...scores) < 0) {
      throw new Error("An updated dependency has an open alert above the CVSS ceiling or without a valid score");
    }
  }
}

async function enableAutoMerge({ github, context, core, policyCheckId, expected, reviewerLogins, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`;
  if (context.eventName !== "workflow_run" || !expected?.headSha ||
      expected.headSha !== context.payload.workflow_run?.head_sha || !Number.isSafeInteger(expected.number) ||
      expected.number <= 0 || !expected.nodeId) throw new Error("Missing verified PR identity for this CI head");
  const request = { owner, repo, pull_number: expected.number };
  let pr;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    ({ data: pr } = await github.rest.pulls.get(request));
    if (!trusted(pr, repository) || pr.head.sha !== expected.headSha || pr.node_id !== expected.nodeId) {
      throw new Error("PR identity or head changed; run CI for the current head");
    }
    if (pr.state !== "open" || pr.merged || pr.draft) return "inactive";
    if (pr.mergeable !== null && pr.mergeable_state !== "unknown" && pr.mergeable_state !== "clean") break;
    if (attempt < 5) {
      core.info("GitHub is calculating mergeability; retrying in two seconds.");
      await sleep(2000);
    }
  }
  if (pr.mergeable !== true || pr.mergeable_state !== "blocked") {
    throw new Error(`PR merge state is not stable: ${pr.mergeable_state}`);
  }
  const rules = await github.paginate(github.rest.repos.getBranchRules, {
    owner, repo, branch: pr.base.ref, per_page: 100,
    headers: { "X-GitHub-Api-Version": "2026-03-10" },
  });
  // Use API diff paths, including renames, for skip authorization on every read.
  const files = await github.paginate(github.rest.pulls.listFiles, { ...request, per_page: 100 });
  const paths = files.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const checks = await github.paginate(github.rest.checks.listForRef, { owner, repo, ref: pr.head.sha, per_page: 100 });
    try {
      verifyChecks(rules, checks, paths, policyCheckId);
      break;
    } catch (error) {
      if (!error.retryable || attempt === 5) throw error;
      core.info(error.message);
    }
    const { data: current } = await github.rest.pulls.get(request);
    if (!trusted(current, repository) || current.head.sha !== pr.head.sha || current.node_id !== pr.node_id) {
      throw new Error("PR identity or head changed while waiting for policy check visibility");
    }
    core.info("Waiting for exact-head required checks to become consistently completed; retrying in two seconds.");
    await sleep(2000);
  }
  const commits = await github.paginate(github.rest.pulls.listCommits, { ...request, per_page: 100 });
  if (commits.length !== 1 || commits[0].sha !== pr.head.sha || commits[0].author?.login !== "dependabot[bot]" ||
      !commits[0].commit?.verification?.verified) {
    throw new Error("Automatic merge requires exactly one verified Dependabot commit matching the current head");
  }
  const { data: currentHead } = await github.rest.pulls.get(request);
  if (!trusted(currentHead, repository) || currentHead.head.sha !== pr.head.sha || currentHead.node_id !== pr.node_id || currentHead.state !== "open") {
    throw new Error("PR identity or head changed after check readiness validation");
  }
  const dependencies = parseMetadata(commits[0].commit.message);
  if (dependencies.some((dependency) => dependency.shaOnly) &&
      (!paths.length || !paths.every((file) => /^\.github\/(?:workflows\/[^/]+\.ya?ml|actions\/.+\/action\.ya?ml)$/.test(file)))) {
    throw new Error("SHA-only metadata requires an exclusively GitHub Actions YAML diff; manual investigation required");
  }
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...request, per_page: 100 });
  verifyReviews(reviews, pr.head.sha, reviewerLogins);
  if (!dependencies.every((dependency) => typeof dependency.dependencyName === "string" &&
      ["version-update:semver-patch", "version-update:semver-minor"].includes(dependency.updateType))) {
    if (pr.auto_merge) await github.graphql('mutation($id: ID!) { disablePullRequestAutoMerge(input: {pullRequestId: $id}) { pullRequest { number } } }', { id: pr.node_id });
    core.info("Update requires manual merge under the dependency policy.");
    return "ineligible";
  }
  const alerts = await github.paginate(github.rest.dependabot.listAlertsForRepo, { owner, repo, state: "open", per_page: 100 });
  verifyAlerts(dependencies, alerts);
  if (pr.auto_merge) {
    core.info("Auto-merge is already enabled for this reviewed head.");
    return "already-enabled";
  }
  try {
    // GitHub's live EnablePullRequestAutoMergeInput includes expectedHeadOid.
    // The read-only Auto Merge CI probe checks that schema with its actual token.
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

async function startPolicy({ github, context, core }) {
  const pr = await resolveRun({ github, context });
  if (!pr) {
    core.info("No current open main PR for this successful CI head.");
    return;
  }
  const { data: check } = await github.rest.checks.create({
    ...context.repo, name: policyContext, head_sha: pr.head.sha,
    status: "in_progress", external_id: String(context.payload.workflow_run.id),
  });
  core.setOutput("policy_id", check.id);
  core.setOutput("base_sha", pr.base.sha);
  core.setOutput("head_sha", pr.head.sha);
  core.setOutput("number", pr.number);
  core.setOutput("node_id", pr.node_id);
  core.setOutput("eligible", trusted(pr, `${context.repo.owner}/${context.repo.repo}`));
}

async function checkAndEnable({ github, context, core }) {
  const env = process.env;
  return enableAutoMerge({ github, context, core, policyCheckId: Number(env.POLICY_CHECK_ID),
    expected: { number: Number(env.PR_NUMBER), headSha: env.HEAD_SHA, nodeId: env.PR_NODE_ID },
    reviewerLogins: [env.OBI_WAN_REVIEWER_LOGIN, env.LINT_EASTWOOD_REVIEWER_LOGIN, env.ROBOCOP_REVIEWER_LOGIN],
  });
}

async function finishPolicy({ github, context }) {
  const passed = process.env.JOB_STATUS === "success";
  await github.rest.checks.update({
    ...context.repo, check_run_id: Number(process.env.POLICY_CHECK_ID), status: "completed",
    conclusion: passed ? "success" : "failure",
    output: { title: "Dependabot policy for this exact head", summary: passed
      ? "Workflow write grants passed. Eligible Dependabot updates also met the auto-merge policy. GitHub enforces all branch requirements."
      : "Policy validation failed; native auto-merge remains blocked by this required check." },
  });
}

module.exports = { startPolicy, checkAndEnable, finishPolicy, scopeAllowsSkip, enableAutoMerge, independentChecks, parseMetadata, policyContext, reviewers, resolveRun, verifyAlerts, verifyReviews };
