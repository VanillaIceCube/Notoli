"use strict";

const fs = require("node:fs");
const sections = process.argv.slice(2);

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
for (const section of sections) {
  lines.push(`${section.toLowerCase()}_status: ${input(`${section}_STATUS`)}`);
}
for (const section of sections) {
  lines.push("", `--- ${section.toLowerCase()}_log ---`, input(`${section}_LOG`));
}
lines.push(
  "", "=== PRIOR LINT EASTWOOD REVIEWS ===", fs.readFileSync(input("PRIOR_REVIEWS_PATH"), "utf8"),
  "=== LINE-NUMBERED PULL REQUEST DIFF ===", fs.readFileSync(input("DIFF_PATH"), "utf8"),
);
fs.writeFileSync(input("CONTEXT_PATH"), lines.join("\n"));
