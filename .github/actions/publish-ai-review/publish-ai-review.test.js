"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  publishAiReview,
  unavailableReviewMarker,
} = require("./publish-ai-review");

function createGitHubMock({ priorReviews } = {}) {
  const createdReviews = [];
  const pulls = {
    listFiles() {},
    listReviews() {},
    listReviewComments() {},
    async createReview(review) {
      createdReviews.push(review);
      return { data: review };
    },
  };
  const apps = {
    async getAuthenticated() {
      return { data: { slug: "obi-wan-code-nobi-reviewer" } };
    },
  };
  const github = {
    rest: { apps, pulls },
    async paginate(method) {
      if (method === pulls.listFiles) {
        return [
          {
            filename: "src/example.js",
            patch: ["@@ -1,2 +1,2 @@", "-old duplicate", "+new duplicate"].join(
              "\n",
            ),
          },
        ];
      }
      if (method === pulls.listReviews) {
        return (
          priorReviews ?? [
            {
              id: 42,
              state: "CHANGES_REQUESTED",
              submitted_at: "2026-07-12T00:00:00Z",
              body: "Existing review body",
              user: { login: "obi-wan-code-nobi-reviewer[bot]" },
            },
          ]
        );
      }
      if (method === pulls.listReviewComments) {
        return [
          {
            path: "src/example.js",
            line: 1,
            body: "Duplicate inline finding",
            diff_hunk: "@@ -1,2 +1,2 @@",
            pull_request_review_id: 42,
            user: { login: "obi-wan-code-nobi-reviewer[bot]" },
          },
        ];
      }
      return [];
    },
  };
  return { createdReviews, github };
}

test("preserves an unplaceable finding when a duplicate inline finding is suppressed", async () => {
  const { createdReviews, github } = createGitHubMock();
  const failures = [];
  const warnings = [];
  const core = {
    setFailed(message) {
      failures.push(message);
    },
    warning(message) {
      warnings.push(message);
    },
  };

  await publishAiReview({
    github,
    context: {
      repo: { owner: "VanillaIceCube", repo: "Notoli" },
      payload: { pull_request: { number: 589 } },
    },
    core,
    personaName: "Obi-Wan Code-nobi",
    defaultBody: "Obi-Wan Code-nobi completed a code review.",
    raw: JSON.stringify({
      event: "REQUEST_CHANGES",
      body: "Existing review body",
      comments: [
        { path: "src/example.js", line: 1, body: "Duplicate inline finding" },
        { path: "src/example.js", line: 99, body: "New unplaceable finding" },
      ],
    }),
  });

  assert.deepEqual(failures, []);
  assert.deepEqual(warnings, []);
  assert.equal(createdReviews.length, 1);
  assert.equal(createdReviews[0].comments, undefined);
  assert.match(createdReviews[0].body, /### Unplaced inline findings/);
  assert.match(
    createdReviews[0].body,
    /`src\/example\.js:99`: New unplaceable finding/,
  );
  assert.match(
    createdReviews[0].body,
    /1 duplicate inline comment\(s\) already appeared in an earlier Obi-Wan Code-nobi review/,
  );
  assert.match(
    createdReviews[0].body,
    /1 inline finding\(s\) were moved into the review body because they did not target valid added diff lines/,
  );
});

test("publishes one native fallback review when OpenAI quota is unavailable", async () => {
  const { createdReviews, github } = createGitHubMock();
  const failures = [];
  const warnings = [];
  const core = {
    setFailed(message) {
      failures.push(message);
    },
    warning(message) {
      warnings.push(message);
    },
  };

  await publishAiReview({
    github,
    context: {
      repo: { owner: "VanillaIceCube", repo: "Notoli" },
      payload: {
        pull_request: {
          number: 635,
          head: { sha: "abc123" },
        },
      },
    },
    core,
    personaName: "Lint Eastwood",
    raw: "OpenAI API error: You exceeded your current quota.",
  });

  assert.deepEqual(failures, [
    "OpenAI API error: You exceeded your current quota.",
  ]);
  assert.deepEqual(warnings, []);
  assert.equal(createdReviews.length, 1);
  assert.equal(createdReviews[0].event, "COMMENT");
  assert.match(
    createdReviews[0].body,
    /notoli-ai-review-unavailable:lint-eastwood:abc123/,
  );
  assert.match(createdReviews[0].body, /exhausted quota or tokens/);
  assert.match(createdReviews[0].body, /not an approval and not a finding/);
});

test("does not repeat an unavailable review for the same persona and commit", async () => {
  const marker = unavailableReviewMarker("RoboCop", "def456");
  const { createdReviews, github } = createGitHubMock({
    priorReviews: [{ body: `${marker}\nExisting unavailable notice.` }],
  });
  const failures = [];
  const warnings = [];
  const core = {
    setFailed(message) {
      failures.push(message);
    },
    warning(message) {
      warnings.push(message);
    },
  };

  await publishAiReview({
    github,
    context: {
      repo: { owner: "VanillaIceCube", repo: "Notoli" },
      payload: {
        pull_request: {
          number: 635,
          head: { sha: "def456" },
        },
      },
    },
    core,
    personaName: "RoboCop",
    raw: "OpenAI request failed before a response was received.",
  });

  assert.equal(createdReviews.length, 0);
  assert.equal(failures.length, 1);
  assert.deepEqual(warnings, [
    "RoboCop already posted an unavailable notice for this commit.",
  ]);
});
