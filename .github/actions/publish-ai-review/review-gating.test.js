"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { publishAiReview, renderReviewBody } = require("./publish-ai-review");

test("gate audit rejects missing, skipped, cancelled and failed reviewer results", () => {
  const {
    requiredReviewerContexts,
    reviewerGateProblems,
  } = require("./verify-gates");
  const ruleset = {
    enforcement: "active",
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: requiredReviewerContexts.map((context) => ({
            context,
          })),
        },
      },
    ],
  };
  const clean = requiredReviewerContexts.map((name, index) => ({
    id: index + 1,
    name,
    status: "completed",
    conclusion: "success",
  }));
  assert.deepEqual(reviewerGateProblems(ruleset, clean), []);
  assert.ok(
    reviewerGateProblems({ ...ruleset, enforcement: "disabled" }, clean).length,
  );
  assert.ok(reviewerGateProblems({ ...ruleset, rules: [] }, clean).length);
  for (const conclusion of [
    "failure",
    "cancelled",
    "skipped",
    "neutral",
    "timed_out",
    "action_required",
    "stale",
    null,
  ]) {
    assert.equal(
      reviewerGateProblems(ruleset, [
        ...clean,
        { ...clean[0], id: 10, conclusion },
      ]).length,
      1,
      String(conclusion),
    );
  }
  assert.equal(reviewerGateProblems(ruleset, clean.slice(1)).length, 1);
  assert.equal(
    reviewerGateProblems(ruleset, [
      ...clean,
      { ...clean[0], id: 10, status: "in_progress", conclusion: null },
    ]).length,
    1,
  );
  const failed = { ...clean[0], id: 10, conclusion: "failure" };
  const rerun = { ...failed, id: 11, conclusion: "success" };
  assert.equal(
    reviewerGateProblems(ruleset, [failed, ...clean.slice(1)]).length,
    1,
  );
  assert.deepEqual(
    reviewerGateProblems(ruleset, [failed, rerun, ...clean.slice(1)]),
    [],
    "A successful rerun supersedes the earlier failure",
  );
});

const personas = [
  [
    "Obi-Wan Code-nobi",
    "code-review",
    "AI Code Review",
    "review-code.yml",
    "Obi-Wan Code-nobi code review",
  ],
  [
    "Lint Eastwood",
    "build-review",
    "AI Build Sheriff Review",
    "review-build.yml",
    "Lint Eastwood build sheriff review",
  ],
  [
    "RoboCop",
    "security-review",
    "AI Security Review",
    "review-security.yml",
    "RoboCop security review",
  ],
];

function harness(personaName, priorReviews = []) {
  const created = [];
  const failures = [];
  const pulls = {
    listFiles() {},
    listReviews() {},
    listReviewComments() {},
    async createReview(value) {
      created.push(value);
      return { data: value };
    },
  };
  const github = {
    rest: {
      pulls,
      apps: {
        async getAuthenticated() {
          return { data: { slug: "reviewer" } };
        },
      },
    },
    async paginate(method) {
      return method === pulls.listReviews ? priorReviews : [];
    },
  };
  const core = {
    setFailed(message) {
      assert.equal(
        created.length,
        1,
        "Publish the native verdict before failing",
      );
      failures.push(message);
    },
    warning() {},
    info() {},
  };
  const context = {
    repo: { owner: "example", repo: "app" },
    payload: { pull_request: { number: 1, head: { sha: "current-head" } } },
  };
  return {
    created,
    failures,
    github,
    publish: (raw) =>
      publishAiReview({ github, core, context, personaName, raw }),
  };
}

for (const [personaName] of personas) {
  test(`${personaName}: verdict and rerun gating match the native review`, async () => {
    for (const unchanged of [false, true]) {
      for (const event of ["APPROVE", "COMMENT", "REQUEST_CHANGES"]) {
        const summary = "Current verdict.";
        const prior = unchanged
          ? [
              {
                id: 42,
                state: {
                  APPROVE: "APPROVED",
                  COMMENT: "COMMENTED",
                  REQUEST_CHANGES: "CHANGES_REQUESTED",
                }[event],
                body: renderReviewBody({ personaName, summary }),
                submitted_at: "2026-10-20T00:00:00Z",
                user: { login: "reviewer[bot]" },
              },
            ]
          : [];
        const h = harness(personaName, prior);
        await h.publish(JSON.stringify({ event, summary, unchanged }));
        assert.equal(h.created[0].event, event);
        assert.deepEqual(
          h.failures,
          event === "REQUEST_CHANGES"
            ? [`${personaName} requested changes.`]
            : [],
        );
      }
    }

    // A later head's successful job must not inherit a prior job's failed verdict.
    const h = harness(personaName, [
      {
        id: 42,
        state: "CHANGES_REQUESTED",
        commit_id: "previous-head",
        submitted_at: "2026-10-19T00:00:00Z",
        user: { login: "reviewer[bot]" },
      },
    ]);
    await h.publish(
      JSON.stringify({
        event: "APPROVE",
        summary: "Findings fixed on current head.",
      }),
    );
    assert.equal(h.created[0].event, "APPROVE");
    assert.deepEqual(h.failures, []);
  });

  test(`${personaName}: unavailable and malformed verdicts fail closed`, async () => {
    for (const raw of [
      "",
      "Missing secret: test",
      "OpenAI request failed",
      "{",
      "null",
      "[]",
      JSON.stringify({ event: "APPROVE" }),
      JSON.stringify({ event: "UNKNOWN", summary: "Unusable verdict" }),
      JSON.stringify({ summary: "Missing verdict" }),
    ]) {
      const h = harness(personaName);
      await h.publish(raw);
      assert.equal(h.created[0].event, "COMMENT");
      assert.equal(h.failures.length, 1);
      assert.match(h.created[0].body, /unavailable/i);
    }
  });

  test(`${personaName}: publication errors cannot return a successful job`, async () => {
    const h = harness(personaName);
    h.github.rest.pulls.createReview = async () => {
      throw new Error("GitHub unavailable");
    };
    await assert.rejects(
      h.publish(
        JSON.stringify({
          event: "REQUEST_CHANGES",
          summary: "Blocking finding.",
        }),
      ),
      /GitHub unavailable/,
    );
  });
}

const workflows = path.resolve(__dirname, "../../workflows");
const readWorkflow = (name) =>
  fs.readFileSync(path.join(workflows, name), "utf8").replaceAll("\r\n", "\n");
const orchestrator = readWorkflow("ci-orchestrator.yml");

function job(source, id) {
  const match = source.match(
    new RegExp(`^  ${id}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, "m"),
  );
  assert.ok(match, `Missing job: ${id}`);
  return match[1];
}

test("required reviewer contexts and trusted PR eligibility stay stable", () => {
  assert.deepEqual(
    require("./verify-gates").requiredReviewerContexts,
    personas.map(
      ([, , parentName, , childName]) => `${parentName} / ${childName}`,
    ),
  );
  assert.match(
    orchestrator,
    /  pull_request:\n    types: \[opened, synchronize, reopened, ready_for_review\]/,
  );
  assert.doesNotMatch(
    orchestrator,
    /pull_request_target:|paths(?:-ignore)?:|secrets: inherit/,
  );
  for (const [, id, parentName, file, childName] of personas) {
    const parent = job(orchestrator, id);
    const child = job(readWorkflow(file), "review");
    assert.equal(parent.match(/    name: (.+)/)[1], parentName);
    assert.equal(child.match(/    name: (.+)/)[1], childName);
    assert.match(
      parent,
      new RegExp(
        `uses: \\.\\/\\.github\\/workflows\\/${file.replaceAll(".", "\\.")}`,
      ),
    );
    assert.doesNotMatch(child, /^    if:/m);
    assert.doesNotMatch(child, /continue-on-error:/);
    const condition = parent.match(/    if: >-\n((?:      .*\n)+)/)[1].trim();
    for (const author of ["human", "dependabot[bot]"]) {
      for (const upstream of ["success", "failure", "skipped", "cancelled"]) {
        for (const sameRepo of [true, false]) {
          const github = {
            repository: "example/app",
            event_name: "pull_request",
            event: {
              pull_request: {
                user: { login: author },
                head: {
                  repo: { full_name: sameRepo ? "example/app" : "fork/app" },
                },
              },
            },
          };
          const needs = Object.fromEntries(
            [
              "lints",
              "tests",
              "codeql",
              "dependency-vulnerability",
              "dependency-malware",
            ].map((name) => [name, { result: upstream }]),
          );
          const allowed = vm.runInNewContext(condition, {
            github,
            needs,
            always: () => true,
            success: () => upstream === "success",
          });
          assert.equal(
            allowed,
            sameRepo,
            `${id}: ${author}/${upstream}/${sameRepo}`,
          );
        }
      }
    }
    if (id !== "code-review") {
      assert.match(
        parent,
        /always\(\)/,
        "Upstream failures/skips/cancellation must not skip a reviewer",
      );
    }
    assert.match(
      parent,
      /_OPENAI_API_KEY: \$\{\{ secrets\.[A-Z_]+_OPENAI_API_KEY \}\}/,
    );
    assert.match(
      parent,
      /_PRIVATE_KEY: \$\{\{ secrets\.[A-Z_]+_PRIVATE_KEY \}\}/,
    );
    assert.doesNotMatch(parent, /continue-on-error:/);
    assert.match(child, /uses: \.\/\.github\/actions\/publish-ai-review/);
  }
});
