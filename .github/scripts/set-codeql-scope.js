"use strict";

const fs = require("node:fs");
const { EVENT_NAME, PYTHON_SCOPE, JAVASCRIPT_SCOPE, ACTIONS_SCOPE, GITHUB_OUTPUT } = process.env;
let python = "true";
let javascript = "true";
let actions = "true";
if (EVENT_NAME === "pull_request") {
  if (![PYTHON_SCOPE, JAVASCRIPT_SCOPE, ACTIONS_SCOPE].every(value => ["true", "false"].includes(value))) {
    throw new Error("CodeQL scope output is missing or invalid");
  }
  python = PYTHON_SCOPE;
  javascript = JAVASCRIPT_SCOPE;
  // A relevant PR needs the Actions configuration for comparison with its base branch.
  actions = python === "true" || javascript === "true" ? "true" : ACTIONS_SCOPE;
}
fs.appendFileSync(GITHUB_OUTPUT, `scope_status=success\npython=${python}\njavascript=${javascript}\nactions=${actions}\n`);
