"use strict";

const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const OUTPUT_NAMES = [
  "frontend",
  "backend",
  "automation",
  "python",
  "javascript",
  "actions",
];

function startsWithAny(path, prefixes) {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function scopesForFiles(profile, files) {
  const normalizedFiles = files
    .filter((file) => typeof file === "string" && file.trim())
    .map((file) => file.trim().replaceAll("\\", "/"));
  const scopes = Object.fromEntries(
    OUTPUT_NAMES.map((outputName) => [outputName, false]),
  );

  if (profile === "lint") {
    const shared = [
      ".github/actions/read-versions/",
      ".github/actions/prepare-lint-commit/",
    ];
    scopes.frontend = normalizedFiles.some(
      (path) => path.startsWith("frontend/") || startsWithAny(path, shared),
    );
    scopes.backend = normalizedFiles.some(
      (path) => path.startsWith("backend/") || startsWithAny(path, shared),
    );
  } else if (profile === "test") {
    scopes.frontend = normalizedFiles.some(
      (path) =>
        path.startsWith("frontend/") ||
        path.startsWith(".github/actions/read-versions/"),
    );
    scopes.backend = normalizedFiles.some(
      (path) =>
        path.startsWith("backend/") ||
        path.startsWith(".github/actions/read-versions/"),
    );
    scopes.automation = normalizedFiles.some((path) =>
      startsWithAny(path, [
        ".github/actions/path-filter-fallback/",
        ".github/actions/publish-ai-review/",
        ".github/actions/security-alerts/",
      ]),
    );
  } else if (profile === "codeql") {
    const automationPath = (path) =>
      startsWithAny(path, [
        ".github/actions/",
        ".github/workflows/",
        ".github/codeql/",
      ]);
    scopes.python = normalizedFiles.some(
      (path) => path.startsWith("backend/") || automationPath(path),
    );
    scopes.javascript = normalizedFiles.some(
      (path) => path.startsWith("frontend/") || automationPath(path),
    );
    scopes.actions = normalizedFiles.some(automationPath);
  } else {
    throw new Error(`Unsupported path-filter fallback profile: ${profile}`);
  }

  return scopes;
}

function conservativeScopes(profile) {
  if (profile === "lint") {
    return { frontend: true, backend: true };
  }
  if (profile === "test") {
    return { frontend: true, backend: true, automation: true };
  }
  if (profile === "codeql") {
    return { python: true, javascript: true, actions: true };
  }
  throw new Error(`Unsupported path-filter fallback profile: ${profile}`);
}

function writeOutputs(scopes) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error("GITHUB_OUTPUT is required.");
  const lines = OUTPUT_NAMES.map(
    (name) => `${name}=${String(Boolean(scopes[name]))}`,
  );
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

function appendSummary(message, files, scopes) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const enabledScopes = Object.entries(scopes)
    .filter(([, enabled]) => enabled)
    .map(([name]) => `\`${name}\``)
    .join(", ");
  fs.appendFileSync(
    summaryPath,
    [
      "### Path-filter fallback",
      "",
      message,
      "",
      `Changed files evaluated: ${files.length}`,
      `Enabled scopes: ${enabledScopes || "_none_"}`,
      "",
    ].join("\n"),
  );
}

function run() {
  const profile = process.env.PATH_FILTER_PROFILE;
  const baseSha = process.env.PATH_FILTER_BASE_SHA;
  const headSha = process.env.PATH_FILTER_HEAD_SHA;
  let files = [];
  let scopes;
  let message;

  try {
    if (!baseSha || !headSha) {
      throw new Error("pull-request base or head SHA was unavailable");
    }
    const output = execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        "--diff-filter=ACMRTUXB",
        `${baseSha}...${headSha}`,
      ],
      { encoding: "utf8" },
    );
    files = output.split(/\r?\n/).filter(Boolean);
    scopes = scopesForFiles(profile, files);
    message =
      "The API-backed path filter failed, so CI scope was resolved from the local git diff.";
    process.stdout.write(
      `::warning title=Path-filter API fallback::${message}\n`,
    );
  } catch (error) {
    scopes = conservativeScopes(profile);
    message =
      "Both API-backed and local git-diff path detection were unavailable. Every scope for this gate will run to avoid skipping validation.";
    process.stdout.write(
      `::warning title=Conservative path-filter fallback::${message} ${error.message}\n`,
    );
  }

  writeOutputs(scopes);
  appendSummary(message, files, scopes);
}

if (require.main === module) run();

module.exports = {
  conservativeScopes,
  scopesForFiles,
};
