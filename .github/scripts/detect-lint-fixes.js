"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const changedFiles = process.env.AUTOFIX_ENABLED === "true"
  ? execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" })
  : "";
process.stdout.write(changedFiles);
fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changedFiles.length > 0}\n`);
