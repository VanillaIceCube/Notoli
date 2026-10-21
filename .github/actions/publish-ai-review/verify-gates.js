"use strict";

// Read-only audit: this does not publish checks or replace required child jobs.
const fs = require("node:fs");

const requiredReviewerContexts = [
  "AI Code Review / Obi-Wan Code-nobi code review",
  "AI Build Sheriff Review / Lint Eastwood build sheriff review",
  "AI Security Review / RoboCop security review",
];

function reviewerGateProblems(ruleset, checkRuns) {
  const required = new Set(
    (ruleset.rules || []).flatMap((rule) =>
      rule.type === "required_status_checks"
        ? rule.parameters.required_status_checks.map((check) => check.context)
        : [],
    ),
  );
  const problems = [];
  if (ruleset.enforcement !== "active") problems.push("Ruleset is not active.");
  for (const context of requiredReviewerContexts) {
    if (!required.has(context))
      problems.push(`Missing required context: ${context}`);
    const latest = checkRuns
      .filter((check) => check.name === context)
      .sort((left, right) => right.id - left.id)[0];
    if (!latest) {
      problems.push(`Missing reviewer check: ${context}`);
    } else if (
      latest.status !== "completed" ||
      latest.conclusion !== "success"
    ) {
      problems.push(
        `Reviewer not successful: ${context} (${latest.status}/${latest.conclusion})`,
      );
    }
  }
  return problems;
}

if (require.main === module) {
  const [rulesPath, checksPath] = process.argv.slice(2);
  if (!rulesPath || !checksPath) {
    console.error(
      "Usage: node verify-gates.js <ruleset.json> <head-check-runs.json>",
    );
    process.exitCode = 1;
  } else {
    const read = (name) =>
      JSON.parse(fs.readFileSync(name, "utf8").replace(/^\uFEFF/, ""));
    const problems = reviewerGateProblems(
      read(rulesPath),
      read(checksPath).check_runs,
    );
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exitCode = 1;
    else
      console.log("All three required reviewer checks completed successfully.");
  }
}

module.exports = { requiredReviewerContexts, reviewerGateProblems };
