// Authorize skips using the API diff paths and the filters from the reviewed checkout.
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const detectors = new Map([
  ["Lints / Lint Frontend (ESLint + Prettier)", ["gate-lint.yml", "frontend"]],
  ["Lints / Lint Backend (Ruff)", ["gate-lint.yml", "backend"]],
  ["Tests / Frontend Tests (React)", ["gate-test.yml", "frontend"]],
  ["Tests / Backend Tests (Django)", ["gate-test.yml", "backend"]],
  ["Tests / Automation Tests (Node)", ["gate-test.yml", "automation"]],
  ["CodeQL / Analyze Python", ["gate-codeql.yml", "python"]],
  ["CodeQL / Analyze JavaScript/TypeScript", ["gate-codeql.yml", "javascript"]],
  ["CodeQL / Analyze GitHub Actions", ["gate-codeql.yml", "actions"]],
]);

function scopeAllowsSkip(name, files) {
  if (!detectors.has(name)) throw new Error("Unknown scope detector");
  if (!Array.isArray(files) || !files.every((file) => typeof file === "string")) throw new Error("Expected changed file paths");
  const [workflow, scope] = detectors.get(name);
  const source = fs.readFileSync(path.join(__dirname, "../workflows", workflow), "utf8");
  const step = YAML.parse(source).jobs.changes.steps.find(({ id }) => id === "filter");
  const filters = YAML.parse(step.with.filters);
  function relevant(scopeName) {
    const patterns = filters[scopeName];
    if (!Array.isArray(patterns)) throw new Error("Unsupported detector filter structure");
    return patterns.some((pattern) => {
      if (typeof pattern !== "string" || pattern.startsWith("!")) throw new Error("Unsupported detector filter");
      const extension = /^\*\*\/\*\.([a-zA-Z0-9]+)$/.exec(pattern);
      if (extension) return files.some((file) => file.endsWith("." + extension[1]));
      const recursive = pattern.endsWith("/**");
      const plain = recursive ? pattern.slice(0, -3) : pattern;
      if (/[*?[\]{}!]/.test(plain)) throw new Error("Unsupported detector glob; refuse to authorize a skip");
      return files.some((file) => recursive ? file.startsWith(plain + "/") : file === plain);
    });
  }
  // The CodeQL workflow keeps Actions analysis present for every selected language.
  const scopes = scope === "actions" ? ["actions", "python", "javascript"] : [scope];
  return !scopes.some(relevant);
}

module.exports = { scopeAllowsSkip };
if (require.main === module) {
  const { name, files } = JSON.parse(fs.readFileSync(0, "utf8"));
  console.log(JSON.stringify(scopeAllowsSkip(name, files)));
}
