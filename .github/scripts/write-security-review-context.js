"use strict";

const fs = require("node:fs");
const { CONTEXT_PATH, EVIDENCE_PATH, PRIOR_REVIEWS_PATH, DIFF_PATH } = process.env;
const context = [
  "=== SECURITY EVIDENCE ===",
  fs.readFileSync(EVIDENCE_PATH, "utf8"),
  "=== PRIOR ROBOCOP REVIEWS ===",
  fs.readFileSync(PRIOR_REVIEWS_PATH, "utf8"),
  "=== LINE-NUMBERED PULL REQUEST DIFF ===",
  fs.readFileSync(DIFF_PATH, "utf8"),
];
fs.writeFileSync(CONTEXT_PATH, context.join("\n"));
