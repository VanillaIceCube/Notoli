const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { pipeline } = require("node:stream/promises");
const { execFileSync } = require("node:child_process");

const lockfile = "frontend/package-lock.json";

function writeGitDiff(args, destination) {
  const fd = fs.openSync(destination, "w");
  try {
    execFileSync("git", ["diff", "--no-ext-diff", "--no-textconv", "--unified=3", ...args],
      { stdio: ["ignore", fd, "inherit"] });
  } finally {
    fs.closeSync(fd);
  }
}

function reviewScope(fullBytes, excluded, empty) {
  const lines = [
    "AI REVIEW SCOPE",
    `Full diff bytes: ${fullBytes}`,
    `Generated lockfile payloads excluded: ${JSON.stringify(excluded ? [excluded] : [])}`,
  ];
  if (excluded) lines.push(
    "Excluded payloads have NOT been inspected by this AI source review. " +
    "Dependency Review and dependency malware review remain independent required gates."
  );
  if (empty) lines.push(
    "No source diff remains (lockfile-only or empty change). " +
    "Do not infer dependency safety from an empty source diff; " +
    "use the independent scanner evidence for dependency conclusions."
  );
  lines.push("DIFF LEGEND: A<number> is ADDED current RIGHT-side source; " +
    "R<number> is unchanged current context; D is DELETED old source, not active code.");
  return lines.join("\n") + "\n\n";
}

async function* numberLines(diff, scope) {
  yield scope;
  const lines = readline.createInterface({ input: fs.createReadStream(diff), crlfDelay: Infinity });
  let rightLine;
  for await (const raw of lines) {
    let line = raw;
    if (line.startsWith("diff --git ")) {
      rightLine = undefined;
    } else if (line.startsWith("@@ ")) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      rightLine = hunk ? Number(hunk[1]) : undefined;
    } else if (rightLine !== undefined) {
      if (line.startsWith("+")) line = `A${rightLine++}: ${line.slice(1)}`;
      else if (line.startsWith(" ")) line = `R${rightLine++}: ${line.slice(1)}`;
      else if (line.startsWith("-")) line = `D: ${line.slice(1)}`;
    }
    yield line + "\n";
  }
}

async function main(env) {
  const refs = [env.BASE_SHA, env.HEAD_SHA];
  const maxBytes = Number(env.MAX_BYTES);
  if (!refs.every(ref => /^[a-f0-9]{40}$/.test(ref))) throw new Error("Expected full base and head commit SHAs.");
  if (!/^[1-9]\d*$/.test(env.MAX_BYTES) || !Number.isSafeInteger(maxBytes)) throw new Error("Invalid diff byte budget.");
  if (!["true", "false"].includes(env.OMIT_FRONTEND_NPM_LOCKFILE)) throw new Error("Invalid lockfile exclusion setting.");

  const dir = fs.mkdtempSync(path.join(env.RUNNER_TEMP, "pr-diff."));
  const full = path.join(dir, "pr_full.diff");
  const diff = path.join(dir, "pr.diff");
  const numbered = path.join(dir, "pr_lines.diff");
  console.log(`Base: ${refs[0]}\nHead: ${refs[1]}`);
  writeGitDiff(refs, full);

  // Only omit the generated lockfile if both trees contain a regular 100644 file or no entry.
  const omit = env.OMIT_FRONTEND_NPM_LOCKFILE === "true" && refs.every(ref => {
    const entry = execFileSync("git", ["ls-tree", ref, "--", lockfile], { encoding: "utf8" });
    return !entry || entry.startsWith("100644 ");
  });
  let excluded = "";
  if (omit) {
    writeGitDiff([...refs, "--", ".", `:(exclude,top)${lockfile}`], diff);
    excluded = execFileSync("git", ["diff", "--name-only", ...refs, "--", lockfile], { encoding: "utf8" }).trim();
  } else {
    fs.copyFileSync(full, diff);
  }

  const actualBytes = fs.statSync(diff).size;
  const truncated = actualBytes > maxBytes;
  if (truncated) {
    fs.truncateSync(diff, maxBytes);
    console.log(`::warning::Diff was too large (${actualBytes} bytes). Truncated to ${maxBytes} bytes.`);
  }
  console.log(`Diff size: ${Math.min(actualBytes, maxBytes)} bytes`);
  const scope = reviewScope(fs.statSync(full).size, excluded, actualBytes === 0);
  await pipeline(numberLines(diff, scope), fs.createWriteStream(numbered));
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, scope);
  fs.appendFileSync(env.GITHUB_OUTPUT, [
    `linediff_path=${numbered}`, `diff_bytes=${actualBytes}`, `excluded_files=${excluded}`,
    `max_bytes=${maxBytes}`, `truncated=${truncated}`, "",
  ].join("\n"));
}

main(process.env).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
