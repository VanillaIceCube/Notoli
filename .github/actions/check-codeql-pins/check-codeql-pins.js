"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function checkCodeqlPins(sources) {
  const parsed = spawnSync(process.platform === "win32" ? "python" : "python3",
    [path.join(__dirname, "parse-yaml.py")], {
      input: JSON.stringify(sources), encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONUTF8: "1" },
    });
  if (parsed.error || parsed.status !== 0) {
    throw new Error(`Unable to parse workflow YAML: ${parsed.error?.message || parsed.stderr}`);
  }
  const pins = [];
  for (const [file, references] of Object.entries(JSON.parse(parsed.stdout))) {
    for (const reference of references) {
      if (!/^github\/codeql-action\//i.test(reference)) continue;
      const [entry, revision, extra] = reference.slice("github/codeql-action/".length).split("@");
      if (extra !== undefined || revision?.length !== 40 || !/^[a-f0-9]{40}$/.test(revision)) {
        throw new Error(`${file}: CodeQL ${entry} requires an immutable SHA`);
      }
      pins.push({ file, entry, revision });
    }
  }
  for (const required of ["init", "analyze"]) {
    if (!pins.some((pin) => pin.entry === required)) {
      throw new Error(`Missing CodeQL ${required} reference`);
    }
  }
  if (new Set(pins.map((pin) => pin.revision)).size !== 1) {
    throw new Error("CodeQL action revisions differ; update all entry points atomically");
  }
  return pins.length;
}

function workflowSources(directory) {
  const sources = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(sources, workflowSources(file));
    else if (/\.ya?ml$/.test(file)) sources[file] = fs.readFileSync(file, "utf8");
  }
  return sources;
}

if (require.main === module) {
  console.log(`Verified ${checkCodeqlPins(workflowSources(".github"))} aligned immutable CodeQL references.`);
}

module.exports = { checkCodeqlPins, workflowSources };
