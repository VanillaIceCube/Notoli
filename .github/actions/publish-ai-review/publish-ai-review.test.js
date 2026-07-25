"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  publishAiReview,
  renderReviewBody,
  unavailableReviewMarker,
} = require("./publish-ai-review");

function createGitHubMock({
  files,
  priorReviews,
  priorComments,
  appSlug = "obi-wan-code-nobi-reviewer",
} = {}) {
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
      return { data: { slug: appSlug } };
    },
  };
  const github = {
    rest: { apps, pulls },
    async paginate(method) {
      if (method === pulls.listFiles) {
        return (
          files ?? [
            {
              filename: "src/example.js",
              patch: [
                "@@ -1,2 +1,2 @@",
                "-old duplicate",
                "+new duplicate",
              ].join("\n"),
            },
          ]
        );
      }
      if (method === pulls.listReviews) return priorReviews ?? [];
      if (method === pulls.listReviewComments) return priorComments ?? [];
      return [];
    },
  };
  return { createdReviews, github };
}

function createCore() {
  const failures = [];
  const warnings = [];
  const infos = [];
  return {
    failures,
    infos,
    warnings,
    core: {
      setFailed(message) {
        failures.push(message);
      },
      warning(message) {
        warnings.push(message);
      },
      info(message) {
        infos.push(message);
      },
    },
  };
}

function context({ number = 626, sha = "abc123" } = {}) {
  return {
    repo: { owner: "VanillaIceCube", repo: "Notoli" },
    payload: {
      pull_request: {
        number,
        head: { sha },
      },
    },
  };
}

function review(overrides = {}) {
  return {
    event: "APPROVE",
    summary: "The implementation is sound and ready to proceed.",
    unchanged: false,
    findings: [],
    evidence: [],
    actions: [],
    comments: [],
    ...overrides,
  };
}

test("renders clean approvals with persona-specific identity and no empty groups", () => {
  const cases = [
    {
      personaName: "Obi-Wan Code-nobi",
      expected:
        "## 🧭 Obi-Wan Code-nobi\n\n**Approved.** The path is clear and the implementation is ready to proceed.",
      summary:
        "**Approved.** The path is clear and the implementation is ready to proceed.",
    },
    {
      personaName: "Lint Eastwood",
      expected:
        "## 🤠 Lint Eastwood\n\n**Approved.** The build is clean and this one can ride.",
      summary: "**Approved.** The build is clean and this one can ride.",
    },
    {
      personaName: "RoboCop",
      expected:
        "## 🛡️ RoboCop\n\n**APPROVED.** Security gates are clear. No actionable risk detected.",
      summary:
        "**APPROVED.** Security gates are clear. No actionable risk detected.",
    },
  ];

  for (const item of cases) {
    assert.equal(
      renderReviewBody({
        personaName: item.personaName,
        summary:
          item.summary ??
          "**Approved.** The path is clear and the implementation is ready to proceed.",
      }),
      item.expected,
    );
  }
});

test("renders only populated findings, evidence, and action groups", () => {
  assert.equal(
    renderReviewBody({
      personaName: "Obi-Wan Code-nobi",
      summary:
        "**Changes requested.** Most of the path is sound, but one publishing edge case remains.",
      findings: [
        {
          path: ".github/actions/publish-ai-review/publish-ai-review.js",
          line: 281,
          body: "A new unplaceable finding can be discarded.",
        },
      ],
      evidence: ["The duplicate shortcut runs before the finding is retained."],
      actions: ["Preserve the finding and add behavioral coverage."],
    }),
    [
      "## 🧭 Obi-Wan Code-nobi",
      "",
      "**Changes requested.** Most of the path is sound, but one publishing edge case remains.",
      "",
      "## 🔎 Findings",
      "",
      "- `.github/actions/publish-ai-review/publish-ai-review.js:281` — A new unplaceable finding can be discarded.",
      "",
      "## 📚 Evidence reviewed",
      "",
      "- The duplicate shortcut runs before the finding is retained.",
      "",
      "## ✅ Next step",
      "",
      "- Preserve the finding and add behavioral coverage.",
    ].join("\n"),
  );
});

test("renders an infrastructure-only RoboCop comment without implying approval", () => {
  assert.equal(
    renderReviewBody({
      personaName: "RoboCop",
      summary:
        "**COMMENT — REVIEW INCOMPLETE.** CodeQL scope detection failed before analysis began.",
      evidence: [
        "CodeQL analyzers did not run.",
        "Dependency and malware gates passed.",
      ],
      actions: ["Rerun CodeQL after the API rate limit clears."],
    }),
    [
      "## 🛡️ RoboCop",
      "",
      "**COMMENT — REVIEW INCOMPLETE.** CodeQL scope detection failed before analysis began.",
      "",
      "## 📋 Evidence",
      "",
      "- CodeQL analyzers did not run.",
      "- Dependency and malware gates passed.",
      "",
      "## ▶️ Directive",
      "",
      "- Rerun CodeQL after the API rate limit clears.",
    ].join("\n"),
  );
});

test("renders varied model-authored unchanged summaries without preset copy", () => {
  assert.equal(
    renderReviewBody({
      personaName: "Obi-Wan Code-nobi",
      summary:
        "**Approved — the path still runs true.** No new code-quality disturbance has surfaced since the previous review.",
    }),
    "## 🧭 Obi-Wan Code-nobi\n\n**Approved — the path still runs true.** No new code-quality disturbance has surfaced since the previous review.",
  );
  assert.equal(
    renderReviewBody({
      personaName: "Lint Eastwood",
      summary:
        "**Changes requested — this gate stays hitched.** No fresh build trouble joined the posse, but the earlier blocker remains.",
    }),
    "## 🤠 Lint Eastwood\n\n**Changes requested — this gate stays hitched.** No fresh build trouble joined the posse, but the earlier blocker remains.",
  );
  assert.equal(
    renderReviewBody({
      personaName: "RoboCop",
      summary:
        "**COMMENT — THREAT PICTURE UNCHANGED.** Existing evidence remains incomplete; no new security finding is authorized.",
    }),
    "## 🛡️ RoboCop\n\n**COMMENT — THREAT PICTURE UNCHANGED.** Existing evidence remains incomplete; no new security finding is authorized.",
  );
});

test("keeps exact-line findings inline without duplicating them in the body", async () => {
  const { createdReviews, github } = createGitHubMock();
  const { core, failures, warnings } = createCore();
  const inlineBody =
    "`Function` triggers `no-new-func`, which blocks the lint gate. Replace it with a lint-compliant execution method.";

  await publishAiReview({
    github,
    context: context(),
    core,
    personaName: "Lint Eastwood",
    raw: JSON.stringify(
      review({
        event: "REQUEST_CHANGES",
        summary:
          "The tests made it through town, but lint caught one blocking warning. See the inline finding.",
        comments: [{ path: "src/example.js", line: 1, body: inlineBody }],
      }),
    ),
  });

  assert.deepEqual(failures, []);
  assert.deepEqual(warnings, []);
  assert.equal(createdReviews.length, 1);
  assert.doesNotMatch(createdReviews[0].body, /no-new-func/);
  assert.deepEqual(createdReviews[0].comments, [
    { path: "src/example.js", line: 1, side: "RIGHT", body: inlineBody },
  ]);
});

test("preserves every unplaceable finding when a duplicate is suppressed", async () => {
  const priorBody = renderReviewBody({
    personaName: "Obi-Wan Code-nobi",
    event: "REQUEST_CHANGES",
    summary: "One publishing edge case remains.",
  });
  const { createdReviews, github } = createGitHubMock({
    priorReviews: [
      {
        id: 42,
        state: "CHANGES_REQUESTED",
        submitted_at: "2026-07-12T00:00:00Z",
        body: priorBody,
        user: { login: "obi-wan-code-nobi-reviewer[bot]" },
      },
    ],
    priorComments: [
      {
        path: "src/example.js",
        line: 1,
        body: "Duplicate inline finding",
        diff_hunk: "@@ -1,2 +1,2 @@",
        pull_request_review_id: 42,
        user: { login: "obi-wan-code-nobi-reviewer[bot]" },
      },
    ],
  });
  const { core, failures, infos, warnings } = createCore();

  await publishAiReview({
    github,
    context: context(),
    core,
    personaName: "Obi-Wan Code-nobi",
    raw: JSON.stringify(
      review({
        event: "REQUEST_CHANGES",
        summary: "One publishing edge case remains.",
        comments: [
          { path: "src/example.js", line: 1, body: "Duplicate inline finding" },
          { path: "src/example.js", line: 99, body: "First new finding" },
          { path: "src/other.js", line: 120, body: "Second new finding" },
        ],
      }),
    ),
  });

  assert.deepEqual(failures, []);
  assert.deepEqual(warnings, []);
  assert.equal(createdReviews.length, 1);
  assert.equal(createdReviews[0].comments, undefined);
  assert.match(
    createdReviews[0].body,
    /`src\/example\.js:99` — First new finding/,
  );
  assert.match(
    createdReviews[0].body,
    /`src\/other\.js:120` — Second new finding/,
  );
  assert.doesNotMatch(createdReviews[0].body, /Automation notes/);
  assert.deepEqual(infos, [
    "1 duplicate Obi-Wan Code-nobi inline comment(s) were suppressed.",
    "2 Obi-Wan Code-nobi finding(s) were moved into the review body.",
  ]);
});

test("keeps the model-authored summary when it declares no new material", async () => {
  const { createdReviews, github } = createGitHubMock({
    priorReviews: [
      {
        id: 42,
        state: "APPROVED",
        submitted_at: "2026-07-12T00:00:00Z",
        body: "Previous approval",
        user: { login: "obi-wan-code-nobi-reviewer[bot]" },
      },
    ],
  });
  const { core } = createCore();

  await publishAiReview({
    github,
    context: context(),
    core,
    personaName: "Obi-Wan Code-nobi",
    raw: JSON.stringify(
      review({
        unchanged: true,
        summary:
          "**Approved — the path still runs true.** No materially new concerns emerged.",
      }),
    ),
  });

  assert.equal(
    createdReviews[0].body,
    renderReviewBody({
      personaName: "Obi-Wan Code-nobi",
      summary:
        "**Approved — the path still runs true.** No materially new concerns emerged.",
    }),
  );
  assert.equal(createdReviews[0].event, "APPROVE");
});

test("logs malformed comments internally instead of adding automation notes", async () => {
  const { createdReviews, github } = createGitHubMock();
  const { core, warnings } = createCore();

  await publishAiReview({
    github,
    context: context(),
    core,
    personaName: "RoboCop",
    raw: JSON.stringify(
      review({
        comments: [{ path: "src/example.js", line: 1, body: "" }],
      }),
    ),
  });

  assert.deepEqual(warnings, [
    "1 malformed RoboCop inline comment(s) were omitted.",
  ]);
  assert.doesNotMatch(createdReviews[0].body, /Automation notes/);
});

test("publishes one concise native fallback review when OpenAI is unavailable", async () => {
  const { createdReviews, github } = createGitHubMock();
  const { core, failures, warnings } = createCore();

  await publishAiReview({
    github,
    context: context({ number: 635 }),
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
  assert.match(createdReviews[0].body, /## 🤠 Lint Eastwood/);
  assert.match(createdReviews[0].body, /\*\*Review unavailable\.\*\*/);
  assert.match(createdReviews[0].body, /not an approval or a finding/);
});

test("treats a structurally unusable AI response as unavailable", async () => {
  const { createdReviews, github } = createGitHubMock();
  const { core, failures } = createCore();

  await publishAiReview({
    github,
    context: context({ sha: "badshape" }),
    core,
    personaName: "RoboCop",
    raw: JSON.stringify({ event: "APPROVE", comments: [] }),
  });

  assert.deepEqual(failures, ["RoboCop returned a review without a summary."]);
  assert.equal(createdReviews[0].event, "COMMENT");
  assert.match(createdReviews[0].body, /robocop:badshape/);
});

test("does not repeat an unavailable review for the same persona and commit", async () => {
  const marker = unavailableReviewMarker("RoboCop", "def456");
  const { createdReviews, github } = createGitHubMock({
    priorReviews: [{ body: `${marker}\nExisting unavailable notice.` }],
  });
  const { core, failures, warnings } = createCore();

  await publishAiReview({
    github,
    context: context({ number: 635, sha: "def456" }),
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

test("keeps the visually inspectable Markdown examples synchronized", () => {
  const examples = [
    "# AI review format examples",
    "",
    "These fixtures show the canonical review states rendered by the shared publisher.",
    "",
    "---",
    "",
    "*Clean code-review approval*",
    "",
    renderReviewBody({
      personaName: "Obi-Wan Code-nobi",
      summary:
        "**Approved.** The credential boundaries are clear, the reconciliation path is well tested, and the earlier concerns are resolved. The path is open.",
      evidence: [
        "Alert permissions, credential separation, and regression coverage support the verdict.",
      ],
    }),
    "",
    "---",
    "",
    "*Build failure with its exact diagnostic left inline*",
    "",
    renderReviewBody({
      personaName: "Lint Eastwood",
      summary:
        "**Changes requested.** The tests made it through town, but lint caught one outlaw in the new test code. The gate stays shut until the inline finding is fixed.",
    }),
    "",
    "---",
    "",
    "*Infrastructure-only security comment*",
    "",
    renderReviewBody({
      personaName: "RoboCop",
      summary:
        "**COMMENT — REVIEW INCOMPLETE.** CodeQL scope detection failed before the analyzers ran. Approval is not authorized without that evidence.",
      evidence: [
        "CodeQL analysis is unavailable.",
        "Dependency and malware gates passed.",
      ],
      actions: ["Rerun CodeQL after the API rate limit clears."],
    }),
    "",
    "---",
    "",
    "*Unplaceable finding preserved in the review body*",
    "",
    renderReviewBody({
      personaName: "Obi-Wan Code-nobi",
      summary:
        "**Changes requested.** Most of the path is sound, but one publishing edge case still lurks in the shadows and can hide a new finding.",
      findings: [
        {
          path: ".github/actions/publish-ai-review/publish-ai-review.js",
          line: 281,
          body: "Preserve this finding when duplicate inline comments are suppressed.",
        },
      ],
      actions: ["Add execution-level coverage for the mixed result."],
    }),
    "",
    "---",
    "",
    "*Unchanged security approval*",
    "",
    renderReviewBody({
      personaName: "RoboCop",
      summary:
        "**APPROVED — SECURITY POSTURE UNCHANGED.** The current diff presents no new threat signature. Existing clearance remains in force.",
    }),
    "",
  ].join("\n");
  const fixturePath = path.join(__dirname, "review-output-examples.md");

  assert.equal(fs.readFileSync(fixturePath, "utf8"), examples);
});
