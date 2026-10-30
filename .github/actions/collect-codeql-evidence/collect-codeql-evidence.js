"use strict";

const LANGUAGE_DEFINITIONS = {
  python: {
    analyzerName: "Analyze Python",
    category: "/language:python",
    baselineLanguages: ["python"],
  },
  javascript: {
    analyzerName: "Analyze JavaScript/TypeScript",
    category: "/language:javascript-typescript",
    baselineLanguages: ["javascript", "javascript-typescript"],
  },
  actions: {
    analyzerName: "Analyze GitHub Actions",
    category: "/language:actions",
    baselineLanguages: ["actions"],
  },
};

function isTrue(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function findAnalyzerCheck(checkRuns, analyzerName) {
  return checkRuns.filter((check) =>
    String(check.name || "")
      .toLowerCase()
      .endsWith(analyzerName.toLowerCase()),
  ).sort((left, right) => Number(right.id) - Number(left.id))[0];
}

function hasDefaultBranchBaseline(analyses, definition) {
  return analyses.some((analysis) => {
    const category = String(analysis.category || "").toLowerCase();
    const language = String(analysis.language || "").toLowerCase();
    const categoryMatches =
      category === definition.category ||
      definition.baselineLanguages.includes(language);
    // GitHub's analyses endpoint currently exposes completed SARIF records via
    // commit/created/error fields, not status/conclusion. Honor lifecycle fields
    // defensively if GitHub or another compatible provider supplies them.
    const statusCompleted =
      analysis.status === undefined || analysis.status === "completed";
    const conclusionSuccessful =
      analysis.conclusion === undefined || analysis.conclusion === "success";
    const analysisCompleted = Boolean(
      analysis.commit_sha &&
      analysis.created_at &&
      Object.hasOwn(analysis, "error") &&
      analysis.error === "" &&
      statusCompleted &&
      conclusionSuccessful,
    );
    return categoryMatches && analysisCompleted;
  });
}

function isSyntheticCodeqlSummary(check) {
  const name = String(check.name || "");
  return (
    check.conclusion === "neutral" &&
    /codeql$/i.test(name) &&
    !/analyze|detect codeql scope/i.test(name)
  );
}

function collectCodeqlEvidence({
  upstreamResult,
  scopeStatus,
  scope = {},
  checkRuns = [],
  defaultBranch,
  defaultBranchAnalyses = [],
  baselineQueryError = "",
}) {
  const normalizedUpstreamResult = String(upstreamResult || "unknown");
  const normalizedScopeStatus = String(scopeStatus || "unknown");
  const blockingReasons = [];
  const languages = {};

  if (normalizedUpstreamResult !== "success") {
    blockingReasons.push(
      `The aggregate CodeQL gate concluded ${normalizedUpstreamResult}.`,
    );
  }
  if (normalizedScopeStatus !== "success") {
    blockingReasons.push(
      `The CodeQL scope detector concluded ${normalizedScopeStatus}.`,
    );
  }

  for (const [language, definition] of Object.entries(LANGUAGE_DEFINITIONS)) {
    const rawScopeValue = scope[language];
    const scopeValueKnown =
      rawScopeValue === true ||
      rawScopeValue === false ||
      ["true", "false"].includes(String(rawScopeValue).toLowerCase());
    const requiredForPullRequest = isTrue(rawScopeValue);
    const analyzerCheck = findAnalyzerCheck(checkRuns, definition.analyzerName);
    const baselinePresent = hasDefaultBranchBaseline(
      defaultBranchAnalyses,
      definition,
    );
    let status;
    let reason;

    if (normalizedScopeStatus !== "success") {
      status = "evidence_gap";
      reason = "Scope detection did not complete successfully.";
    } else if (!scopeValueKnown) {
      status = "evidence_gap";
      reason =
        "The scope detector did not report a true or false result for this analyzer.";
    } else if (requiredForPullRequest) {
      if (analyzerCheck?.conclusion === "success") {
        status = "analyzed";
        reason =
          "The path-aware scope detector required this analyzer and it succeeded.";
      } else {
        status = "evidence_gap";
        reason = analyzerCheck
          ? `The required analyzer concluded ${analyzerCheck.conclusion || analyzerCheck.status || "unknown"}.`
          : "The required analyzer check was not found.";
      }
    } else if (analyzerCheck && !["success", "skipped"].includes(analyzerCheck.conclusion)) {
      status = "evidence_gap";
      reason = "An out-of-scope analyzer ran but did not complete successfully.";
    } else if (baselineQueryError) {
      status = "evidence_gap";
      reason = `The analyzer was intentionally omitted, but the default-branch baseline could not be verified: ${String(baselineQueryError).slice(0, 500)}`;
    } else if (baselinePresent) {
      status = "expected_skip";
      reason =
        "The path-aware scope detector omitted this analyzer because no matching files changed, and its default-branch baseline exists.";
    } else {
      status = "evidence_gap";
      reason =
        "The analyzer was omitted from this pull request and no matching default-branch baseline analysis was found.";
    }

    if (status === "evidence_gap") {
      blockingReasons.push(`${definition.analyzerName}: ${reason}`);
    }

    languages[language] = {
      category: definition.category,
      required_for_pull_request: requiredForPullRequest,
      scope_value_known: scopeValueKnown,
      analyzer_conclusion: analyzerCheck?.conclusion || null,
      default_branch_baseline_present: baselinePresent,
      status,
      reason,
    };
  }

  const syntheticCodeqlSummaries = checkRuns
    .filter(isSyntheticCodeqlSummary)
    .slice(0, 10)
    .map((check) => ({
      id: check.id,
      name: check.name,
      conclusion: check.conclusion,
      output: String(check.output?.summary || "").slice(0, 1000),
      interpretation:
        blockingReasons.length === 0
          ? "informational_expected_scope_omission"
          : "informational_but_not_authoritative_over_evidence_gaps",
    }));

  return {
    authoritative: true,
    aggregate_gate_result: normalizedUpstreamResult,
    scope_detector_result: normalizedScopeStatus,
    default_branch: defaultBranch || "unknown",
    baseline_query: baselineQueryError ? "failed" : "succeeded",
    approval_eligible: blockingReasons.length === 0,
    interpretation: blockingReasons.length === 0 ? "complete" : "evidence_gap",
    languages,
    blocking_reasons: blockingReasons,
    synthetic_codeql_summaries: syntheticCodeqlSummaries,
    policy:
      "A neutral synthetic summary is informational when it reports a category intentionally omitted by successful path-aware scope detection and that category has a default-branch baseline. It does not override the successful scope and aggregate gates.",
  };
}

module.exports = {
  LANGUAGE_DEFINITIONS,
  collectCodeqlEvidence,
  findAnalyzerCheck,
  hasDefaultBranchBaseline,
  isSyntheticCodeqlSummary,
};
