"use strict";

function stripCodeFences(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

function normalize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hunkHeader(text) {
  return (
    String(text || "")
      .split(/\r?\n/)
      .find((line) => line.startsWith("@@")) || ""
  );
}

function reviewStateForEvent(reviewEvent) {
  return (
    {
      APPROVE: "APPROVED",
      REQUEST_CHANGES: "CHANGES_REQUESTED",
      COMMENT: "COMMENTED",
    }[reviewEvent] || reviewEvent
  );
}

const PERSONA_FORMATS = {
  "Obi-Wan Code-nobi": {
    icon: "🧭",
    findings: "🔎 Findings",
    evidence: "📚 Evidence reviewed",
    actions: "✅ Next step",
    verdicts: {
      APPROVE: "Approved.",
      REQUEST_CHANGES: "Changes requested.",
      COMMENT: "Comment.",
    },
    unchanged: {
      APPROVE:
        "Approved — the path remains clear. No new code-quality findings since the previous review.",
      REQUEST_CHANGES:
        "Changes requested — the concern remains. No materially new code-quality findings since the previous review.",
      COMMENT:
        "Comment — no change in course. No materially new code-quality observations since the previous review.",
    },
  },
  "Lint Eastwood": {
    icon: "🤠",
    findings: "🔧 Build findings",
    evidence: "🧾 Check evidence",
    actions: "🛠️ Fix",
    verdicts: {
      APPROVE: "Approved.",
      REQUEST_CHANGES: "Changes requested.",
      COMMENT: "Comment.",
    },
    unchanged: {
      APPROVE:
        "Approved — still clean. No new lint, test, build, or CI trouble since the previous review.",
      REQUEST_CHANGES:
        "Changes requested — the gate remains closed. No materially new build findings since the previous review.",
      COMMENT:
        "Comment — the evidence is unchanged. No materially new build observations since the previous review.",
    },
  },
  RoboCop: {
    icon: "🛡️",
    findings: "⚠️ Security findings",
    evidence: "📋 Evidence",
    actions: "▶️ Directive",
    verdicts: {
      APPROVE: "APPROVED.",
      REQUEST_CHANGES: "CHANGES REQUIRED.",
      COMMENT: "COMMENT.",
    },
    unchanged: {
      APPROVE:
        "APPROVED — STATUS UNCHANGED. No new security findings are supported by the current diff or gate evidence.",
      REQUEST_CHANGES:
        "CHANGES REQUIRED — STATUS UNCHANGED. The prior security finding remains unresolved; no materially new finding is supported.",
      COMMENT:
        "COMMENT — STATUS UNCHANGED. The prior security evidence remains incomplete; no materially new finding is supported.",
    },
  },
};

function personaFormat(personaName) {
  return (
    PERSONA_FORMATS[personaName] || {
      icon: "🤖",
      findings: "🔎 Findings",
      evidence: "📋 Evidence",
      actions: "✅ Next step",
      verdicts: {
        APPROVE: "Approved.",
        REQUEST_CHANGES: "Changes requested.",
        COMMENT: "Comment.",
      },
      unchanged: {
        APPROVE:
          "Approved — unchanged. No new findings since the previous review.",
        REQUEST_CHANGES:
          "Changes requested — unchanged. The prior finding remains unresolved.",
        COMMENT:
          "Comment — unchanged. No new observations since the previous review.",
      },
    }
  );
}

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanList(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compactText(value))
    .filter(Boolean);
}

function cleanFindings(values) {
  return (Array.isArray(values) ? values : [])
    .map((finding) => {
      if (typeof finding === "string") {
        return { body: compactText(finding), path: "", line: null };
      }
      const path = compactText(finding?.path).replace(/^b\//, "");
      const line = Number(finding?.line);
      return {
        body: compactText(finding?.body),
        path,
        line: Number.isInteger(line) && line > 0 ? line : null,
      };
    })
    .filter((finding) => finding.body);
}

function renderFinding(finding) {
  if (!finding.path) return `- ${finding.body}`;
  const target =
    finding.line == null ? finding.path : `${finding.path}:${finding.line}`;
  return `- \`${target.replace(/`/g, "")}\` — ${finding.body}`;
}

function renderReviewBody({
  personaName,
  event,
  summary,
  findings = [],
  evidence = [],
  actions = [],
}) {
  const format = personaFormat(personaName);
  const sections = [
    `## ${format.icon} ${personaName}`,
    "",
    `**${format.verdicts[event] || format.verdicts.COMMENT}** ${compactText(summary)}`,
  ];
  const renderedFindings = cleanFindings(findings);
  const renderedEvidence = cleanList(evidence);
  const renderedActions = cleanList(actions);

  if (renderedFindings.length > 0) {
    sections.push(
      "",
      `### ${format.findings}`,
      "",
      ...renderedFindings.map(renderFinding),
    );
  }
  if (renderedEvidence.length > 0) {
    sections.push(
      "",
      `### ${format.evidence}`,
      "",
      ...renderedEvidence.map((item) => `- ${item}`),
    );
  }
  if (renderedActions.length > 0) {
    sections.push(
      "",
      `### ${format.actions}`,
      "",
      ...renderedActions.map((item) => `- ${item}`),
    );
  }

  return sections.join("\n");
}

function renderUnchangedReview({ personaName, event }) {
  const format = personaFormat(personaName);
  return [
    `## ${format.icon} ${personaName}`,
    "",
    `**${format.unchanged[event] || format.unchanged.COMMENT}**`,
  ].join("\n");
}

function addedLinesByFile(files) {
  const valid = new Map();
  for (const file of files) {
    if (!file.patch) continue;
    let lineNumber;
    let currentHunk = "";
    for (const line of file.patch.split(/\r?\n/)) {
      const hunk = line.match(/^@@ .* \+(\d+)/);
      if (hunk) {
        lineNumber = Number(hunk[1]);
        currentHunk = line;
        continue;
      }
      if (lineNumber == null) continue;
      if (line.startsWith("+") && !line.startsWith("+++")) {
        if (!valid.has(file.filename)) valid.set(file.filename, new Map());
        valid.get(file.filename).set(lineNumber, currentHunk);
        lineNumber += 1;
      } else if (!line.startsWith("-")) {
        lineNumber += 1;
      }
    }
  }
  return valid;
}

function unavailableReviewMarker(personaName, headSha) {
  const persona = personaName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `<!-- notoli-ai-review-unavailable:${persona}:${headSha} -->`;
}

async function publishUnavailableReview({
  github,
  context,
  core,
  personaName,
  reason,
}) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pull = context.payload.pull_request;
  const pull_number = pull.number;
  const marker = unavailableReviewMarker(
    personaName,
    pull.head?.sha || context.sha || "unknown",
  );

  try {
    const priorReviews = await github.paginate(github.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number,
      per_page: 100,
    });
    if (!priorReviews.some((review) => review.body?.includes(marker))) {
      const format = personaFormat(personaName);
      await github.rest.pulls.createReview({
        owner,
        repo,
        pull_number,
        event: "COMMENT",
        body: [
          marker,
          `## ${format.icon} ${personaName}`,
          "",
          "**Review unavailable.** OpenAI could not produce a usable review for this commit.",
          "",
          "This is not an approval or a finding. Independent lint, test, CodeQL, vulnerability, and malware gates remain authoritative. Restore OpenAI access, then rerun this review.",
        ].join("\n"),
      });
    } else {
      core.warning(
        `${personaName} already posted an unavailable notice for this commit.`,
      );
    }
  } catch (error) {
    core.warning(
      `${personaName} could not publish its unavailable notice: ${error.message}`,
    );
  }

  core.setFailed(reason);
}

async function publishAiReview({
  github,
  context,
  core,
  raw,
  personaName = "AI reviewer",
}) {
  const reviewJson = String(raw || "").trim();
  if (
    !reviewJson ||
    reviewJson.startsWith("Missing secret") ||
    reviewJson.startsWith("OpenAI ")
  ) {
    await publishUnavailableReview({
      github,
      context,
      core,
      personaName,
      reason: reviewJson || `${personaName} did not return a review.`,
    });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(reviewJson));
  } catch (error) {
    await publishUnavailableReview({
      github,
      context,
      core,
      personaName,
      reason: `${personaName} returned invalid JSON: ${error.message}`,
    });
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    await publishUnavailableReview({
      github,
      context,
      core,
      personaName,
      reason: `${personaName} returned a review with an invalid structure.`,
    });
    return;
  }

  const events = new Set(["APPROVE", "REQUEST_CHANGES", "COMMENT"]);
  const event = events.has(parsed.event) ? parsed.event : "COMMENT";
  const summary = compactText(parsed.summary);
  if (!summary) {
    await publishUnavailableReview({
      github,
      context,
      core,
      personaName,
      reason: `${personaName} returned a review without a summary.`,
    });
    return;
  }
  const findings = cleanFindings(parsed.findings);
  const evidence = cleanList(parsed.evidence);
  const actions = cleanList(parsed.actions);
  let body = renderReviewBody({
    personaName,
    event,
    summary,
    findings,
    evidence,
    actions,
  });

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pull_number = context.payload.pull_request.number;
  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  const valid = addedLinesByFile(files);

  let botLogin = "";
  try {
    const app = await github.rest.apps.getAuthenticated();
    if (app.data?.slug) botLogin = `${app.data.slug}[bot]`;
  } catch (error) {
    core.warning(
      `Could not resolve authenticated GitHub App slug: ${error.message}`,
    );
  }

  const isOwnReviewItem = (item) => {
    const login = item.user?.login || "";
    if (botLogin) return login === botLogin;
    return login
      .toLowerCase()
      .includes(personaName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  };

  const priorReviews = await github.paginate(github.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  const priorReviewComments = await github.paginate(
    github.rest.pulls.listReviewComments,
    {
      owner,
      repo,
      pull_number,
      per_page: 100,
    },
  );
  const ownReviewIds = new Set(
    priorReviews.filter(isOwnReviewItem).map((review) => review.id),
  );
  const ownPriorReviews = priorReviews.filter(isOwnReviewItem);
  const ownPriorComments = priorReviewComments.filter(
    (comment) =>
      isOwnReviewItem(comment) ||
      ownReviewIds.has(comment.pull_request_review_id),
  );

  const priorCommentKeys = new Set();
  for (const comment of ownPriorComments) {
    priorCommentKeys.add(
      [
        comment.path,
        String(comment.line || comment.original_line || ""),
        normalize(comment.body),
        normalize(hunkHeader(comment.diff_hunk)),
      ].join("\u0000"),
    );
  }

  let malformed = 0;
  let suppressed = 0;
  const comments = [];
  const unplacedComments = [];
  for (const comment of Array.isArray(parsed.comments) ? parsed.comments : []) {
    const path = String(comment.path || "")
      .replace(/^b\//, "")
      .trim();
    const line = Number(comment.line);
    const validLine = Number.isInteger(line) && line > 0;
    const text = typeof comment.body === "string" ? comment.body.trim() : "";
    const currentHunk = validLine ? valid.get(path)?.get(line) : undefined;
    if (!path || !text || !currentHunk) {
      if (text) {
        unplacedComments.push({
          path: path || "unknown file",
          line: validLine ? line : null,
          body: text,
        });
      } else {
        malformed += 1;
      }
      continue;
    }

    const duplicateKey = [
      path,
      String(line),
      normalize(text),
      normalize(currentHunk),
    ].join("\u0000");
    if (priorCommentKeys.has(duplicateKey)) {
      suppressed += 1;
      continue;
    }
    comments.push({ path, line, side: "RIGHT", body: text });
  }

  const latestOwnReview = ownPriorReviews
    .filter((review) => review.submitted_at)
    .sort(
      (left, right) =>
        new Date(right.submitted_at) - new Date(left.submitted_at),
    )[0];
  const repeatedBody =
    latestOwnReview && normalize(latestOwnReview.body) === normalize(body);
  const decisionUnchanged =
    latestOwnReview && latestOwnReview.state === reviewStateForEvent(event);
  const declaredUnchanged = parsed.unchanged === true && decisionUnchanged;
  if (
    (declaredUnchanged || suppressed > 0 || repeatedBody) &&
    comments.length === 0 &&
    unplacedComments.length === 0 &&
    decisionUnchanged
  ) {
    body = renderUnchangedReview({ personaName, event });
  } else {
    if (unplacedComments.length > 0) {
      body = renderReviewBody({
        personaName,
        event,
        summary,
        findings: [...findings, ...unplacedComments],
        evidence,
        actions,
      });
    }
    if (suppressed > 0 && typeof core.info === "function") {
      core.info(
        `${suppressed} duplicate ${personaName} inline comment(s) were suppressed.`,
      );
    }
    if (unplacedComments.length > 0 && typeof core.info === "function") {
      core.info(
        `${unplacedComments.length} ${personaName} finding(s) were moved into the review body.`,
      );
    }
    if (malformed > 0) {
      core.warning(
        `${malformed} malformed ${personaName} inline comment(s) were omitted.`,
      );
    }
  }

  await github.rest.pulls.createReview({
    owner,
    repo,
    pull_number,
    event,
    body,
    comments: comments.length ? comments : undefined,
  });
}

module.exports = {
  publishAiReview,
  renderReviewBody,
  renderUnchangedReview,
  unavailableReviewMarker,
};
