// Read update types from the API-verified, signed Dependabot commit message.
const fs = require("node:fs");
const YAML = require("yaml");

function parseMetadata(message) {
  const blocks = [...message.matchAll(/^---\r?\n([\s\S]*?)^\.\.\.[ \t]*(?:\r?\n|$)/gm)];
  if (blocks.length !== 1) throw new Error("Dependabot update metadata is missing or ambiguous");
  const dependencies = YAML.parse(blocks[0][1])?.["updated-dependencies"];
  if (!Array.isArray(dependencies) || !dependencies.length) throw new Error("Dependabot update metadata is missing");
  return dependencies.map((dependency) => {
    const dependencyName = dependency?.["dependency-name"];
    if (typeof dependencyName !== "string" || !dependencyName.trim()) {
      throw new Error("Dependabot update metadata is missing or incomplete");
    }
    const updateType = dependency["update-type"];
    // SHA-only Actions updates require a manual merge. A hash has no semver classification.
    const shaOnly = !Object.hasOwn(dependency, "update-type")
      && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?$/.test(dependencyName)
      && /^[a-f0-9]{40}$/.test(dependency["dependency-version"]);
    if (!shaOnly && !["version-update:semver-patch", "version-update:semver-minor", "version-update:semver-major"].includes(updateType)) {
      throw new Error("Dependabot update metadata is missing or invalid");
    }
    return { dependencyName, updateType: updateType ?? null, shaOnly };
  });
}

module.exports = { parseMetadata };
if (require.main === module) {
  console.log(JSON.stringify(parseMetadata(JSON.parse(fs.readFileSync(0, "utf8")))));
}
