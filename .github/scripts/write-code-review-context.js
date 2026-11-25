"use strict";

const { constants } = require("node:buffer");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const env = process.env;
const totalBudget = 180_000;
const fileBudget = 30_000;
const usageBudget = 30_000;

function git(...args) {
  return execFileSync("git", args, { maxBuffer: constants.MAX_LENGTH });
}

function readPrefix(file, length) {
  const prefix = Buffer.alloc(length);
  const fd = fs.openSync(file, "r");
  try {
    const count = fs.readSync(fd, prefix, 0, length, 0);
    return prefix.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}

function isText(prefix, truncated) {
  if (prefix.includes(0) || !prefix.some(byte => byte !== 10 && byte !== 13)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(prefix, { stream: truncated });
    return true;
  } catch {
    return false;
  }
}

function appendChangedFiles(write) {
  const revisions = ["--end-of-options", env.BASE_SHA, env.HEAD_SHA, "--"];
  write("=== REPOSITORY FILE MAP ===\n");
  const fileMap = git("ls-files").toString("utf8").replace(/\n$/, "");
  if (fileMap) write(fileMap.split("\n").map(line => `- ${line}\n`).join(""));
  write("\n=== CHANGED FILES ===\n");
  write(git("diff", "--name-status", ...revisions));
  write("\n=== CURRENT CONTENTS OF CHANGED TEXT FILES ===\n");

  // Git delimits raw path names with NUL. Retain their original bytes for filesystem calls.
  const names = git("diff", "--name-only", "-z", "--diff-filter=ACMRT", ...revisions);
  const workspace = fs.realpathSync(".");
  let total = 0;
  let start = 0;
  while (start < names.length) {
    const end = names.indexOf(0, start);
    if (end === -1) throw new Error("Incomplete changed-file list from Git");
    const file = names.subarray(start, end);
    start = end + 1;

    const heading = `\n--- ${file} ---\n`;
    if (env.EXCLUDED_FILES && file.equals(Buffer.from(env.EXCLUDED_FILES))) {
      write(`${heading}[generated lockfile payload excluded; see AI REVIEW SCOPE]\n`);
      continue;
    }
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile()) continue;
    const relative = path.relative(workspace, fs.realpathSync.native(file));
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) continue;

    write(heading);
    const limit = Math.min(fileBudget, totalBudget - total);
    const prefix = readPrefix(file, Math.min(stat.size, Math.max(8192, limit)));
    if (!isText(prefix, prefix.length < stat.size)) {
      write("[binary or non-text file omitted]\n");
      continue;
    }
    if (!limit) {
      write("[omitted: changed-file context byte budget reached]\n");
      continue;
    }
    const payload = prefix.subarray(0, limit);
    write(payload);
    total += payload.length;
    if (payload.length < stat.size) {
      write(`\n[truncated: ${stat.size} bytes total, showed ${payload.length} bytes]\n`);
    }
  }
  write(`\nChanged-file context bytes included: ${total} / ${totalBudget}\n`);
}

function appendMajorUpgrade(write) {
  write(`\n=== DEPENDABOT MAJOR UPGRADE EVIDENCE ===\ndependency-names: ${env.DEPENDABOT_DEPENDENCY_NAMES}\n`);
  write("\n--- Externally collected upstream release evidence ---\n");
  write(fs.readFileSync(env.UPSTREAM_EVIDENCE_PATH));
  write("\n--- Repository dependency-usage evidence (tracked text, lockfiles excluded, max 30000 bytes) ---\n");

  const usageFile = path.join(env.RUNNER_TEMP, "dependency-usage-evidence.txt");
  const excluded = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "uv.lock"]
    .map(name => `:(exclude,glob)**/${name}`);
  const fd = fs.openSync(usageFile, "w");
  try {
    for (const name of env.DEPENDABOT_DEPENDENCY_NAMES.split(",").map(value => value.trim()).filter(Boolean)) {
      fs.writeFileSync(fd, `--- exact matches for ${name} ---\n`);
      const result = spawnSync("git", ["grep", "-I", "-n", "-i", "-F", "-e", name, "--", ".", ...excluded], {
        stdio: ["ignore", fd, "inherit"],
      });
      if (result.error) throw result.error;
      if (result.status === 1) fs.writeFileSync(fd, "[no exact tracked-text matches]\n");
      else if (result.status !== 0) throw new Error(`git grep failed (${result.signal || result.status})`);
    }
  } finally {
    fs.closeSync(fd);
  }
  const size = fs.statSync(usageFile).size;
  write(readPrefix(usageFile, Math.min(size, usageBudget)));
  if (size > usageBudget) write(`\n[truncated: dependency-usage evidence was ${size} bytes]\n`);

  write("\n--- Dependabot pull-request description (untrusted upstream evidence, max 12000 characters) ---\n");
  const characters = Array.from(env.PR_BODY);
  write(`${characters.slice(0, 12_000).join("")}\n`);
  if (characters.length > 12_000) write("[truncated: Dependabot pull-request description exceeded 12000 characters]\n");
}

const context = fs.openSync(env.CONTEXT_PATH, "w");
const write = content => fs.writeFileSync(context, content);
try {
  appendChangedFiles(write);
  const apiEvidence = path.join(env.RUNNER_TEMP, "auto-merge-api-evidence.json");
  if (fs.existsSync(apiEvidence)) {
    write("\n=== LIVE GITHUB API CONTRACT EVIDENCE (READ-ONLY WORKFLOW TOKEN) ===\n");
    write(fs.readFileSync(apiEvidence));
  }
  if (env.DEPENDABOT_UPDATE_TYPE === "version-update:semver-major") appendMajorUpgrade(write);
  write("\n=== PRIOR OBI-WAN CODE-NOBI REVIEWS ===\n");
  write(fs.readFileSync(env.PRIOR_REVIEWS_PATH));
  write("\n=== LINE-NUMBERED PULL REQUEST DIFF ===\n");
  write(fs.readFileSync(env.DIFF_PATH));
} finally {
  fs.closeSync(context);
}
