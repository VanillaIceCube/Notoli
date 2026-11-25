"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const testDir = path.resolve(__dirname, "../tests");
const tests = fs.readdirSync(testDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
  .map((entry) => path.join(testDir, entry.name))
  .sort();
if (!tests.length) throw new Error(`No .test.js automation tests found in ${testDir}`);

const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.signal) console.error(`Automation tests stopped by ${result.signal}`);
process.exitCode = result.status ?? 1;
