"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  alertDomain,
  alertPriority,
  alertRefsFromBody,
  markerFor,
  planReconciliation,
  synchronizeSecurityAlerts,
  withLifecycleNote,
  closeManagedIssue,
} = require("../actions/track-security-alerts/sync-security-alerts");

test("alert domains follow the affected component, with mixed and unclear groups left for triage", () => {
  assert.equal(alertDomain([{ manifest: "frontend/package-lock.json" }]), "Frontend");
  assert.equal(alertDomain([{ location: "./backend/apps/core/views.py" }]), "Backend");
  assert.equal(alertDomain([{ location: ".github/workflows/ci.yml" }, { manifest: "gateway/compose.yml" }]), "Cloud");
  assert.equal(alertDomain([{ manifest: "frontend/package-lock.json" }, { location: "backend/manage.py" }]), null);
  assert.equal(alertDomain([{ manifest: "package-lock.json" }]), null);
  assert.equal(alertDomain([{ manifest: "frontend/package-lock.json" }, {}]), null);
});

test("critical and high alerts receive incident priority while medium/low vulnerabilities remain backlog work", () => {
  assert.equal(alertPriority("vulnerability", [{ severity: "medium" }, { severity: "critical" }]), "P0");
  assert.equal(alertPriority("vulnerability", [{ severity: "high" }]), "P1");
  assert.equal(alertPriority("vulnerability", [{ severity: "unknown" }]), "P1");
  assert.equal(alertPriority("vulnerability", [{ severity: "low" }, { severity: "medium" }]), "P2");
  assert.equal(alertPriority("malware", [{ severity: "low" }]), "P1");
});

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

test("source refs remain parseable and lifecycle notes are replaced idempotently", () => {
  const original = issue(10, ["dependabot:2", "dependabot:1"]).body;
  const first = withLifecycleNote(original, "_Closed once._");
  const second = withLifecycleNote(first, "_Closed with updated context._");

  assert.deepEqual(alertRefsFromBody(second), ["dependabot:1", "dependabot:2"]);
  assert.equal(second.match(/notoli-security-alert-lifecycle/g)?.length, 1);
  assert.match(second, /Closed with updated context/);
  assert.doesNotMatch(second, /Closed once/);
});

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
  const { validateGroups } = require("../actions/track-security-alerts/sync-security-alerts");
  const source = { feed, alerts: Array.from({ length: 15 }, (_, i) => ({ ref: `dependabot:${i + 1}` })) };
  const draft = [group(source.alerts.slice(0, 12).map(alert => alert.ref), "Sanitized omitted-alert draft")];
  const recovered = validateGroups(source, draft, { recoverOmissions: true });
  assert.deepEqual(recovered.recoveredRefs, ["dependabot:13", "dependabot:14", "dependabot:15"]);
  assert.deepEqual(validateGroups(source, recovered.groups).recoveredRefs, []);
  for (const groups of [draft, [group(["dependabot:1", "dependabot:1"])], [group(["dependabot:999"])], [{ ...group(["dependabot:1"]), summary: "" }]]) {
    let reads = 0;
    await assert.rejects(synchronizeSecurityAlerts({ issueGithub: { paginate: async () => { reads++; } }, source, groups, context: { repo: {} } }), /no issues changed/);
    assert.equal(reads, 0);
  }
  assert.throws(() => validateGroups(source, null, { recoverOmissions: true }), /Invalid/);
  assert.throws(() => validateGroups({ alerts: [...source.alerts, source.alerts[0]] }, []), /duplicate source/);
});

function nativeFixture(initialIssues = []) {
  const fields = { Domain: 1, Priority: 2, Size: 3, "End date": 5 };
  const issues = new Map(initialIssues.map(initial => [initial.number, { state: "open", ...initial }]));
  const values = new Map();
  const events = [];
  let nextNumber = 100;
  let failFieldWrite = false;
  const github = {
    paginate: async () => [...issues.values()].filter(candidate => candidate.state === "open"),
    rest: { issues: {
      listForRepo() {},
      get: async ({ issue_number }) => ({ data: issues.get(issue_number) }),
      create: async input => {
        const created = { ...input, number: nextNumber++, state: "open" };
        issues.set(created.number, created);
        events.push({ create: created.number });
        return { data: created };
      },
      update: async ({ issue_number, ...input }) => {
        const saved = issues.get(issue_number);
        Object.assign(saved, input);
        events.push({ issue: issue_number, ...input });
        return { data: saved };
      },
      addLabels: async ({ issue_number, labels }) => { issues.get(issue_number).labels = labels; },
      addAssignees: async ({ issue_number, assignees }) => { issues.get(issue_number).assignees = assignees; },
    } },
    request: async (route, { issue_number, issue_field_values }) => {
      const current = values.get(issue_number) ?? new Map();
      if (route.startsWith("GET ")) {
        return { data: [...current].map(([fieldId, value]) => ({ issue_field_id: fieldId, value })) };
      }
      assert.match(route, /^POST .*issue-field-values$/);
      assert.ok(issue_field_values.length);
      events.push({ fields: issue_number, values: issue_field_values });
      if (failFieldWrite) throw new Error("Native issue-field write failed");
      for (const { field_id, value } of issue_field_values) current.set(field_id, value);
      values.set(issue_number, current);
    },
  };
  async function run(alerts, groups) {
    return synchronizeSecurityAlerts({
      issueGithub: github, fields, context: { repo: { owner: "repo-owner", repo: "repo" } },
      core: { info() {} }, source: { feed, alerts }, groups, currentDate: "2026-11-25",
    });
  }
  return { fields, issues, values, events, run, setFieldFailure(fail) { failFieldWrite = fail; } };
}

test("native reconciliation preserves existing planning and raises urgent priority", async () => {
  const { fields, issues, values, run } = nativeFixture([
    { ...issue(10, ["dependabot:1"]), type: { name: "Chore" } },
    issue(11, ["dependabot:2"]),
  ]);
  values.set(10, new Map([[fields.Priority, "P2"], [fields.Domain, "Backend"], [99, "keep"]]));
  const merged = group(["dependabot:1", "dependabot:2"]);
  const alerts = [
    { ref: "dependabot:1", severity: "medium" },
    { ref: "dependabot:2", severity: "critical" },
  ];
  assert.deepEqual(await run(alerts, [merged]), { created: 0, updated: 1, closed: 1 });
  assert.deepEqual(issues.get(10).type, { name: "Chore" });
  assert.equal(values.get(10).get(fields.Priority), "P0");
  assert.equal(values.get(10).get(fields.Domain), "Backend");
  assert.equal(values.get(10).get(99), "keep");
  assert.equal(values.get(11).get(fields["End date"]), "2026-11-25");
  assert.match(issues.get(11).body, /coverage moved to #10/);
  assert.equal(issues.get(11).state_reason, "completed");
  await run(alerts.map(alert => ({ ...alert, severity: "medium" })), [merged]);
  assert.equal(values.get(10).get(fields.Priority), "P0");
});

test("a failed native field write leaves one discoverable issue and reruns fill its metadata", async () => {
  const fixture = nativeFixture();
  const alerts = [{ ref: "dependabot:1", severity: "high" }];
  const groups = [group(["dependabot:1"])];
  fixture.setFieldFailure(true);
  await assert.rejects(fixture.run(alerts, groups), /Native issue-field write failed/);
  fixture.setFieldFailure(false);
  assert.deepEqual(await fixture.run(alerts, groups), { created: 0, updated: 1, closed: 0 });
  assert.equal(fixture.issues.size, 1);
  const saved = fixture.issues.get(100);
  assert.equal(saved.type, "Bug");
  assert.deepEqual(saved.labels, [feed]);
  assert.deepEqual(saved.assignees, ["repo-owner"]);
  assert.equal(fixture.values.get(100).get(fixture.fields.Priority), "P1");
  assert.equal(fixture.values.get(100).get(fixture.fields.Size), "M");
});

test("reconciliation persists the note and native end date before closing and retries safely", async () => {
  const fixture = nativeFixture([issue(11, ["dependabot:2"])]);
  fixture.setFieldFailure(true);
  await assert.rejects(fixture.run([], []), /Native issue-field write failed/);
  assert.equal(fixture.issues.get(11).state, "open");
  assert.match(fixture.issues.get(11).body, /none of its source alerts remain/);
  fixture.events.length = 0;
  fixture.setFieldFailure(false);
  assert.deepEqual(await fixture.run([], []), { created: 0, updated: 0, closed: 1 });
  const [history, endDate, close] = fixture.events;
  assert.match(history.body, /none of its source alerts remain/);
  assert.deepEqual(endDate.values, [{ field_id: fixture.fields["End date"], value: "2026-11-25" }]);
  assert.equal(close.state, "closed");
  assert.equal(fixture.issues.get(11).body.match(/notoli-security-alert-lifecycle/g).length, 1);
  assert.deepEqual(await fixture.run([], []), { created: 0, updated: 0, closed: 0 });
});
