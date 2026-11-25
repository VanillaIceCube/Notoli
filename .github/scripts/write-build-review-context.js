"use strict";

const fs = require("node:fs");

function input(name) {
  const value = process.env[name];
  if (value === undefined) throw new Error(`Missing ${name}`);
  return value;
}

const lines = [
  "=== BUILD, LINT, AND TEST EVIDENCE ===",
  `lint_result: ${input("LINT_RESULT")}`,
  `test_result: ${input("TEST_RESULT")}`,
];
const sections = { ...JSON.parse(input("LINT_EVIDENCE")), ...JSON.parse(input("TEST_EVIDENCE")) };
for (const [key, status] of Object.entries(sections)) {
  if (!key.endsWith("_status")) continue;
  const name = key.slice(0, -"_status".length);
  const log = sections[name + "_log"];
  if (typeof log !== "string") throw new Error("Missing diagnostic log for " + name);
  lines.push(`${key}: ${status || "not-applicable"}`, "", `--- ${name}_log ---`, log);
}
lines.push(
  "", "=== PRIOR LINT EASTWOOD REVIEWS ===", fs.readFileSync(input("PRIOR_REVIEWS_PATH"), "utf8"),
  "=== LINE-NUMBERED PULL REQUEST DIFF ===", fs.readFileSync(input("DIFF_PATH"), "utf8"),
);
fs.writeFileSync(input("CONTEXT_PATH"), lines.join("\n"));
