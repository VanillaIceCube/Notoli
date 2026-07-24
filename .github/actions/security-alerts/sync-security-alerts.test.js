"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  alertRefsFromBody,
  markerFor,
  planReconciliation,
  synchronizeSecurityAlerts,
  withLifecycleNote,
} = require("./sync-security-alerts");

const feed = "vulnerability";

function group(refs, title = refs.join(" + ")) {
  return {
    title,
    summary: `Summary for ${refs.join(", ")}`,
    recommendation: "Apply the vendor fix and verify the affected path.",
    alert_refs: refs,
  };
}

function issue(number, refs, issueFeed = feed) {
  const sourceLines = refs
    .map(
      (ref) =>
        `- [${ref}](https://github.com/example/repo/security/dependabot/${ref.split(":")[1]}) — package (medium)`,
    )
    .join("\n");
  return {
    number,
    node_id: `ISSUE_${number}`,
    body: [
      markerFor(issueFeed, refs),
      "## Source alerts",
      "",
      sourceLines,
      "",
      "_This issue is managed by the daily security-alert aggregation workflow._",
    ].join("\n"),
  };
}

function assignmentNumbers(plan) {
  return Object.fromEntries(
    plan.assignments.map(({ group: plannedGroup, existingIssue }) => [
      plannedGroup.alert_refs.join("|"),
      existingIssue?.number ?? null,
    ]),
  );
}

function assertUniqueCoverage(plan, groups) {
  const refs = plan.assignments.flatMap(
    ({ group: plannedGroup }) => plannedGroup.alert_refs,
  );
  assert.deepEqual(
    [...refs].sort(),
    groups.flatMap((plannedGroup) => plannedGroup.alert_refs).sort(),
  );
  assert.equal(new Set(refs).size, refs.length);
}

test("unchanged alert coverage reuses the exact managed issue when prose changes", () => {
  const groups = [group(["dependabot:1", "dependabot:2"], "Fresh AI wording")];
  const plan = planReconciliation({
    feed,
    groups,
    issues: [issue(10, ["dependabot:1", "dependabot:2"])],
  });

  assert.deepEqual(assignmentNumbers(plan), {
    "dependabot:1|dependabot:2": 10,
  });
  assert.deepEqual(plan.staleIssues, []);
  assertUniqueCoverage(plan, groups);
});

test("group and alert order changes do not change canonical issue matching", () => {
  const issues = [
    issue(10, ["dependabot:1", "dependabot:2"]),
    issue(11, ["dependabot:3"]),
  ];
  const first = planReconciliation({
    feed,
    groups: [group(["dependabot:3"]), group(["dependabot:2", "dependabot:1"])],
    issues,
  });
  const second = planReconciliation({
    feed,
    groups: [group(["dependabot:1", "dependabot:2"]), group(["dependabot:3"])],
    issues,
  });

  assert.deepEqual(assignmentNumbers(first), assignmentNumbers(second));
  assert.deepEqual(assignmentNumbers(first), {
    "dependabot:1|dependabot:2": 10,
    "dependabot:3": 11,
  });
  assertUniqueCoverage(
    first,
    first.assignments.map(({ group }) => group),
  );
});

test("splitting one group reuses one canonical issue without overlapping it", () => {
  const groups = [group(["dependabot:1"]), group(["dependabot:2"])];
  const plan = planReconciliation({
    feed,
    groups,
    issues: [issue(10, ["dependabot:1", "dependabot:2"])],
  });

  assert.deepEqual(assignmentNumbers(plan), {
    "dependabot:1": 10,
    "dependabot:2": null,
  });
  assert.deepEqual(plan.staleIssues, []);
  assertUniqueCoverage(plan, groups);
});

test("merging groups keeps the oldest overlapping issue and supersedes the rest", () => {
  const groups = [group(["dependabot:1", "dependabot:2"])];
  const plan = planReconciliation({
    feed,
    groups,
    issues: [issue(10, ["dependabot:1"]), issue(11, ["dependabot:2"])],
  });

  assert.deepEqual(assignmentNumbers(plan), {
    "dependabot:1|dependabot:2": 10,
  });
  assert.deepEqual(
    plan.staleIssues.map((staleIssue) => staleIssue.number),
    [11],
  );
  assertUniqueCoverage(plan, groups);
});

test("an added alert expands the overlapping canonical issue", () => {
  const groups = [group(["dependabot:1", "dependabot:2"])];
  const plan = planReconciliation({
    feed,
    groups,
    issues: [issue(10, ["dependabot:1"])],
  });

  assert.deepEqual(assignmentNumbers(plan), {
    "dependabot:1|dependabot:2": 10,
  });
  assert.deepEqual(plan.staleIssues, []);
  assertUniqueCoverage(plan, groups);
});

test("resolved alerts are removed from reused coverage and empty issues close", () => {
  const groups = [group(["dependabot:1"])];
  const plan = planReconciliation({
    feed,
    groups,
    issues: [
      issue(10, ["dependabot:1", "dependabot:2"]),
      issue(11, ["dependabot:3"]),
    ],
  });

  assert.deepEqual(assignmentNumbers(plan), { "dependabot:1": 10 });
  assert.deepEqual(
    plan.staleIssues.map((staleIssue) => staleIssue.number),
    [11],
  );
  assertUniqueCoverage(plan, groups);
});

test("a feed with no current alerts closes every open managed issue", () => {
  const plan = planReconciliation({
    feed,
    groups: [],
    issues: [
      issue(10, ["dependabot:1"]),
      issue(11, ["dependabot:2"]),
      issue(12, ["code-scanning:1"], "codeql"),
    ],
  });

  assert.deepEqual(plan.assignments, []);
  assert.deepEqual(
    plan.staleIssues.map((staleIssue) => staleIssue.number),
    [10, 11],
  );
});

test("the known overlapping vulnerability tickets resolve to five canonical issues", () => {
  const canonical = [
    issue(593, ["dependabot:81", "dependabot:82"]),
    issue(621, ["dependabot:2", "dependabot:60"]),
    issue(622, ["dependabot:44", "dependabot:45"]),
    issue(623, [
      "dependabot:3",
      "dependabot:4",
      "dependabot:64",
      "dependabot:78",
      "dependabot:85",
      "dependabot:86",
    ]),
    issue(624, [
      "dependabot:65",
      "dependabot:66",
      "dependabot:67",
      "dependabot:68",
      "dependabot:69",
      "dependabot:74",
      "dependabot:80",
      "dependabot:84",
    ]),
  ];
  const overlapping = [
    issue(602, [
      "dependabot:44",
      "dependabot:45",
      "dependabot:81",
      "dependabot:82",
    ]),
    issue(604, [
      "dependabot:3",
      "dependabot:4",
      "dependabot:64",
      "dependabot:78",
    ]),
    issue(605, ["dependabot:69", "dependabot:84"]),
    issue(607, ["dependabot:84"]),
    issue(614, ["dependabot:80"]),
    issue(615, ["dependabot:74"]),
    issue(616, ["dependabot:69"]),
    issue(617, ["dependabot:68"]),
    issue(618, ["dependabot:67"]),
    issue(619, ["dependabot:66"]),
    issue(620, ["dependabot:65"]),
  ];
  const groups = canonical.map((canonicalIssue) =>
    group(alertRefsFromBody(canonicalIssue.body)),
  );
  const plan = planReconciliation({
    feed,
    groups,
    issues: [...canonical, ...overlapping],
  });

  assert.deepEqual(
    Object.values(assignmentNumbers(plan)).sort((left, right) => left - right),
    [593, 621, 622, 623, 624],
  );
  assert.deepEqual(
    plan.staleIssues.map((staleIssue) => staleIssue.number),
    [602, 604, 605, 607, 614, 615, 616, 617, 618, 619, 620],
  );
  assertUniqueCoverage(plan, groups);
});

test("synchronization preserves canonical project fields and completes superseded items", async () => {
  const openIssues = [issue(10, ["dependabot:1"]), issue(11, ["dependabot:2"])];
  const issueUpdates = [];
  const projectUpdates = [];
  const github = {
    paginate: async () => openIssues,
    rest: {
      issues: {
        listForRepo() {},
        update: async (input) => {
          issueUpdates.push(input);
          const original = openIssues.find(
            (candidate) => candidate.number === input.issue_number,
          );
          return {
            data: {
              ...original,
              ...input,
              number: input.issue_number,
              node_id: original.node_id,
            },
          };
        },
        create: async () => {
          throw new Error("No issue should be created for this merge.");
        },
        addLabels: async () => {},
        addAssignees: async () => {},
      },
    },
    graphql: async (query, variables) => {
      if (query.includes("fields(first: 100)")) {
        return {
          node: {
            fields: {
              nodes: [
                {
                  id: "STATUS",
                  name: "Status",
                  dataType: "SINGLE_SELECT",
                  options: [
                    { id: "BACKLOG", name: "Backlog" },
                    { id: "DONE", name: "Done" },
                  ],
                },
                {
                  id: "END_DATE",
                  name: "End date",
                  dataType: "DATE",
                },
              ],
            },
          },
        };
      }
      if (query.includes("items(first: 100")) {
        return {
          node: {
            items: {
              nodes: [
                { id: "ITEM_10", content: { id: "ISSUE_10" } },
                { id: "ITEM_11", content: { id: "ISSUE_11" } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      }
      if (query.includes("updateProjectV2ItemFieldValue")) {
        projectUpdates.push(variables);
        return { updateProjectV2ItemFieldValue: { projectV2Item: {} } };
      }
      throw new Error(`Unexpected GraphQL operation: ${query}`);
    },
  };
  const messages = [];
  const result = await synchronizeSecurityAlerts({
    github,
    core: { info: (message) => messages.push(message) },
    context: { repo: { owner: "example", repo: "repo" } },
    projectId: "PROJECT",
    currentDate: "2026-07-24",
    source: {
      feed,
      alerts: [
        {
          ref: "dependabot:1",
          url: "https://example.test/1",
          package: "one",
          severity: "medium",
        },
        {
          ref: "dependabot:2",
          url: "https://example.test/2",
          package: "two",
          severity: "medium",
        },
      ],
    },
    groups: [group(["dependabot:1", "dependabot:2"])],
  });

  assert.deepEqual(result, { created: 0, updated: 1, closed: 1 });
  assert.equal(issueUpdates[0].issue_number, 10);
  assert.equal(issueUpdates[0].state, undefined);
  assert.equal(issueUpdates[1].issue_number, 11);
  assert.equal(issueUpdates[1].state, "closed");
  assert.equal(issueUpdates[1].state_reason, "completed");
  assert.match(issueUpdates[1].body, /coverage moved to #10/);
  assert.deepEqual(
    projectUpdates.map((update) => ({
      item: update.item,
      field: update.field,
      value: update.value,
    })),
    [
      {
        item: "ITEM_11",
        field: "STATUS",
        value: { singleSelectOptionId: "DONE" },
      },
      {
        item: "ITEM_11",
        field: "END_DATE",
        value: { date: "2026-07-24" },
      },
    ],
  );
  assert.equal(
    projectUpdates.some((update) => update.item === "ITEM_10"),
    false,
  );
  assert.equal(messages.length, 2);
});

test("source refs remain parseable and lifecycle notes are replaced idempotently", () => {
  const original = issue(10, ["dependabot:2", "dependabot:1"]).body;
  const first = withLifecycleNote(original, "_Closed once._");
  const second = withLifecycleNote(first, "_Closed with updated context._");

  assert.deepEqual(alertRefsFromBody(second), ["dependabot:1", "dependabot:2"]);
  assert.equal(second.match(/notoli-security-alert-lifecycle/g)?.length, 1);
  assert.match(second, /Closed with updated context/);
  assert.doesNotMatch(second, /Closed once/);
});
