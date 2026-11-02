"use strict";

const fs = require("node:fs");
const path = require("node:path");

function checkCodeqlPins(sources) {
  const pins = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const match of source.matchAll(
      /^\s*(?:-\s*)?uses:\s*["']?github\/codeql-action\/([^@\s]+)@([^\s"'#]+)/gim,
    )) {
      const [, entry, revision] = match;
      if (!/^[a-f0-9]{40}$/.test(revision)) {
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
