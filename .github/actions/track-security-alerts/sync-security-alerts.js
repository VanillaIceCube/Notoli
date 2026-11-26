"use strict";

const crypto = require("node:crypto");
const { commentMarkerPrefix } = require("../../package.json");

const MANAGED_MARKER_PATTERN =
  new RegExp(`<!--\\s*${commentMarkerPrefix}-security-alert:([a-z0-9-]+):([a-f0-9]{20})\\s*-->`);
const SOURCE_REF_PATTERN = /^\s*-\s+\[([a-z][a-z0-9-]*:\d+)\]\([^)]+\)/gm;
const LIFECYCLE_MARKER = `<!-- ${commentMarkerPrefix}-security-alert-lifecycle -->`;

function normalizeAlertRefs(refs) {
  return [
    ...new Set(
      (Array.isArray(refs) ? refs : [])
        .filter((ref) => typeof ref === "string" && ref.trim())
        .map((ref) => ref.trim()),
    ),
  ].sort();
}

function alertRefKey(refs) {
  return normalizeAlertRefs(refs).join("|");
}

function domainForPath(path) {
  const normalized = path.replaceAll("\\", "/").replace(/^(?:\.\/|\/)+/, "").toLowerCase();
  const root = normalized.split("/")[0];
  if (root === "frontend") return "Frontend";
  if (root === "backend") return "Backend";

  const cloudDirectories = [".github", "deploy", "gateway", "infra", "infrastructure", "terraform", "k8s"];
  const cloudFile = /^(?:dockerfile(?:\..*)?|docker-compose.*|compose\..*|nginx\.conf)$/;
  if (cloudDirectories.includes(root) || cloudFile.test(root)) return "Cloud";
  return null;
}

function domainForDependency(ecosystem, path, infrastructure) {
  if (["actions", "github-actions", "docker"].includes(ecosystem)) return "Cloud";
  // Infrastructure uses Node and Python for tooling, so neither identifies an app component.
  if (infrastructure) return null;

  if (ecosystem === "npm" || /^package(?:-lock)?\.json$/i.test(path)) return "Frontend";
  if (ecosystem === "pip" || ecosystem === "uv") return "Backend";
  return null;
}

function alertDomain(alerts, repo) {
  const infrastructure = repo === "JudeAndrewAlabaInfrastructure";
  // A stable sort keeps the repository's preferred domain first when all scores tie.
  const domains = infrastructure ? ["Cloud", "Backend", "Frontend"] : ["Backend", "Frontend", "Cloud"];
  const scores = Object.fromEntries(domains.map(domain => [domain, { paths: 0, severity: 0, hints: 0 }]));
  // CodeQL supplies a rule level when a security severity is unavailable.
  const severityRank = {
    low: 1, medium: 2, high: 3, critical: 4,
    note: 1, warning: 2, error: 3,
  };

  for (const alert of alerts) {
    const path = alert.location || alert.manifest || "";
    const pathDomain = domainForPath(path);
    const domain = pathDomain ?? domainForDependency(alert.ecosystem, path, infrastructure);
    if (!domain) continue;

    const score = scores[domain];
    if (pathDomain) score.paths++;
    else score.hints++;
    score.severity = Math.max(score.severity, severityRank[alert.severity] ?? 0);
  }

  domains.sort((left, right) => {
    const a = scores[left];
    const b = scores[right];
    if (a.paths !== b.paths) return b.paths - a.paths;
    if (a.severity !== b.severity) return b.severity - a.severity;
    return b.hints - a.hints;
  });
  return domains[0];
}

function alertPriority(feed, alerts) {
  const severities = new Set(alerts.map(alert => alert.severity));
  if (severities.has("critical")) return "P0";
  if (severities.has("high") || severities.has("unknown")) return "P1";
  return feed === "vulnerability" ? "P2" : "P1";
}

function markerFor(feed, refs) {
  const signature = crypto
    .createHash("sha256")
    .update(`${feed}:${alertRefKey(refs)}`)
    .digest("hex")
    .slice(0, 20);
  return `<!-- ${commentMarkerPrefix}-security-alert:${feed}:${signature} -->`;
}

function managedFeedFromBody(body) {
  if (typeof body !== "string") return null;
  return body.match(MANAGED_MARKER_PATTERN)?.[1] ?? null;
}

function alertRefsFromBody(body) {
  if (typeof body !== "string") return [];
  const refs = [];
  for (const match of body.matchAll(SOURCE_REF_PATTERN)) refs.push(match[1]);
  return normalizeAlertRefs(refs);
}

function overlapCount(leftRefs, rightRefs) {
  const right = new Set(rightRefs);
  return leftRefs.reduce((count, ref) => count + Number(right.has(ref)), 0);
}

function normalizeManagedIssues(issues, feed) {
  return (Array.isArray(issues) ? issues : [])
    .filter(
      (issue) =>
        !issue.pull_request &&
        managedFeedFromBody(issue.body) === feed &&
        Number.isInteger(issue.number),
    )
    .map((issue) => ({
      ...issue,
      alert_refs: alertRefsFromBody(issue.body),
    }))
    .sort((left, right) => left.number - right.number);
}

function normalizeGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => {
      const alertRefs = normalizeAlertRefs(group.alert_refs);
      return {
        ...group,
        alert_refs: alertRefs,
        key: alertRefKey(alertRefs),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

// Recover model omissions only before reconciliation; reject unknown/duplicate refs.
function validateGroups(source, groups, { recoverOmissions = false } = {}) {
  if (!Array.isArray(source?.alerts) || !Array.isArray(groups)) throw new Error("Invalid alert/group inventory; no issues changed.");
  const known = new Set();
  for (const alert of source.alerts) {
    if (!/^(dependabot|code-scanning):\d+$/.test(alert?.ref) || known.has(alert.ref)) throw new Error("Invalid or duplicate source alert ref; no issues changed.");
    known.add(alert.ref);
  }
  const seen = new Set();
  const result = groups.map((group) => {
    const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
    if (!text(group?.title, 120) || !text(group?.summary, 2000) || !text(group?.recommendation, 1000) || !Array.isArray(group.alert_refs) || !group.alert_refs.length) throw new Error("Invalid group schema; no issues changed.");
    for (const ref of group.alert_refs) {
      if (!known.has(ref) || seen.has(ref)) throw new Error(`Unknown or duplicate grouped alert ${ref}; no issues changed.`);
      seen.add(ref);
    }
    return { ...group, alert_refs: [...group.alert_refs].sort() };
  });
  const missing = [...known].filter(ref => !seen.has(ref)).sort();
  if (missing.length && !recoverOmissions) throw new Error(`Uncovered source alerts: ${missing.join(", ")}; no issues changed.`);
  for (const ref of missing) result.push({
    title: `Investigate security alert ${ref}`,
    summary: `The grouping draft omitted ${ref}. This deterministic recovery item retains its authoritative source link.`,
    recommendation: "Review the linked advisory or scanner finding and determine the repository-specific remediation. No fix or version has been inferred.",
    alert_refs: [ref],
  });
  return { groups: result, recoveredRefs: missing };
}

function planReconciliation({ feed, groups, issues }) {
  const normalizedGroups = normalizeGroups(groups);
  const managedIssues = normalizeManagedIssues(issues, feed);
  const assignments = new Map();
  const usedIssueNumbers = new Set();

  for (const group of normalizedGroups) {
    const exact = managedIssues.find(
      (issue) =>
        !usedIssueNumbers.has(issue.number) &&
        alertRefKey(issue.alert_refs) === group.key,
    );
    if (exact) {
      assignments.set(group.key, exact);
      usedIssueNumbers.add(exact.number);
    }
  }

  const remainingGroups = normalizedGroups.filter(
    (group) => !assignments.has(group.key),
  );
  const remainingIssues = managedIssues.filter(
    (issue) => !usedIssueNumbers.has(issue.number),
  );
  const issueToGroup = new Map();
  const adjacency = new Map(
    remainingGroups.map((group) => [
      group.key,
      remainingIssues
        .map((issue) => ({
          issue,
          overlap: overlapCount(group.alert_refs, issue.alert_refs),
        }))
        .filter((candidate) => candidate.overlap > 0)
        .sort(
          (left, right) =>
            right.overlap - left.overlap ||
            right.overlap / right.issue.alert_refs.length -
              left.overlap / left.issue.alert_refs.length ||
            left.issue.number - right.issue.number,
        )
        .map((candidate) => candidate.issue),
    ]),
  );

  function assignGroup(groupKey, seenIssues) {
    for (const issue of adjacency.get(groupKey) ?? []) {
      if (seenIssues.has(issue.number)) continue;
      seenIssues.add(issue.number);
      const previousGroupKey = issueToGroup.get(issue.number);
      if (!previousGroupKey || assignGroup(previousGroupKey, seenIssues)) {
        issueToGroup.set(issue.number, groupKey);
        assignments.set(groupKey, issue);
        return true;
      }
    }
    return false;
  }

  for (const group of remainingGroups) assignGroup(group.key, new Set());

  const matchedIssueNumbers = new Set(
    [...assignments.values()].map((issue) => issue.number),
  );
  return {
    assignments: normalizedGroups.map((group) => ({
      group,
      existingIssue: assignments.get(group.key) ?? null,
    })),
    staleIssues: managedIssues.filter(
      (issue) => !matchedIssueNumbers.has(issue.number),
    ),
  };
}

function buildIssueBody(feed, group, alertByRef) {
  const sources = group.alert_refs
    .map((ref) => {
      const alert = alertByRef.get(ref);
      if (!alert) throw new Error(`Missing source alert details for ${ref}.`);
      const detail = alert.package
        ? `${alert.package} (${alert.severity})`
        : `${alert.rule} (${alert.severity})`;
      return `- [${ref}](${alert.url}) — ${detail}`;
    })
    .join("\n");
  return [
    markerFor(feed, group.alert_refs),
    "## Security alert group",
    "",
    group.summary,
    "",
    "## Recommended next step",
    "",
    group.recommendation,
    "",
    "## Source alerts",
    "",
    sources,
    "",
    "_This issue is managed by the daily security-alert aggregation workflow._",
  ].join("\n");
}

function withLifecycleNote(body, note) {
  const lifecycleSection = new RegExp(
    `\\n\\n---\\n\\n${LIFECYCLE_MARKER}[\\s\\S]*$`,
  );
  const base = String(body ?? "")
    .replace(lifecycleSection, "")
    .trimEnd();
  return `${base}\n\n---\n\n${LIFECYCLE_MARKER}\n${note}`;
}

const issueApiHeaders = { "X-GitHub-Api-Version": "2026-03-10" };
const alertIssueType = "Bug";
const issueFieldRoute = "/repos/{owner}/{repo}/issues/{issue_number}/issue-field-values";

async function loadIssuePlanning(github, { owner, repo }) {
  const { repository } = await github.graphql(
    `query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issueTypes(first: 25) { nodes { name } }
        issueFields(first: 25) { nodes {
          ... on IssueFieldCommon { name dataType fullDatabaseId }
          ... on IssueFieldSingleSelect { options { name } }
        } }
      }
    }`,
    { owner, repo },
  );
  if (!repository?.issueTypes?.nodes?.some(type => type?.name === alertIssueType)) {
    throw new Error(`Native ${alertIssueType} issue type unavailable.`);
  }
  const requirements = {
    Domain: ["Frontend", "Backend", "Cloud"],
    Priority: ["P0", "P1", "P2"],
    Size: ["M"],
  };
  const fields = {};
  for (const [name, required] of Object.entries(requirements)) {
    const field = repository.issueFields?.nodes?.find(node => node?.name === name);
    const id = Number(field?.fullDatabaseId);
    if (!Number.isSafeInteger(id) || id <= 0 ||
        field.dataType !== "SINGLE_SELECT" ||
        !required.every(option => field.options?.some(value => value.name === option))) {
      throw new Error(`Native issue field or required options unavailable: ${name}`);
    }
    fields[name] = id;
  }
  return fields;
}

async function issueFieldsToUpdate(github, issue, fields, defaults, urgent) {
  const { data } = await github.request(`GET ${issueFieldRoute}`, { ...issue, headers: issueApiHeaders });
  const current = new Map(data.map(field => [field.issue_field_id, field.single_select_option?.name ?? field.value]));
  const values = Object.fromEntries(Object.entries(defaults).filter(([name]) => !current.has(fields[name])));
  const priority = current.get(fields.Priority);
  // Keep higher and unrecognized manual priorities.
  if (urgent && /^P[0-3]$/.test(priority) && priority > defaults.Priority) {
    values.Priority = defaults.Priority;
  }
  return values;
}

async function addIssueFields(github, issue, fields, values) {
  const issueFieldValues = Object.entries(values).map(([name, value]) => ({ field_id: fields[name], value }));
  if (issueFieldValues.length) {
    await github.request(`POST ${issueFieldRoute}`, {
      ...issue,
      headers: issueApiHeaders,
      issue_field_values: issueFieldValues,
    });
  }
}

// Only a state-only PATCH with GitHub's observed concurrent-close 422 is eligible
// for race recovery. Readback must prove both the intended state and saved note.
async function closeManagedIssue(issueGithub, parameters, expectedBody) {
  const { data: current } = await issueGithub.rest.issues.get(parameters);
  const completed = (issue) =>
    issue?.state === "closed" && issue.state_reason === "completed" &&
    issue.body === expectedBody;
  if (completed(current)) return;
  try {
    await issueGithub.rest.issues.update({
      ...parameters, state: "closed", state_reason: "completed",
    });
  } catch (error) {
    const data = error?.response?.data;
    if (error?.status !== 422 || data?.message !== "Validation Failed" ||
        !Array.isArray(data.errors) || !(data.errors.length === 0 ||
          (data.errors.length === 1 && data.errors[0]?.resource === "Issue" &&
           data.errors[0]?.code === "custom" && data.errors[0]?.message ===
             "This issue was closed by another request. Reload it and try again."))) throw error;
    let final;
    try {
      ({ data: final } = await issueGithub.rest.issues.get(parameters));
    } catch {
      throw error;
    }
    if (!completed(final)) throw error;
  }
}

async function relateIssues(github, issueId, relatedIssueId) {
  if (issueId === relatedIssueId) return;
  // Adding an existing peer link is idempotent, including from the other endpoint.
  await github.graphql(
    `mutation($issueId: ID!, $relatedIssueId: ID!) {
      addRelatesTo(input: {issueId: $issueId, relatedIssueId: $relatedIssueId}) { issue { id } }
    }`, { issueId, relatedIssueId },
  );
}

async function syncIssueRelationships(github, issue, parentId, otherFeedIssues, alerts) {
  if (parentId) {
    const { node } = await github.graphql(
      `query($id: ID!) { node(id: $id) { ... on Issue { parent { id } } } }`, { id: issue.node_id },
    );
    if (!node.parent) {
      await github.graphql(
        `mutation($parent: ID!, $child: ID!) {
          addSubIssue(input: {issueId: $parent, subIssueId: $child}) { subIssue { id } }
        }`, { parent: parentId, child: issue.node_id },
      );
    }
  }

  const alertRefs = alerts.map(alert => alert.ref);
  const relatedIds = new Set();
  for (const other of otherFeedIssues) {
    if (overlapCount(alertRefsFromBody(other.body), alertRefs)) {
      relatedIds.add(other.node_id);
    }
  }
  // GitHub reports existing CodeQL tracking links independently of the issue body.
  for (const url of new Set(alerts.flatMap(alert => alert.trackingIssues ?? []))) {
    if (url === issue.html_url) continue;
    const { resource } = await github.graphql(
      `query($url: URI!) { resource(url: $url) { ... on Issue { id } } }`, { url },
    );
    if (!resource?.id) throw new Error(`Cannot read the issue tracking this CodeQL alert: ${url}`);
    relatedIds.add(resource.id);
  }
  for (const id of relatedIds) await relateIssues(github, issue.node_id, id);
}

async function synchronizeSecurityAlerts({
  issueGithub,
  fields,
  core,
  context,
  source,
  groups,
  parentNumber,
}) {
  const { owner, repo } = context.repo;
  if (!["codeql", "vulnerability", "malware"].includes(source.feed)) throw new Error(`Unsupported alert feed: ${source.feed}`);
  validateGroups(source, groups);

  const openIssues = await issueGithub.paginate(
    issueGithub.rest.issues.listForRepo,
    {
      owner,
      repo,
      state: "open",
      per_page: 100,
      headers: issueApiHeaders,
    },
  );
  const plan = planReconciliation({
    feed: source.feed,
    groups,
    issues: openIssues,
  });
  if (plan.assignments.length === 0 && plan.staleIssues.length === 0) {
    core.info(`No open ${source.feed} alerts or managed issues to reconcile.`);
    return { created: 0, updated: 0, closed: 0 };
  }

  let parentId;
  if (parentNumber && plan.assignments.length) {
    if (!/^[1-9]\d*$/.test(parentNumber)) throw new Error("Expected a positive RoboCop parent issue number.");
    const { data: parent } = await issueGithub.rest.issues.get({ owner, repo, issue_number: Number(parentNumber) });
    if (parent.pull_request || managedFeedFromBody(parent.body)) {
      throw new Error("The configured RoboCop parent must be a separate tracking issue.");
    }
    parentId = parent.node_id;
  }

  const alertByRef = new Map(source.alerts.map((alert) => [alert.ref, alert]));
  const otherFeedIssues = openIssues.filter(issue => {
    const feed = managedFeedFromBody(issue.body);
    return !issue.pull_request && feed && feed !== source.feed;
  });
  const canonicalByRef = new Map();
  let created = 0;
  let updated = 0;

  for (const assignment of plan.assignments) {
    const { group, existingIssue } = assignment;
    const body = buildIssueBody(source.feed, group, alertByRef);
    let issue;
    if (existingIssue) {
      ({ data: issue } = await issueGithub.rest.issues.update({
        owner,
        repo,
        issue_number: existingIssue.number,
        title: group.title,
        body,
        headers: issueApiHeaders,
        ...(existingIssue.type ? {} : { type: alertIssueType }),
      }));
      updated += 1;
    } else {
      ({ data: issue } = await issueGithub.rest.issues.create({
        owner,
        repo,
        title: group.title,
        body,
        assignees: [owner],
        headers: issueApiHeaders,
        type: alertIssueType,
      }));
      created += 1;
    }

    const issueParameters = { owner, repo, issue_number: issue.number };
    if (!issue.assignees?.some(user => (user.login ?? user) === owner)) {
      await issueGithub.rest.issues.addAssignees({ ...issueParameters, assignees: [owner] });
    }
    const alerts = group.alert_refs.map(ref => alertByRef.get(ref));
    const defaults = {
      Domain: alertDomain(alerts, repo),
      Priority: alertPriority(source.feed, alerts),
      Size: "M",
    };
    const urgent = alerts.some(alert => ["critical", "high", "unknown"].includes(alert.severity));
    const values = await issueFieldsToUpdate(issueGithub, issueParameters, fields, defaults, urgent);
    await addIssueFields(issueGithub, issueParameters, fields, values);
    await syncIssueRelationships(issueGithub, issue, parentId, otherFeedIssues, alerts);
    for (const ref of group.alert_refs) canonicalByRef.set(ref, issue);
    core.info(
      `${existingIssue ? "Updated" : "Created"} issue #${issue.number} for ${group.alert_refs.length} alert(s).`,
    );
  }

  let closed = 0;
  for (const staleIssue of plan.staleIssues) {
    const replacements = new Set(staleIssue.alert_refs.map(ref => canonicalByRef.get(ref)).filter(Boolean));
    for (const replacement of replacements) {
      await relateIssues(issueGithub, staleIssue.node_id, replacement.node_id);
    }
    const replacementNumbers = [...replacements].map(issue => issue.number).sort((a, b) => a - b);
    const lifecycleNote =
      replacementNumbers.length > 0
        ? `_Closed automatically because current alert coverage moved to ${replacementNumbers
            .map((number) => `#${number}`)
            .join(
              ", ",
            )}. The source-alert links above are retained for history._`
        : "_Closed automatically because none of its source alerts remain open and eligible for this feed. The source-alert links above are retained for history._";

    const parameters = { owner, repo, issue_number: staleIssue.number };
    const body = withLifecycleNote(staleIssue.body, lifecycleNote);
    // Save history while the issue is still discoverable on reruns.
    await issueGithub.rest.issues.update({ ...parameters, body });
    await closeManagedIssue(issueGithub, parameters, body);
    closed += 1;
    core.info(
      `Closed superseded or empty managed issue #${staleIssue.number}.`,
    );
  }

  return { created, updated, closed };
}

module.exports = {
  loadIssuePlanning,
  validateGroups,
  closeManagedIssue,
  alertDomain,
  alertPriority,
  alertRefKey,
  alertRefsFromBody,
  managedFeedFromBody,
  markerFor,
  normalizeAlertRefs,
  planReconciliation,
  synchronizeSecurityAlerts,
  withLifecycleNote,
};
