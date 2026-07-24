"use strict";

const crypto = require("node:crypto");

const MANAGED_MARKER_PATTERN =
  /<!--\s*notoli-security-alert:([a-z0-9-]+):([a-f0-9]{20})\s*-->/;
const SOURCE_REF_PATTERN = /^\s*-\s+\[([a-z][a-z0-9-]*:\d+)\]\([^)]+\)/gm;
const LIFECYCLE_MARKER = "<!-- notoli-security-alert-lifecycle -->";

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

function markerFor(feed, refs) {
  const signature = crypto
    .createHash("sha256")
    .update(`${feed}:${alertRefKey(refs)}`)
    .digest("hex")
    .slice(0, 20);
  return `<!-- notoli-security-alert:${feed}:${signature} -->`;
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
  const groupByKey = new Map(
    remainingGroups.map((group) => [group.key, group]),
  );
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
      group: groupByKey.get(group.key) ?? group,
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

async function loadProjectState(github, projectId) {
  const fieldQuery =
    "query($id: ID!) { node(id: $id) { ... on ProjectV2 { fields(first: 100) { nodes { __typename ... on ProjectV2Field { id name dataType } ... on ProjectV2SingleSelectField { id name dataType options { id name } } } } } } }";
  const fieldData = await github.graphql(fieldQuery, { id: projectId });
  const fieldNodes = fieldData.node?.fields?.nodes;
  if (!Array.isArray(fieldNodes)) {
    throw new Error(
      "SECURITY_ALERTS_PROJECT_ID is not a GitHub Project v2 node ID.",
    );
  }

  const itemsByContentId = new Map();
  let after = null;
  do {
    const itemData = await github.graphql(
      "query($project: ID!, $after: String) { node(id: $project) { ... on ProjectV2 { items(first: 100, after: $after) { nodes { id content { ... on Issue { id } } } pageInfo { hasNextPage endCursor } } } } }",
      { project: projectId, after },
    );
    const connection = itemData.node?.items;
    if (!connection || !Array.isArray(connection.nodes)) {
      throw new Error(
        "Could not read items from the configured GitHub Project.",
      );
    }
    for (const item of connection.nodes) {
      if (item.content?.id) itemsByContentId.set(item.content.id, item.id);
    }
    after = connection.pageInfo?.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (after);

  return {
    fields: new Map(fieldNodes.map((field) => [field.name, field])),
    itemsByContentId,
  };
}

async function findProjectItemId(github, projectId, contentId) {
  let after = null;
  do {
    const data = await github.graphql(
      "query($project: ID!, $after: String) { node(id: $project) { ... on ProjectV2 { items(first: 100, after: $after) { nodes { id content { ... on Issue { id } } } pageInfo { hasNextPage endCursor } } } } }",
      { project: projectId, after },
    );
    const connection = data.node?.items;
    const item = connection?.nodes?.find(
      (candidate) => candidate.content?.id === contentId,
    );
    if (item) return item.id;
    after = connection?.pageInfo?.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (after);
  return null;
}

async function ensureProjectItem(github, projectId, projectState, issue) {
  const existingItemId = projectState.itemsByContentId.get(issue.node_id);
  if (existingItemId) return { itemId: existingItemId, added: false };

  try {
    const data = await github.graphql(
      "mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }",
      { project: projectId, content: issue.node_id },
    );
    const itemId = data.addProjectV2ItemById.item.id;
    projectState.itemsByContentId.set(issue.node_id, itemId);
    return { itemId, added: true };
  } catch (error) {
    const itemId = await findProjectItemId(github, projectId, issue.node_id);
    if (!itemId) throw error;
    projectState.itemsByContentId.set(issue.node_id, itemId);
    return { itemId, added: false };
  }
}

function projectFieldValue(field, value) {
  if (typeof value === "number") return { number: value };
  if (field.dataType === "DATE") return { date: value };
  const option = field.options?.find((candidate) => candidate.name === value);
  if (!option) {
    throw new Error(`Project field ${field.name} is missing option ${value}.`);
  }
  return { singleSelectOptionId: option.id };
}

async function setProjectValues(
  github,
  projectId,
  projectState,
  itemId,
  values,
) {
  for (const [name, value] of Object.entries(values)) {
    const field = projectState.fields.get(name);
    if (!field) {
      throw new Error(`Project field ${name} is required but was not found.`);
    }
    await github.graphql(
      "mutation($project: ID!, $item: ID!, $field: ID!, $value: ProjectV2FieldValue!) { updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: $value }) { projectV2Item { id } } }",
      {
        project: projectId,
        item: itemId,
        field: field.id,
        value: projectFieldValue(field, value),
      },
    );
  }
}

async function synchronizeSecurityAlerts({
  github,
  core,
  context,
  projectId,
  source,
  groups,
  currentDate = new Date().toISOString().slice(0, 10),
}) {
  const { owner, repo } = context.repo;
  const config = {
    codeql: { label: "codeql", priority: "P1" },
    vulnerability: { label: "vulnerability", priority: "P2" },
    malware: { label: "malware", priority: "P1" },
  }[source.feed];
  if (!config) throw new Error(`Unsupported alert feed: ${source.feed}`);

  const openIssues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  const plan = planReconciliation({
    feed: source.feed,
    groups,
    issues: openIssues,
  });
  if (plan.assignments.length === 0 && plan.staleIssues.length === 0) {
    core.info(`No open ${source.feed} alerts or managed issues to reconcile.`);
    return { created: 0, updated: 0, closed: 0 };
  }

  const projectState = await loadProjectState(github, projectId);
  const alertByRef = new Map(source.alerts.map((alert) => [alert.ref, alert]));
  const canonicalByRef = new Map();
  let created = 0;
  let updated = 0;

  for (const assignment of plan.assignments) {
    const { group, existingIssue } = assignment;
    const body = buildIssueBody(source.feed, group, alertByRef);
    let issue;
    if (existingIssue) {
      ({ data: issue } = await github.rest.issues.update({
        owner,
        repo,
        issue_number: existingIssue.number,
        title: group.title,
        body,
      }));
      updated += 1;
    } else {
      ({ data: issue } = await github.rest.issues.create({
        owner,
        repo,
        title: group.title,
        body,
        labels: [config.label],
        assignees: [owner],
      }));
      created += 1;
    }

    await github.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issue.number,
      labels: [config.label],
    });
    await github.rest.issues.addAssignees({
      owner,
      repo,
      issue_number: issue.number,
      assignees: [owner],
    });
    const projectItem = await ensureProjectItem(
      github,
      projectId,
      projectState,
      issue,
    );
    if (!existingIssue || projectItem.added) {
      await setProjectValues(
        github,
        projectId,
        projectState,
        projectItem.itemId,
        {
          Status: "Backlog",
          Domain: "CI/CD",
          Type: "Security",
          Priority: config.priority,
          Size: "M",
          Estimate: 3,
        },
      );
    }
    for (const ref of group.alert_refs) canonicalByRef.set(ref, issue);
    core.info(
      `${existingIssue ? "Updated" : "Created"} issue #${issue.number} for ${group.alert_refs.length} alert(s).`,
    );
  }

  let closed = 0;
  for (const staleIssue of plan.staleIssues) {
    const replacementNumbers = [
      ...new Set(
        staleIssue.alert_refs
          .map((ref) => canonicalByRef.get(ref)?.number)
          .filter(Boolean),
      ),
    ].sort((left, right) => left - right);
    const lifecycleNote =
      replacementNumbers.length > 0
        ? `_Closed automatically because current alert coverage moved to ${replacementNumbers
            .map((number) => `#${number}`)
            .join(
              ", ",
            )}. The source-alert links above are retained for history._`
        : "_Closed automatically because none of its source alerts remain open and eligible for this feed. The source-alert links above are retained for history._";

    const projectItemId = projectState.itemsByContentId.get(staleIssue.node_id);
    if (projectItemId) {
      const completedValues = { Status: "Done" };
      if (projectState.fields.has("End date")) {
        completedValues["End date"] = currentDate;
      }
      await setProjectValues(
        github,
        projectId,
        projectState,
        projectItemId,
        completedValues,
      );
    }
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: staleIssue.number,
      body: withLifecycleNote(staleIssue.body, lifecycleNote),
      state: "closed",
      state_reason: "completed",
    });
    closed += 1;
    core.info(
      `Closed superseded or empty managed issue #${staleIssue.number}.`,
    );
  }

  return { created, updated, closed };
}

module.exports = {
  alertRefKey,
  alertRefsFromBody,
  managedFeedFromBody,
  markerFor,
  normalizeAlertRefs,
  planReconciliation,
  synchronizeSecurityAlerts,
  withLifecycleNote,
};
