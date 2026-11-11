"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
  const issueGithub = {
    paginate: async () => openIssues,
    rest: {
      issues: {
        listForRepo() {},
        get: async (input) => ({ data: openIssues.find((candidate) => candidate.number === input.issue_number) }),
        update: async (input) => {
          issueUpdates.push(input);
          const original = openIssues.find(
            (candidate) => candidate.number === input.issue_number,
          );
          Object.assign(original, input);
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
  };
  const projectGithub = {
    graphql: async (query, variables) => {
      if (query.includes('fieldValues(first: 100)')) return { node: { fieldValues: { nodes: ['Status', 'Domain', 'Work type', 'Priority', 'Size', 'Estimate'].map(name => ({ field: { name } })) } } };
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
    issueGithub,
    projectGithub,
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
  assert.equal(issueUpdates[1].state, undefined);
  assert.equal(issueUpdates[2].state, "closed");
  assert.equal(issueUpdates[2].state_reason, "completed");
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
        field: "END_DATE",
        value: { date: "2026-07-24" },
      },
      {
        item: "ITEM_11",
        field: "STATUS",
        value: { singleSelectOptionId: "DONE" },
      },
    ],
  );
  assert.equal(
    projectUpdates.some((update) => update.item === "ITEM_10"),
    false,
  );
  assert.equal(messages.length, 2);
});

test("synchronization sends issue creation, labels, and assignment only through RoboCop", async () => {
  const issueCalls = [];
  const projectCalls = [];
  let projectItemQueryCount = 0;
  const createdIssue = {
    number: 20,
    node_id: "ISSUE_20",
    body: "",
  };
  const issueGithub = {
    paginate: async () => [],
    rest: {
      issues: {
        listForRepo() {},
        create: async (input) => {
          issueCalls.push({ operation: "create", input });
          return { data: createdIssue };
        },
        update: async (input) => {
          issueCalls.push({ operation: "update", input });
          return { data: { ...createdIssue, ...input } };
        },
        addLabels: async (input) => {
          issueCalls.push({ operation: "addLabels", input });
        },
        addAssignees: async (input) => {
          issueCalls.push({ operation: "addAssignees", input });
        },
      },
    },
  };
  const projectGithub = {
    graphql: async (query, variables) => {
      if (query.includes('fieldValues(first: 100)')) return { node: { fieldValues: { nodes: ['Status', 'Domain', 'Work type', 'Priority', 'Size', 'Estimate'].map(name => ({ field: { name } })) } } };
      projectCalls.push({ query, variables });
      if (query.includes("fields(first: 100)")) {
        return {
          node: {
            fields: {
              nodes: [
                {
                  id: "STATUS",
                  name: "Status",
                  dataType: "SINGLE_SELECT",
                  options: [{ id: "BACKLOG", name: "Backlog" }],
                },
                {
                  id: "DOMAIN",
                  name: "Domain",
                  dataType: "SINGLE_SELECT",
                  options: [{ id: "CI_CD", name: "CI/CD" }],
                },
                {
                  id: "TYPE",
                  name: "Work type",
                  dataType: "SINGLE_SELECT",
                  options: [{ id: "SECURITY", name: "Security" }],
                },
                {
                  id: "PRIORITY",
                  name: "Priority",
                  dataType: "SINGLE_SELECT",
                  options: [{ id: "P2", name: "P2" }],
                },
                {
                  id: "SIZE",
                  name: "Size",
                  dataType: "SINGLE_SELECT",
                  options: [{ id: "M", name: "M" }],
                },
                {
                  id: "ESTIMATE",
                  name: "Estimate",
                  dataType: "NUMBER",
                },
              ],
            },
          },
        };
      }
      if (query.includes("items(first: 100")) {
        projectItemQueryCount += 1;
        return {
          node: {
            items: {
              nodes:
                projectItemQueryCount >= 3
                  ? [{ id: "ITEM_20", content: { id: "ISSUE_20" } }]
                  : [],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      }
      if (query.includes("addProjectV2ItemById")) {
        throw {
          errors: [
            {
              type: "UNPROCESSABLE",
              message: "Content already exists in this project",
            },
          ],
        };
      }
      if (query.includes("updateProjectV2ItemFieldValue")) {
        return { updateProjectV2ItemFieldValue: { projectV2Item: {} } };
      }
      throw new Error(`Unexpected GraphQL operation: ${query}`);
    },
  };

  const result = await synchronizeSecurityAlerts({
    issueGithub,
    projectGithub,
    core: { info: () => {} },
    context: { repo: { owner: "example", repo: "repo" } },
    projectId: "PROJECT",
    source: {
      feed,
      alerts: [
        {
          ref: "dependabot:1",
          url: "https://example.test/1",
          package: "one",
          severity: "medium",
        },
      ],
    },
    groups: [group(["dependabot:1"])],
  });

  assert.deepEqual(result, { created: 1, updated: 0, closed: 0 });
  assert.deepEqual(
    issueCalls.map(({ operation }) => operation),
    ["create", "addLabels", "addAssignees"],
  );
  assert.equal(
    projectCalls.some(({ query }) => query.includes("addProjectV2ItemById")),
    true,
  );
  assert.equal(
    projectCalls.filter(({ query }) =>
      query.includes("updateProjectV2ItemFieldValue"),
    ).length,
    6,
  );
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

test("alert workflows scope RoboCop to alert and issue APIs while reserving the personal token for Projects", () => {
  const repositoryRoot = path.resolve(__dirname, "../../..");
  const workflowNames = [
    "alert-codeql.yml",
    "alert-vulnerability.yml",
    "alert-malware.yml",
  ];

  for (const workflowName of workflowNames) {
    const workflow = fs.readFileSync(
      path.join(repositoryRoot, ".github", "workflows", workflowName),
      "utf8",
    );
    assert.match(
      workflow,
      /uses: actions\/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3/,
    );
    assert.match(workflow, /permission-issues: write/);
    assert.match(workflow, /permission-security-events: read/);
    assert.match(
      workflow,
      /robocop-token: \$\{\{ steps\.robocop-token\.outputs\.token \}\}/,
    );
    assert.match(
      workflow,
      /project-token: \$\{\{ secrets\.SECURITY_ALERTS_TOKEN \}\}/,
    );
    assert.doesNotMatch(
      workflow,
      /robocop-token: \$\{\{ secrets\.SECURITY_ALERTS_TOKEN \}\}/,
    );
    if (workflowName === "alert-codeql.yml") {
      assert.doesNotMatch(workflow, /permission-vulnerability-alerts: read/);
    } else {
      assert.match(workflow, /permission-vulnerability-alerts: read/);
    }
  }

  const action = fs.readFileSync(
    path.join(
      repositoryRoot,
      ".github",
      "actions",
      "security-alerts",
      "action.yml",
    ),
    "utf8",
  );
  assert.match(action, /github-token: \$\{\{ inputs\.robocop-token \}\}/);
  assert.match(
    action,
    /const projectGithub = getOctokit\(process\.env\.PROJECT_TOKEN\)/,
  );
  assert.match(action, /issueGithub: github/);
  assert.match(action, /projectGithub,/);
});

test("reconcile GitHub Script constructs the separate Project client at runtime", async () => {
  const repositoryRoot = path.resolve(__dirname, "../../..");
  const action = fs.readFileSync(
    path.join(
      repositoryRoot,
      ".github",
      "actions",
      "security-alerts",
      "action.yml",
    ),
    "utf8",
  );
  const match = action.match(
    /    - name: Reconcile grouped issues[\s\S]*?        script: \|\r?\n([\s\S]+)$/,
  );
  assert.ok(match, "reconcile GitHub Script should be present");
  const script = match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");

  const issueGithub = { kind: "issues" };
  const projectGithub = { kind: "project" };
  const core = { info() {} };
  const context = { repo: { owner: "example", repo: "repo" } };
  const calls = [];
  const mockRequire = (request) => {
    if (request === "fs") {
      return {
        readFileSync(file) {
          if (file === "alerts.json") {
            return JSON.stringify({ feed: "codeql", alerts: [] });
          }
          if (file === "groups.json") {
            return JSON.stringify({ groups: [] });
          }
          throw new Error(`Unexpected file: ${file}`);
        },
      };
    }
    if (
      request ===
      "C:/repo/.github/actions/security-alerts/sync-security-alerts.js"
    ) {
      return {
        async synchronizeSecurityAlerts(input) {
          calls.push(input);
        },
      };
    }
    throw new Error(`Unexpected module: ${request}`);
  };
  const processMock = {
    env: {
      ALERT_PATH: "alerts.json",
      GROUP_PATH: "groups.json",
      GITHUB_WORKSPACE: "C:/repo",
      PROJECT_ID: "project-id",
      PROJECT_TOKEN: "project-token",
    },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const getOctokit = (token) => {
    assert.equal(token, "project-token");
    return projectGithub;
  };

  await new AsyncFunction(
    "require",
    "github",
    "core",
    "context",
    "process",
    "getOctokit",
    script,
  )(mockRequire, issueGithub, core, context, processMock, getOctokit);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].issueGithub, issueGithub);
  assert.equal(calls[0].projectGithub, projectGithub);
  assert.equal(calls[0].projectId, "project-id");
});

const { closeManagedIssue } = require('./sync-security-alerts');

test('already completed closure requires a matching saved lifecycle body', async () => {
  let patches = 0;
  const client = { rest: { issues: {
    get: async () => ({ data: { state: 'closed', state_reason: 'completed', body: 'saved' } }),
    update: async () => { patches++; },
  } } };
  await closeManagedIssue(client, { issue_number: 1 }, 'saved');
  assert.equal(patches, 0);
});

test('only the observed empty-error 422 with verified completion is tolerated', async () => {
  const race = { status: 422, response: { data: { message: 'Validation Failed', errors: [] } } };
  for (const scenario of ['completed', 'open', 'wrong-reason', 'lost-note', 'read-failed', 'unrelated', 'forbidden', 'malformed']) {
    let reads = 0;
    const error = scenario === 'unrelated'
      ? { status: 422, response: { data: { message: 'Validation Failed', errors: [{ field: 'state', code: 'invalid' }] } } }
      : scenario === 'forbidden' ? { status: 403 }
      : scenario === 'malformed' ? { status: 422 } : race;
    const client = { rest: { issues: {
      get: async () => {
        reads++;
        if (reads === 1) return { data: { state: 'open', body: 'saved' } };
        if (scenario === 'read-failed') throw new Error('Unavailable');
        return { data: {
          state: scenario === 'open' ? 'open' : 'closed',
          state_reason: scenario === 'wrong-reason' ? 'not_planned' : 'completed',
          body: scenario === 'lost-note' ? 'original' : 'saved',
        } };
      },
      update: async (input) => {
        assert.equal(input.body, undefined, 'the race-sensitive PATCH changes only state');
        throw error;
      },
    } } };
    if (scenario === 'completed') await closeManagedIssue(client, { issue_number: 1 }, 'saved');
    else await assert.rejects(closeManagedIssue(client, { issue_number: 1 }, 'saved'), (actual) => actual === error, scenario);
    assert.equal(reads, ['unrelated', 'forbidden', 'malformed'].includes(scenario) ? 1 : 2);
  }
});

function lifecycleFixture({ autoClose = false, missingItem = false, failDate = false, failDone = false } = {}) {
  const saved = { ...issue(11, ['dependabot:2']), state: 'open' };
  const calls = [];
  let itemPresent = !missingItem;
  const issueGithub = {
    paginate: async () => saved.state === 'open' ? [saved] : [],
    rest: { issues: {
      listForRepo() {},
      get: async () => ({ data: { ...saved } }),
      update: async (input) => { calls.push(input.state ? 'close' : 'body'); Object.assign(saved, input); return { data: saved }; },
      create: async () => { throw new Error('duplicate creation'); },
    } },
  };
  const projectGithub = { graphql: async (query, variables) => {
      if (query.includes('fieldValues(first: 100)')) return { node: { fieldValues: { nodes: ['Status', 'Domain', 'Work type', 'Priority', 'Size', 'Estimate'].map(name => ({ field: { name } })) } } };
    if (query.includes('fields(first: 100)')) return { node: { fields: { nodes: [
      { id: 'STATUS', name: 'Status', dataType: 'SINGLE_SELECT', options: [{ id: 'DONE', name: 'Done' }] },
      { id: 'END_DATE', name: 'End date', dataType: 'DATE' },
    ] } } };
    if (query.includes('items(first: 100')) return { node: { items: { nodes: itemPresent ? [{ id: 'ITEM_11', content: { id: 'ISSUE_11' } }] : [], pageInfo: {} } } };
    if (query.includes('addProjectV2ItemById')) { calls.push('add'); itemPresent = true; return { addProjectV2ItemById: { item: { id: 'ITEM_11' } } }; }
    if (query.includes('updateProjectV2ItemFieldValue')) {
      calls.push(variables.field);
      if (variables.field === 'END_DATE' && failDate) { failDate = false; throw new Error('date unavailable'); }
      if (variables.field === 'STATUS') {
        if (failDone) { failDone = false; throw new Error('Done unavailable'); }
        if (autoClose) { saved.state = 'closed'; saved.state_reason = 'completed'; }
      }
      return {};
    }
    throw new Error('unexpected GraphQL');
  } };
  const run = () => synchronizeSecurityAlerts({
    issueGithub, projectGithub, core: { info() {} },
    context: { repo: { owner: 'example', repo: 'repo' } },
    projectId: 'PROJECT', currentDate: '2026-10-20', source: { feed, alerts: [] }, groups: [],
  });
  return { run, saved, calls };
}

test('Project auto-close sees persisted history and End date; repeated runs create no duplicates', async () => {
  const fixture = lifecycleFixture({ autoClose: true, missingItem: true });
  assert.deepEqual(await fixture.run(), { created: 0, updated: 0, closed: 1 });
  assert.deepEqual(fixture.calls, ['body', 'add', 'END_DATE', 'STATUS']);
  assert.match(fixture.saved.body, /none of its source alerts remain open/);
  assert.deepEqual(alertRefsFromBody(fixture.saved.body), ['dependabot:2']);
  assert.deepEqual(await fixture.run(), { created: 0, updated: 0, closed: 0 });
});

test('partial Project failures leave discoverable work and reruns preserve a single lifecycle note', async () => {
  for (const fault of ['failDate', 'failDone']) {
    const fixture = lifecycleFixture({ [fault]: true });
    await assert.rejects(fixture.run(), /unavailable/);
    assert.equal(fixture.saved.state, 'open');
    assert.deepEqual(await fixture.run(), { created: 0, updated: 0, closed: 1 });
    assert.equal(fixture.saved.state, 'closed');
    assert.equal(fixture.saved.body.split('security-alert-lifecycle').length, 2);
    assert.deepEqual(await fixture.run(), { created: 0, updated: 0, closed: 0 });
  }
});


test("exact structured concurrent-close response requires verified state and lifecycle body", async () => {
  const observed = { resource: "Issue", code: "custom", message: "This issue was closed by another request. Reload it and try again." };
  for (const errors of [[observed], [], [observed, { resource: "Issue", code: "invalid" }], [{ ...observed, resource: "PullRequest" }], [{ ...observed, code: "invalid" }], [null], null]) {
    for (const final of [{ state: "closed", state_reason: "completed", body: "saved" }, { state: "open", body: "saved" }, { state: "closed", state_reason: "not_planned", body: "saved" }, { state: "closed", state_reason: "completed", body: "other" }, null, "unavailable"]) {
      const error = { status: 422, response: { data: { message: "Validation Failed", errors } } };
      let reads = 0;
      const client = { rest: { issues: {
        get: async () => { if (++reads === 1) return { data: { state: "open" } }; if (final === "unavailable") throw new Error("read denied"); return { data: final }; },
        update: async () => { throw error; },
      } } };
      const benign = Array.isArray(errors) && (errors.length === 0 || (errors.length === 1 && errors[0] === observed));
      if (benign && final?.state === "closed" && final.state_reason === "completed" && final.body === "saved") await closeManagedIssue(client, { issue_number: 11 }, "saved");
      else await assert.rejects(closeManagedIssue(client, { issue_number: 11 }, "saved"), actual => actual === error);
      assert.equal(reads, benign ? 2 : 1);
    }
  }
});


test("omitted-alert draft recovery accounts for each source exactly once before mutation", async () => {
  const { validateGroups } = require("./sync-security-alerts");
  const source = { feed, alerts: Array.from({ length: 15 }, (_, i) => ({ ref: `dependabot:${i + 1}` })) };
  const draft = [group(source.alerts.slice(0, 12).map(alert => alert.ref), "Sanitized omitted-alert draft")];
  const recovered = validateGroups(source, draft, { recoverOmissions: true });
  assert.deepEqual(recovered.recoveredRefs, ["dependabot:13", "dependabot:14", "dependabot:15"]);
  assert.deepEqual(validateGroups(source, recovered.groups).recoveredRefs, []);
  for (const groups of [draft, [group(["dependabot:1", "dependabot:1"])], [group(["dependabot:999"])], [{ ...group(["dependabot:1"]), summary: "" }]]) {
    let reads = 0;
    await assert.rejects(synchronizeSecurityAlerts({ issueGithub: { paginate: async () => { reads++; } }, projectGithub: {}, source, groups, context: { repo: {} } }), /no issues changed/);
    assert.equal(reads, 0);
  }
  assert.throws(() => validateGroups(source, null, { recoverOmissions: true }), /Invalid/);
  assert.throws(() => validateGroups({ alerts: [...source.alerts, source.alerts[0]] }, []), /duplicate source/);
});

function recoveryFixture() {
  const issues = [];
  const items = new Map();
  const fields = [
    ["Status", ["Backlog", "In Progress", "Done"]], ["Domain", ["CI/CD"]], ["Work type", ["Security"]],
    ["Priority", ["P0", "P1", "P2"]], ["Size", ["M"]], ["Estimate", null], ["End date", null],
  ].map(([name, options]) => ({ name, id: name, dataType: options ? "SINGLE_SELECT" : name === "Estimate" ? "NUMBER" : "DATE", options: options?.map(name => ({ name, id: name })) }));
  const h = { issues, items, creates: 0, adds: 0, waits: 0, fault: null, fieldFault: false, accepted: false };
  const issueGithub = {
    paginate: async () => issues.filter(issue => issue.state === "open"),
    rest: { issues: {
      listForRepo() {}, get: async ({ issue_number }) => ({ data: issues.find(issue => issue.number === issue_number) }),
      create: async (input) => { h.creates++; const saved = { ...input, number: 20 + issues.length, node_id: `I${issues.length}`, state: "open" }; issues.push(saved); return { data: saved }; },
      update: async (input) => { const saved = issues.find(issue => issue.number === input.issue_number); Object.assign(saved, input); return { data: saved }; },
      addLabels: async () => {}, addAssignees: async () => {},
    } },
  };
  const projectGithub = { graphql: async (query, vars) => {
    if (query.includes("fields(first: 100)")) return { node: { fields: { nodes: fields } } };
    if (query.includes("fieldValues(first: 100)")) return { node: { fieldValues: { nodes: [...items.get(vars.item).values.keys()].map(name => ({ field: { name } })) } } };
    if (query.includes("items(first: 100")) return { node: { items: { nodes: [...items].map(([id, item]) => ({ id, content: { id: item.content } })), pageInfo: {} } } };
    if (query.includes("addProjectV2ItemById")) {
      h.adds++;
      if (!h.fault || h.accepted) items.set(vars.content, { content: vars.content, values: new Map() });
      if (h.fault) throw h.fault;
      return { addProjectV2ItemById: { item: { id: vars.content } } };
    }
    if (query.includes("updateProjectV2ItemFieldValue")) {
      if (h.fieldFault && vars.field === "Domain") { h.fieldFault = false; throw new Error("field service unavailable"); }
      items.get(vars.item).values.set(vars.field, vars.value);
      return {};
    }
    throw new Error("Unexpected query");
  } };
  h.source = { feed, alerts: [1, 2].map(n => ({ ref: `dependabot:${n}`, url: `https://example.test/${n}`, package: "example", severity: "medium" })) };
  h.groups = [group(h.source.alerts.map(alert => alert.ref))];
  h.run = () => synchronizeSecurityAlerts({ issueGithub, projectGithub, core: { info() {} }, context: { repo: { owner: "owner", repo: "repo" } }, projectId: "P", source: h.source, groups: h.groups, sleep: async () => { h.waits++; } });
  return h;
}

test("transient Project writes recover boundedly, including a committed write with lost response", async () => {
  for (const accepted of [false, true]) {
    const h = recoveryFixture(); h.fault = { status: 502 }; h.accepted = accepted;
    if (!accepted) {
      await assert.rejects(h.run(), /issue #20.*bounded recovery/);
      assert.equal(h.adds, 3); assert.equal(h.waits, 2);
      assert.equal(h.issues[0].state, "open");
      h.fault = null;
    }
    await h.run();
    assert.equal(h.creates, 1); assert.equal(h.items.size, 1);
    assert.deepEqual(alertRefsFromBody(h.issues[0].body), ["dependabot:1", "dependabot:2"]);
    assert.equal(h.items.get("I0").values.size, 6);
    await h.run(); assert.equal(h.creates, 1);
  }
  const denied = recoveryFixture(); denied.fault = { status: 403 };
  await assert.rejects(denied.run(), /attachment failed for issue #20/);
  assert.equal(denied.adds, 1); assert.equal(denied.waits, 0);
});

test("partial fields resume without resetting human planning or duplicating current coverage", async () => {
  const h = recoveryFixture(); h.fieldFault = true;
  await assert.rejects(h.run(), /field service unavailable/);
  h.items.get("I0").values.set("Status", { singleSelectOptionId: "In Progress" });
  await h.run();
  assert.equal(h.creates, 1); assert.equal(h.items.get("I0").values.size, 6);
  assert.deepEqual(h.items.get("I0").values.get("Status"), { singleSelectOptionId: "In Progress" });
  // Expand then merge coverage, retaining the oldest canonical issue and history.
  h.groups = [group(["dependabot:1"]), group(["dependabot:2"])];
  await h.run(); assert.equal(h.creates, 2);
  h.groups = [group(["dependabot:1", "dependabot:2"])];
  await h.run();
  assert.equal(h.issues[0].state, "open"); assert.equal(h.issues[1].state, "closed");
  assert.match(h.issues[1].body, /coverage moved to #20/);
  await h.run(); assert.equal(h.creates, 2);
});


test("malware fetch inspects only unique repository source advisories and fails before writes on uncertain classification", async () => {
  const action = fs.readFileSync(path.join(__dirname, "action.yml"), "utf8");
  const step = action.split("    - name: Fetch open structured alerts")[1].split("    - name: Draft grouped work items")[0];
  const script = step.split(/        script: \|\r?\n/)[1].split(/\r?\n/).map(line => line.replace(/^          /, "")).join("\n");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction("github", "context", "core", "process", "require", script);
  const raw = (number, ghsa) => ({ number, html_url: `https://example.test/${number}`, security_advisory: { ghsa_id: ghsa, severity: "medium" }, dependency: { package: { name: "example", ecosystem: "npm" } } });
  for (const mode of ["empty", "mixed", "unavailable", "malformed"]) {
    const calls = []; const writes = [];
    const github = {
      rest: { dependabot: { listAlertsForRepo() {} } },
      paginate: async method => { assert.equal(method, github.rest.dependabot.listAlertsForRepo); return mode === "empty" ? [] : [raw(1, "GHSA-one"), raw(2, "GHSA-one"), raw(3, "GHSA-two")]; },
      request: async (route, input) => {
        assert.equal(route, "GET /advisories/{ghsa_id}"); calls.push(input.ghsa_id);
        if (mode === "unavailable") throw new Error("advisory unavailable");
        if (mode === "malformed") return { data: { ghsa_id: input.ghsa_id } };
        return { data: { ghsa_id: input.ghsa_id, type: input.ghsa_id === "GHSA-one" ? "malware" : "reviewed" } };
      },
    };
    const execute = () => run(github, { repo: { owner: "owner", repo: "repo" } }, { info() {}, setOutput() {} }, { env: { FEED: "malware", RUNNER_TEMP: "/tmp" } }, name => { assert.equal(name, "fs"); return { writeFileSync: (file, body) => writes.push(JSON.parse(body)) }; });
    if (["unavailable", "malformed"].includes(mode)) { await assert.rejects(execute()); assert.equal(writes.length, 0); }
    else {
      await execute();
      assert.deepEqual(calls, mode === "empty" ? [] : ["GHSA-one", "GHSA-two"]);
      assert.deepEqual(writes[0].alerts.map(alert => alert.ref), mode === "empty" ? [] : ["dependabot:1", "dependabot:2"]);
    }
  }
});
