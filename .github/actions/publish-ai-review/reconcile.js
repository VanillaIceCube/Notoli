"use strict";
const crypto = require("node:crypto");
const { identity } = require("../collect-prior-ai-reviews/collect");

const THREADS = `query($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
  repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
    headRefOid reviewThreads(first:100,after:$cursor) { pageInfo { hasNextPage endCursor }
      nodes { id isResolved isOutdated viewerCanResolve comments(first:100) {
        pageInfo { hasNextPage } nodes { id databaseId body diffHunk path originalLine
          originalCommit { oid } author { login ... on Bot { databaseId } }
        }
      } }
    }
  } }
}`;

function citedAddedLine(root) {
  if (!Number.isSafeInteger(root.originalLine) || root.originalLine < 1) return null;
  let line;
  for (const text of String(root.diffHunk || "").split("\n")) {
    const header = text.match(/^@@ .* \+(\d+)/);
    if (header) { line = Number(header[1]); continue; }
    if (line === undefined || text.startsWith("-") || text.startsWith("\\")) continue;
    if (text.startsWith("+") && line === root.originalLine) return text.slice(1);
    line++;
  }
  return null;
}

function replacementLine(patch, citedLine, removed, replacement) {
  let oldLine, newLine, deleted = [], added = [], result = null;
  const flush = () => {
    if (deleted.length === 1 && added.length === 1 && deleted[0].line === citedLine && deleted[0].text === removed && added[0].text === replacement) result = added[0].line;
    deleted = []; added = [];
  };
  for (const text of String(patch || "").split("\n")) {
    const header = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
    if (header) { flush(); oldLine = Number(header[1]); newLine = Number(header[2]); continue; }
    if (oldLine === undefined) continue;
    if (text.startsWith("-")) { deleted.push({ line: oldLine++, text: text.slice(1) }); }
    else if (text.startsWith("+")) { added.push({ line: newLine++, text: text.slice(1) }); }
    else if (!text.startsWith("\\")) { flush(); oldLine++; newLine++; }
  }
  flush();
  return result;
}

async function reconcileOnce({ github, context, core, parsed, appSlug, personaName = "Fixture" }) {
  const decisions = parsed.reconciliations;
  if (!Array.isArray(decisions) || decisions.length === 0) return;
  const report = { requested: decisions.length, followed_up: 0, resolved: 0, skipped: 0, unavailable: false };
  const pull = context.payload.pull_request;
  const expected = pull.head?.sha;
  const args = { ...context.repo, pull_number: pull.number };
  try {
    const bot = await identity(github, appSlug);
    const graphqlLogin = bot.login.replace(/\[bot\]$/, "");
    const current = async () => {
      const { data } = await github.rest.pulls.get(args);
      if (data.head.sha !== expected || data.state !== "open" || data.head.repo.full_name !== `${context.repo.owner}/${context.repo.repo}` || (data.labels || []).some(l => ["jules", "codex"].includes(l.name))) throw new Error("stale_or_ineligible_head");
    };
    await current();
    let cursor;
    const threads = [];
    for (let page = 0; page < 5; page++) {
      const result = await github.graphql(THREADS, { ...context.repo, number: pull.number, cursor });
      const pr = result.repository.pullRequest;
      if (pr.headRefOid !== expected) throw new Error("stale_head");
      threads.push(...pr.reviewThreads.nodes);
      if (!pr.reviewThreads.pageInfo.hasNextPage) break;
      cursor = pr.reviewThreads.pageInfo.endCursor;
    }
    const seen = new Set();
    for (const decision of decisions.slice(0, 5)) {
      const id = decision?.comment_id;
      if (!Number.isSafeInteger(id) || seen.has(id)) { report.skipped++; continue; }
      seen.add(id);
      const thread = threads.find(t => t.comments.nodes[0]?.databaseId === id);
      const root = thread?.comments.nodes[0];
      const evidence = decision.evidence;
      // Resolve only fully observed threads rooted in this exact App's bot ID.
      // Human/other-bot participation is never authority to change ownership.
      if (!thread || thread.isResolved || thread.comments.pageInfo.hasNextPage || root.author?.databaseId !== bot.id || root.author.login !== graphqlLogin || !evidence || evidence.head_sha !== expected || !["follow_up", "resolve"].includes(decision.action)) { report.skipped++; continue; }
      const removed = String(evidence.removed_code || "");
      const replacement = String(evidence.replacement_code || "");
      // Narrow, mechanically checked evidence: an exact old added line from the
      // finding's hunk has disappeared; a concrete replacement exists at HEAD.
      // AI must also explain why the finding is fixed. Ambiguous cases stay open.
      if (removed.trim().length < 8 || replacement.trim().length < 8 || removed === replacement || removed.length > 2000 || replacement.length > 2000 || citedAddedLine(root) !== removed || typeof evidence.reason !== "string" || evidence.reason.trim().length < 20 || !root.path || root.path.includes("..")) { report.skipped++; continue; }
      // A generic source.includes match could certify unrelated code. Require
      // an actual one-removed/one-added block at the cited original line in an
      // ancestor-to-HEAD comparison, then verify that exact new line at HEAD.
      const original = root.originalCommit?.oid;
      if (!original) { report.skipped++; continue; }
      const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({ ...context.repo, basehead: `${original}...${expected}` });
      if (comparison.merge_base_commit?.sha !== original || !Array.isArray(comparison.files) || comparison.files.length >= 300) { report.skipped++; continue; }
      const change = comparison.files.find(f => f.filename === root.path && f.status === "modified" && !f.previous_filename);
      const at = replacementLine(change?.patch, root.originalLine, removed, replacement);
      if (!at) { report.skipped++; continue; }
      const { data: file } = await github.rest.repos.getContent({ ...context.repo, path: root.path, ref: expected });
      if (Array.isArray(file) || file.encoding !== "base64" || file.size > 200000 || !file.content) { report.skipped++; continue; }
      const source = Buffer.from(file.content, "base64").toString("utf8");
      if (source.includes(removed) || source.split(/\r?\n/)[at - 1] !== replacement) { report.skipped++; continue; }
      const fingerprint = crypto.createHash("sha256").update(JSON.stringify([id, removed, replacement])).digest("hex");
      const marker = `<!-- ai-follow-up:${bot.id}:${fingerprint} -->`;
      if (thread.comments.nodes.some(c => c.author?.databaseId === bot.id && c.author.login === graphqlLogin && c.body?.includes(marker))) { report.skipped++; continue; }
      await current();
      if (decision.action === "resolve") {
        // A clean current review plus outdated source is required. REQUEST_CHANGES,
        // new findings and uncertain/security evidence can never trigger closure.
        if (parsed.event !== "APPROVE" || !thread.isOutdated || !thread.viewerCanResolve || (parsed.findings || []).length || (parsed.comments || []).length) { report.skipped++; continue; }
        const { data: checks } = await github.rest.checks.listForRef({ ...context.repo, ref: expected, per_page: 100 });
        const ownChecks = {
          "Obi-Wan Code-nobi": ["Obi-Wan Code-nobi code review", "AI Code Review / Obi-Wan Code-nobi code review"],
          "Lint Eastwood": ["Lint Eastwood build sheriff review", "AI Build Sheriff Review / Lint Eastwood build sheriff review"],
          RoboCop: ["RoboCop security review", "AI Security Review / RoboCop security review"],
        }[personaName] || [];
        // These aggregate jobs depend on this very review; their completion is
        // still a native merge prerequisite, not a prerequisite for own feedback.
        const selfDependent = ["Required CI", "Auto Merge"];
        const nonReview = checks.check_runs.filter(c => ![...ownChecks, ...selfDependent].includes(c.name));
        if (!nonReview.length || checks.total_count > 100 || nonReview.some(c => c.status !== "completed" || !["success", "neutral", "skipped"].includes(c.conclusion))) { report.skipped++; continue; }
        const { data: legacy } = await github.rest.repos.getCombinedStatusForRef({ ...context.repo, ref: expected, per_page: 100 });
        if (!Number.isSafeInteger(legacy.total_count) || !Array.isArray(legacy.statuses) || legacy.total_count !== legacy.statuses.length || (legacy.total_count > 0 && (legacy.state !== "success" || legacy.statuses.some(s => s.state !== "success")))) { report.skipped++; continue; }
        await current();
        const result = await github.graphql(`mutation($id:ID!) { resolveReviewThread(input:{threadId:$id}) { thread { id isResolved } } }`, { id: thread.id });
        if (result.resolveReviewThread?.thread?.id !== thread.id || result.resolveReviewThread.thread.isResolved !== true) throw new Error("resolution_unconfirmed");
        // Post-read verification prevents claiming a mutation with uncertain outcome.
        const verified = await github.graphql(`query($id:ID!) { node(id:$id) { ... on PullRequestReviewThread { isResolved } } }`, { id: thread.id });
        if (verified.node?.isResolved !== true) throw new Error("resolution_unconfirmed");
        await current();
        report.resolved++;
      }
      // No raw source, human content or model-generated commands in follow-ups.
      await current();
      await github.rest.pulls.createReplyForReviewComment({ ...args, comment_id: id, body: `${marker}\nCurrent revision \`${expected}\` replaces the cited source line. ${decision.action === "resolve" ? "The outdated finding was revalidated by this persona's clean review and its own thread resolution was verified." : "The source evidence changed; the finding remains open for review."}` });
      report.followed_up++;
    }
  } catch (error) {
    report.unavailable = true;
    report.http_status = Number.isInteger(error.status) ? error.status : null;
    core.warning("Reviewer follow-up incomplete or unavailable; no unverified resolution is claimed. Existing review and security gates remain authoritative.");
  }
  core.info(`Reviewer reconciliation: ${JSON.stringify(report)}`);
  return report;
}
// Same-process callers serialize too. Across Actions runs the existing persona/
// PR concurrency group uses cancel-in-progress:false; never use this helper in
// an uncoordinated writer workflow. Pending events may be coalesced by GitHub.
const pending = new Map();
async function reconcile(args) {
  const key = JSON.stringify([args.context.repo, args.context.payload.pull_request.number, args.appSlug]);
  const previous = pending.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => reconcileOnce(args));
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}
module.exports = { reconcile, THREADS, citedAddedLine, replacementLine };
