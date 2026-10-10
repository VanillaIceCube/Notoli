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

test("renders a structured major-upgrade brief without treating it as a finding", () => {
  assert.equal(
    renderReviewBody({
      personaName: "Obi-Wan Code-nobi",
      summary:
        "**Approved.** The update is ready for the normal gates to decide.",
      majorUpgradeBrief: {
        dependency: "react-router 6.30.4 → 7.18.1 (npm)",
        upgrade_story:
          "Dependabot found a new major version during its version scan; no security trigger is evidenced. The upstream router changed compatibility requirements and public behavior, and the application gains the maintained router line and its documented fixes.",
        repository_impact:
          "Routing is configured in `frontend/src/App.jsx`; the supplied evidence identifies no removed API usage.",
        recommendation:
          "The path is clear: merge after the normal required checks pass.",
        sources: [
          "https://github.com/remix-run/react-router/releases/tag/react-router%407.18.1",
        ],
      },
    }),
    [
      "## \ud83e\udded Obi-Wan Code-nobi",
      "",
      "**Approved.** The update is ready for the normal gates to decide.",
      "",
      "## Major upgrade brief",
      "",
      "- **Dependency:** react-router 6.30.4 → 7.18.1 (npm)",
      "- **Why this upgrade matters:** Dependabot found a new major version during its version scan; no security trigger is evidenced. The upstream router changed compatibility requirements and public behavior, and the application gains the maintained router line and its documented fixes.",
      "- **Repository impact:** Routing is configured in `frontend/src/App.jsx`; the supplied evidence identifies no removed API usage.",
      "- **Recommendation:** The path is clear: merge after the normal required checks pass.",
      "- **Sources:** https://github.com/remix-run/react-router/releases/tag/react-router%407.18.1",
    ].join("\n"),
  );
});

test("folds the legacy major-upgrade fields into the compact brief", () => {
  const body = renderReviewBody({
    personaName: "Obi-Wan Code-nobi",
    summary: "**Approved.** The upgrade is compatible.",
    majorUpgradeBrief: {
      dependency: "example 1.0.0 → 2.0.0 (npm)",
      upgrade_trigger: "Dependabot found the new major during its version scan.",
      why_major: "Upstream removed a deprecated API.",
      repository_exposure: "The repository does not call that API.",
      benefits: "The maintained release includes parser hardening.",
      recommendation: "Merge after the normal checks pass.",
      sources: ["https://example.com/releases/2.0.0"],
    },
  });

  assert.match(body, /Why this upgrade matters/);
  assert.match(body, /Dependabot found.*removed a deprecated API.*parser hardening/s);
  assert.match(body, /Repository impact.*does not call that API/s);
  assert.match(body, /Recommendation.*Merge after/s);
  assert.doesNotMatch(body, /Why this update appeared/);
});

test("fails visibly instead of publishing an incomplete required major-upgrade brief", async () => {
  const { createdReviews, github } = createGitHubMock();
  const { core, failures } = createCore();

  await publishAiReview({
    github,
    context: context(),
    core,
    personaName: "Obi-Wan Code-nobi",
    requireMajorUpgradeBrief: true,
    raw: JSON.stringify(
      review({
        major_upgrade_brief: {
          dependency: "example 1.0.0 → 2.0.0 (npm)",
        },
      }),
    ),
  });

  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /missing upgrade_story, repository_impact, recommendation, sources/,
  );
  assert.equal(createdReviews.length, 1);
  assert.match(createdReviews[0].body, /Review unavailable/);
});

test("publishes every compact major-upgrade field after normalization", async () => {
  const { createdReviews, github } = createGitHubMock();
  const { core, failures } = createCore();

  await publishAiReview({
    github,
    context: context(),
    core,
    personaName: "Obi-Wan Code-nobi",
    requireMajorUpgradeBrief: true,
    raw: JSON.stringify(
      review({
        summary:
          "**Approved.** The breaking change does not touch this deployment; the path is clear after one smoke test.",
        major_upgrade_brief: {
          dependency: "gunicorn 25.3.0 → 26.0.0 (pip)",
          upgrade_story:
            "Dependabot discovered the new major during its version scan; no security trigger is evidenced. Gunicorn removed the Eventlet worker, while the service gains stricter HTTP validation and request-smuggling hardening.",
          repository_impact:
            "`backend/Dockerfile` invokes the default synchronous worker, so no Eventlet migration is identified.",
          recommendation:
            "Merge after a production-container startup smoke test.",
          sources: ["https://github.com/benoitc/gunicorn/releases/tag/26.0.0"],
        },
      }),
    ),
  });

  assert.deepEqual(failures, []);
  assert.equal(createdReviews.length, 1);
  assert.match(createdReviews[0].body, /Why this upgrade matters/);
  assert.match(createdReviews[0].body, /Repository impact/);
  assert.match(createdReviews[0].body, /backend\/Dockerfile/);
  assert.match(createdReviews[0].body, /request-smuggling hardening/);
  assert.match(createdReviews[0].body, /gunicorn\/releases\/tag\/26\.0\.0/);
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

test("publishes new request changes and fails the required check", async () => {
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

  assert.deepEqual(failures, ["Lint Eastwood requested changes."]);
  assert.deepEqual(warnings, []);
  assert.equal(createdReviews.length, 1);
  assert.doesNotMatch(createdReviews[0].body, /no-new-func/);
  assert.deepEqual(createdReviews[0].comments, [
    { path: "src/example.js", line: 1, side: "RIGHT", body: inlineBody },
  ]);
});

test("keeps a repeated blocking verdict failed while preserving findings", async () => {
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
        unchanged: true,
        summary: "One publishing edge case remains.",
        comments: [
          { path: "src/example.js", line: 1, body: "Duplicate inline finding" },
          { path: "src/example.js", line: 99, body: "First new finding" },
          { path: "src/other.js", line: 120, body: "Second new finding" },
        ],
      }),
    ),
  });

  assert.deepEqual(failures, ["Obi-Wan Code-nobi requested changes."]);
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

test("keeps approval and comment verdict checks successful", async () => {
  for (const event of ["APPROVE", "COMMENT"]) {
    const { createdReviews, github } = createGitHubMock();
    const { core, failures } = createCore();

    await publishAiReview({
      github,
      context: context(),
      core,
      personaName: "RoboCop",
      raw: JSON.stringify(review({ event })),
    });

    assert.deepEqual(failures, []);
    assert.equal(createdReviews.length, 1);
    assert.equal(createdReviews[0].event, event);
  }
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

test("preserves a major-upgrade brief on an unchanged review", async () => {
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
        summary: "**Approved.** The earlier verdict remains sound.",
        major_upgrade_brief: {
          dependency: "react-router 6.30.4 → 7.18.1 (npm)",
          recommendation: "Merge after the required checks pass.",
        },
      }),
    ),
  });

  assert.match(createdReviews[0].body, /## Major upgrade brief/);
  assert.match(createdReviews[0].body, /react-router 6\.30\.4 → 7\.18\.1/);
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

test("reviewer identities explain truncated reviews before their checks fail", () => {
  const actionPath = path.resolve(__dirname, "../get-pr-diff/action.yml");
  const action = fs.readFileSync(actionPath, "utf8");
  assert.match(action, /default: "524288"/);
  assert.match(action, /:\(exclude\)\*\*\/package-lock\.json/);
  assert.match(action, /:\(exclude\)\*\*\/pnpm-lock\.yaml/);
  assert.match(action, /echo "max_bytes=\$MAX_BYTES"/);
  assert.match(action, /echo "truncated=\$TRUNCATED"/);
  assert.doesNotMatch(action, /exit 1/);

  const workflowRoot = path.resolve(__dirname, "../../workflows");
  for (const workflowName of [
    "review-code.yml",
    "review-build.yml",
    "review-security.yml",
  ]) {
    const workflow = fs.readFileSync(
      path.join(workflowRoot, workflowName),
      "utf8",
    );
    assert.doesNotMatch(workflow, /^\s+max_bytes:/m);
    assert.match(workflow, /steps\.pr-diff\.outputs\.max_bytes/);
    const publishIndex = workflow.indexOf("Publish incomplete");
    const failIndex = workflow.indexOf("Fail incomplete");

    assert.notEqual(publishIndex, -1);
    assert.ok(failIndex > publishIndex);
    assert.match(
      workflow.slice(publishIndex, failIndex),
      /uses: \.\/\.github\/actions\/publish-ai-review[\s\S]*?"event": "COMMENT"[\s\S]*?[Rr]eview incomplete|REVIEW INCOMPLETE/,
    );
    assert.match(
      workflow.slice(failIndex),
      /if: steps\.pr-diff\.outputs\.truncated == 'true'[\s\S]*?exit 1/,
    );
    assert.ok(
      workflow.match(/if: steps\.pr-diff\.outputs\.truncated != 'true'/g)
        ?.length >= 3,
    );
  }
});

test("OpenAI review requests reserve a bounded output budget", () => {
  const actionPath = path.resolve(__dirname, "../openai-chat/action.yml");
  const action = fs.readFileSync(actionPath, "utf8");

  assert.match(action, /max_output_tokens:[\s\S]*?default: "16000"/);
  assert.match(
    action,
    /MAX_OUTPUT_TOKENS: \$\{\{ inputs\.max_output_tokens \}\}/,
  );
  assert.match(action, /max_output_tokens: \$max_output_tokens/);
  assert.match(action, /enable_web_search:[\s\S]*?default: "false"/);
  assert.match(
    action,
    /ENABLE_WEB_SEARCH: \$\{\{ inputs\.enable_web_search \}\}/,
  );
  assert.match(action, /type: "web_search"/);
  assert.match(action, /search_context_size: "medium"/);
  assert.match(action, /tool_choice: "required"/);
});

test("Obi-Wan collects bounded external evidence for Dependabot major updates", () => {
  const workflowPath = path.resolve(
    __dirname,
    "../../workflows/review-code.yml",
  );
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /Collect upstream major-upgrade evidence/);
  assert.match(workflow, /version-update:semver-major/);
  assert.match(workflow, /collect-upstream-major-upgrade-evidence\.js/);
  assert.match(workflow, /collectUpstreamMajorUpgradeEvidence/);
  assert.match(workflow, /github\.rest\.repos\.getReleaseByTag/);
  assert.match(workflow, /upstream-major-upgrade-evidence\.json/);
  assert.match(workflow, /Repository dependency-usage evidence/);
  assert.match(workflow, /git grep -n -i -F/);
  assert.match(
    workflow,
    /enable_web_search: \$\{\{ steps\.dependabot-metadata\.outputs\.update-type == 'version-update:semver-major' \}\}/,
  );
  assert.match(workflow, /Do not merely summarize release-note headings/);
  assert.match(workflow, /"upgrade_story"/);
  assert.match(workflow, /"repository_impact"/);
  assert.match(workflow, /"recommendation"/);
  assert.match(workflow, /"sources"/);
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
        "**Approved.** The credential boundaries hold, the tests cover the risky paths, and the earlier concern is resolved. The course looks clear from here.",
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
        "**Changes requested.** Tests made it through, but lint caught one blocking warning in the new test code. Fix that holdout and send the build through again.",
    }),
    "",
    "---",
    "",
    "*Infrastructure-only security comment*",
    "",
    renderReviewBody({
      personaName: "RoboCop",
      summary:
        "**COMMENT. REVIEW INCOMPLETE. SECURITY VERDICT: WITHHELD.** CODEQL NEVER REPORTED FOR DUTY. Restore scanner evidence, then rerun the security assessment, citizen.",
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
        "**Changes requested.** Most of the publishing path is sound, but one edge case can still swallow a new finding. Bring that case into the light before proceeding.",
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
        "**APPROVED. THREAT LEVEL: MINIMAL. STATUS: UNCHANGED.** No new threat signature detected. MERGE AUTHORIZATION REMAINS GRANTED, CITIZEN.",
    }),
    "",
  ].join("\n");
  const fixturePath = path.join(__dirname, "review-output-examples.md");

  const fixture = fs.readFileSync(fixturePath, "utf8").replaceAll("\r\n", "\n");

  assert.equal(fixture, examples);
});
