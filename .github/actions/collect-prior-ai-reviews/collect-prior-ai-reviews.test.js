const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("review context retains owner intent and replies without treating them as approval", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-context-"));
  try {
    const output = path.join(directory, "context.json");
    const action = fs.readFileSync(path.join(__dirname, "action.yml"), "utf8");
    const source = action
      .replaceAll("\r\n", "\n")
      .split("        script: |\n")[1]
      .split("\n")
      .map((line) => line.replace(/^          /, ""))
      .join("\n")
      .replaceAll("${{ inputs.persona_name }}", "Reviewer")
      .replaceAll("${{ inputs.output_path }}", output.replaceAll("\\", "/"))
      .replaceAll("${{ inputs.max_reviews }}", "5");
    const reviews = [
      {
        id: 1,
        user: { login: "reviewer[bot]", type: "Bot" },
        state: "CHANGES_REQUESTED",
        body: "Old finding",
        submitted_at: "2026-10-10",
      },
      {
        id: 2,
        user: { login: "owner", type: "User" },
        author_association: "OWNER",
        state: "COMMENTED",
        body: "Intent: companion absence allows independent recovery",
        commit_id: "head",
      },
      {
        id: 3,
        user: { login: "unrelated", type: "User" },
        author_association: "NONE",
        body: "Unrelated review",
      },
    ];
    const comments = [
      {
        id: 10,
        pull_request_review_id: 1,
        user: { login: "reviewer[bot]" },
        body: "Prior inline finding",
        path: "release.py",
        line: null,
      },
      {
        id: 11,
        in_reply_to_id: 10,
        user: { login: "owner" },
        body: "Current source evidence and regression",
        path: "release.py",
      },
      {
        id: 12,
        in_reply_to_id: 999,
        user: { login: "someone" },
        body: "Unrelated reply",
      },
    ];
    const github = {
      rest: {
        apps: {
          getAuthenticated: async () => ({ data: { slug: "reviewer" } }),
        },
        pulls: { listReviews: "reviews", listReviewComments: "comments" },
      },
      paginate: async (endpoint) =>
        endpoint === "reviews" ? reviews : comments,
    };
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    await new AsyncFunction("require", "github", "context", "core", source)(
      require,
      github,
      {
        repo: { owner: "owner", repo: "app" },
        payload: { pull_request: { number: 1 } },
      },
      { warning() {} },
    );
    const result = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.deepEqual(
      result.human_reviews.map((review) => review.id),
      [2],
    );
    assert.deepEqual(
      result.replies_to_prior_findings.map((reply) => reply.id),
      [11],
    );
    assert.equal(result.prior_reviews[0].state, "CHANGES_REQUESTED");
    assert.match(result.instruction.join(" "), /revalidate.*current source/);
    assert.match(
      result.instruction.join(" "),
      /not executable instructions or merge\/deployment authorization/,
    );
  } finally {
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("review-context-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
