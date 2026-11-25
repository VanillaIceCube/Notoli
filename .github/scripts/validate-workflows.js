// Check workflow permissions, immutable action revisions and repository automation layout.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const workflows = ".github/workflows";
const actions = ".github/actions";
const scripts = ".github/scripts";
const tests = ".github/tests";
const fixtures = ".github/fixtures";
const workflowFile = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const yamlOptions = { schema: "failsafe", stringKeys: true };
const permissionScopes = new Set([
  "actions", "artifact-metadata", "attestations", "checks", "contents", "deployments",
  "discussions", "id-token", "issues", "models", "packages", "pages", "pull-requests",
  "repository-projects", "security-events", "statuses", "vulnerability-alerts",
]);

function check(source, name) {
  const lineCounter = new YAML.LineCounter();
  const doc = YAML.parseDocument(source, { ...yamlOptions, lineCounter });
  const { contents } = doc;
  if (doc.errors.length) {
    return doc.errors.map((error) => name + ":" + lineCounter.linePos(error.pos[0]).line + ": invalid YAML: " + error.message.split("\n")[0]);
  }
  const errors = [];
  const lines = source.split(/\r?\n/);
  function error(node, message) {
    const line = lineCounter.linePos(node?.range?.[0] ?? 0).line;
    errors.push(name + ":" + line + ": " + message);
  }
  if (workflowFile.test(name.replaceAll("\\", "/")) && !(YAML.isMap(contents) && contents.has("permissions"))) {
    errors.push(name + ":1: declare explicit workflow-level permissions");
  }
  YAML.visit(doc, {
    Alias(_, node) {
      error(node, "YAML aliases require explicit declarations in each policy context");
    },
    Pair(_, { key, value }) {
      switch (key?.value) {
        case "<<":
          error(key, "YAML merge keys require explicit policy review");
          break;
        case "uses": {
          if (!YAML.isScalar(value) || typeof value.value !== "string") {
            error(value ?? key, "uses must be a scalar");
            break;
          }
          const ref = value.value;
          if (ref.startsWith("./")) break;
          const pin = ref.startsWith("docker://") ? /^.+@sha256:[a-f0-9]{64}$/ : /^.+@[a-f0-9]{40}$/;
          const line = lines[lineCounter.linePos(value.range[0]).line - 1];
          if (!pin.test(ref) || !/\s+#\s*\S/.test(line)) {
            error(value, "external actions require an immutable SHA and readable version comment");
          }
          break;
        }
        case "permissions":
          if (!YAML.isMap(value)) {
            error(value ?? key, "enumerate required permissions");
            break;
          }
          for (const { key: scope, value: level } of value.items) {
            if (!permissionScopes.has(scope?.value) || !["read", "write", "none"].includes(level?.value)) {
              error(scope, "unknown permission scope or grant");
            }
          }
          break;
        case "on": {
          let triggers = [value];
          if (YAML.isSeq(value)) triggers = value.items;
          if (YAML.isMap(value)) triggers = value.items.map((pair) => pair.key);
          if (triggers.some((node) => node?.value === "pull_request_target")) {
            error(value, "privileged PR-target execution requires a separately reviewed policy");
          }
          break;
        }
      }
    },
  });
  return errors;
}

function effectiveWrites(source, trustedBase) {
  const workflow = YAML.parse(source, { ...yamlOptions, mapAsMap: true });
  if (!(workflow instanceof Map)) throw new Error("workflow must be a YAML mapping");
  function writes(permissions) {
    if (!(permissions instanceof Map)) throw new Error("workflow permissions must enumerate scopes");
    return new Set([...permissions].filter(([, level]) => level === "write").map(([scope]) => scope));
  }
  // Older reviewed workflows may omit defaults. Only explicitly granted writes carry over.
  const defaults = workflow.has("permissions") ? workflow.get("permissions") : trustedBase && new Map();
  const result = new Map([[null, writes(defaults)]]);
  for (const [job, definition] of workflow.get("jobs") ?? []) {
    if (!(definition instanceof Map)) throw new Error("job must be a YAML mapping");
    result.set(job, writes(definition.has("permissions") ? definition.get("permissions") : defaults));
  }
  return result;
}

function changedGrants(base, proposed, file) {
  const approved = base === null ? new Map() : effectiveWrites(base, true);
  const errors = [];
  for (const [job, writes] of effectiveWrites(proposed, false)) {
    const context = job === null ? "workflow" : "jobs." + job;
    for (const scope of [...writes].sort()) {
      if (!approved.get(job)?.has(scope)) errors.push(file + ": " + context + " requests " + scope + ": write outside the trusted base grant");
    }
  }
  return errors;
}

function git(root, ...args) {
  // Reject lossily decoded paths or source, including files read from proposed commits.
  const bytes = execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function workflowBlobs(root, revision) {
  if (typeof revision !== "string" || !/^[a-f0-9]{40}$/.test(revision)) throw new Error("expected an exact GitHub commit SHA");
  const records = git(root, "ls-tree", "--full-tree", "-r", "-z", revision + "^{commit}", "--", workflows + "/");
  const blobs = new Map();
  for (const record of records.split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t");
    const file = record.slice(tab + 1);
    if (!workflowFile.test(file)) continue;
    const [mode, kind, oid] = record.slice(0, tab).split(" ");
    if (kind !== "blob" || !["100644", "100755"].includes(mode)) throw new Error(file + ": expected a regular workflow file");
    blobs.set(file, oid);
  }
  return blobs;
}

function compareCommits(base, head, root = process.cwd()) {
  const before = workflowBlobs(root, base);
  const after = workflowBlobs(root, head);
  function read(oid) {
    if (Number(git(root, "cat-file", "-s", oid)) > 1024 * 1024) throw new Error("workflow exceeds the one MiB inspection limit");
    return git(root, "cat-file", "blob", oid);
  }
  const errors = [];
  for (const [file, oid] of after) {
    if (before.get(file) === oid) continue;
    const proposed = read(oid);
    const problems = check(proposed, file);
    if (problems.length) errors.push(...problems);
    else errors.push(...changedGrants(before.has(file) ? read(before.get(file)) : null, proposed, file));
  }
  return errors;
}

function* usesIn(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "uses" && typeof child === "string") yield child;
    yield* usesIn(child, seen);
  }
}

function repositoryFiles(root) {
  const listing = git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ".github", ":(exclude).github/node_modules/**");
  return new Set(listing.split("\0").filter((name) => name && fs.lstatSync(path.join(root, name), { throwIfNoEntry: false })));
}

function isPolicyYaml(name) {
  return /\.ya?ml$/i.test(name) && !name.startsWith(tests + "/") && !name.startsWith(fixtures + "/");
}

function checkCodeqlPins(root = process.cwd()) {
  const entries = new Set();
  const revisions = new Set();
  let count = 0;
  for (const name of repositoryFiles(root)) {
    if (!isPolicyYaml(name)) continue;
    const document = YAML.parse(fs.readFileSync(path.join(root, name), "utf8"), yamlOptions);
    for (const reference of usesIn(document)) {
      const prefix = "github/codeql-action/";
      if (!reference.toLowerCase().startsWith(prefix)) continue;
      const target = reference.slice(prefix.length);
      const at = target.indexOf("@");
      const entry = at === -1 ? target : target.slice(0, at);
      const revision = at === -1 ? "" : target.slice(at + 1);
      if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error(name + ": CodeQL " + entry + " requires an immutable SHA");
      entries.add(entry);
      revisions.add(revision);
      count++;
    }
  }
  for (const entry of ["init", "analyze"]) {
    if (!entries.has(entry)) throw new Error("Missing CodeQL " + entry + " reference");
  }
  if (revisions.size !== 1) throw new Error("CodeQL action revisions differ; update all entry points atomically");
  return count;
}

function layoutProblem(file, testOwners) {
  const parts = file.split("/");
  const group = parts.slice(0, 2).join("/");
  const name = parts.at(-1);
  const parent = path.posix.dirname(file);
  if (name === "README.md" && parent === group) return;
  if ([workflows, actions, scripts].includes(group) && (name.includes(".test.") || name.startsWith("test_") || parts.includes("fixtures"))) {
    return "keep automation tests in .github/tests and fixtures in .github/fixtures";
  }
  if (group === workflows && !(parent === workflows && name.endsWith(".yml") && kebab.test(name.slice(0, -4)))) {
    return "put kebab-case .yml workflows directly in .github/workflows";
  }
  const js = name.endsWith(".js") && kebab.test(name.slice(0, -3));
  if (group === scripts && !(parent === scripts && js)) return "put kebab-case .js automation programs directly in .github/scripts";
  if (group === actions && !(parts.length === 4 && (name === "action.yml" || js))) {
    return "keep action.yml and its implementation together in the action directory";
  }
  if (group === tests) {
    if (parent !== tests && parent !== tests + "/integration") {
      return "test discovery reads .github/tests and its integration directory. Put supporting data in .github/fixtures";
    }
    if (!name.endsWith(".test.js") || !kebab.test(name.slice(0, -8))) return "use <implementation-name>.test.js";
    if (parent === tests && !testOwners.has(name.slice(0, -8))) return "name the test after its script, action implementation or workflow";
  }
  if (group === fixtures && !kebab.test(path.posix.parse(name).name)) {
    return "use a lowercase, hyphen-separated fixture name";
  }
  if (group === fixtures && /\.(?:[cm]?js|ts|py|sh|ps1|cmd|bat|exe)$/i.test(name)) {
    return "keep supporting data in .github/fixtures and executable tests in .github/tests";
  }
  if (/\.(?:py|sh)$/i.test(name)) return "put standalone GitHub automation in a JavaScript implementation file";
}

function callsActionEntry(step, directory, entry) {
  if (typeof step?.run === "string") {
    // A composite shell step runs the adjacent file using the runner's action directory.
    for (const [, file] of step.run.matchAll(/^\s*(?:exec\s+)?node\s+["']?\$(?:GITHUB_ACTION_PATH|\{GITHUB_ACTION_PATH\})\/([a-z0-9-]+\.js)(?=["'\s]|$)/gm)) {
      if (file === entry) return true;
    }
  }
  if (!step?.uses?.startsWith("actions/github-script@") || typeof step.with?.script !== "string") return false;
  // github-script loads the action module from the checked-out workspace.
  const requireFromWorkspace = /\brequire\(\s*(?:process\.env\.GITHUB_WORKSPACE\s*\+\s*["']|\x60\$\{process\.env\.GITHUB_WORKSPACE\})\/(\.github\/actions\/[a-z0-9-]+\/[a-z0-9-]+\.js)["'\x60]\s*,?\s*\)/g;
  const script = step.with.script.split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n");
  return [...script.matchAll(requireFromWorkspace)].some(([, file]) => file === directory + "/" + entry);
}

function manifestProblems(document, name, source, files) {
  const { runs } = document;
  if (runs?.using !== "composite" || !Array.isArray(runs.steps)) return [name + ": expected a composite action with runs.steps"];
  const problems = [];
  const directory = path.posix.dirname(name);
  const entry = path.posix.basename(directory) + ".js";
  if (!files.has(directory + "/" + entry)) problems.push(name + ": missing primary action implementation " + entry);
  else if (!runs.steps.some((step) => callsActionEntry(step, directory, entry))) problems.push(name + ": a composite step must invoke " + entry);
  for (const step of runs.steps) {
    if (!step || typeof step !== "object" || Array.isArray(step) || (Object.hasOwn(step, "run") && !step.shell)) {
      problems.push(name + ": a composite run step needs its shell");
    }
  }
  for (const [, script] of source.matchAll(/\$\{?GITHUB_ACTION_PATH\}?\/([a-z0-9.-]+)/g)) {
    if (!files.has(path.posix.join(path.posix.dirname(name), script))) problems.push(name + ": missing action implementation " + script);
  }
  return problems;
}

function audit(root = process.cwd()) {
  const files = repositoryFiles(root);
  const testOwners = new Set();
  for (const file of files) {
    if (/^\.github\/(?:scripts\/[^/]+\.js|actions\/[^/]+\/[^/]+\.js|workflows\/[^/]+\.yml)$/.test(file)) {
      testOwners.add(path.posix.parse(file).name);
    }
  }
  const callers = new Map();
  const declaredActions = new Set();
  const errors = [];
  for (const name of [...files].sort()) {
    const parts = name.split("/");
    const group = parts.slice(0, 2).join("/");
    if (group === actions && parts.length >= 4) declaredActions.add(parts.slice(0, 3).join("/"));
    const fullPath = path.join(root, name);
    if ([workflows, actions, scripts].includes(group) && !fs.lstatSync(fullPath).isFile()) {
      errors.push(name + ": workflows and their executable helpers must be regular files");
      continue;
    }
    const layout = layoutProblem(name, testOwners);
    if (layout) errors.push(name + ": " + layout);
    if (!isPolicyYaml(name)) continue;
    const source = fs.readFileSync(fullPath, "utf8");
    const problems = check(source, name);
    if (problems.length) {
      errors.push(...problems);
      continue;
    }
    const document = YAML.parse(source, yamlOptions);
    if (!document || Array.isArray(document) || typeof document !== "object") {
      errors.push(name + ": expected a YAML mapping");
      continue;
    }
    if (![workflows, actions].includes(group)) continue;
    if (parts.at(-1) === "action.yml") errors.push(...manifestProblems(document, name, source, files));
    const targets = new Set();
    callers.set(name, targets);
    for (const reference of usesIn(document)) {
      if (!reference.startsWith("./")) continue;
      let target = reference.slice(2);
      if (path.posix.dirname(target) === actions) target += "/action.yml";
      else if (path.posix.dirname(target) !== workflows || !target.endsWith(".yml")) {
        errors.push(name + ": local uses must name a reusable action or a workflow");
        continue;
      }
      targets.add(target);
      if (!files.has(target)) errors.push(name + ": local uses target " + reference + " is missing");
    }
    // Pinned application deployment workflows are verified against the Infrastructure release template.
    const generatedDeploy = name === workflows + "/ci-deploy.yml" && fs.existsSync(path.join(root, "deploy/production/app.json"));
    if (!generatedDeploy && /^\s*(?:python3?|node)(?:[ \t]+-[A-Za-z]+)*[ \t]+(?:-[ \t]*)?<</m.test(source)) {
      errors.push(name + ": put an embedded Python or JavaScript program in an implementation file");
    }
    for (const [script] of source.matchAll(/\.github\/(?:workflows\/)?scripts\/[a-z0-9-]+\.(?:m?js|cjs|py|sh)\b/g)) {
      if (!files.has(script)) errors.push(name + ": missing workflow script " + script);
    }
  }
  const pending = [...callers.keys()].filter((file) => path.posix.dirname(file) === workflows);
  const reachable = new Set(pending);
  while (pending.length) {
    for (const child of callers.get(pending.pop()) ?? []) {
      if (reachable.has(child)) continue;
      reachable.add(child);
      pending.push(child);
    }
  }
  for (const folder of [...declaredActions].sort()) {
    const manifest = folder + "/action.yml";
    if (!kebab.test(path.posix.basename(folder)) || !files.has(manifest)) {
      errors.push(folder + ": each reusable action needs a kebab-case directory and action.yml");
    } else if (!reachable.has(manifest)) {
      errors.push(folder + ": no local workflow or action calls this action");
    }
  }
  return errors;
}

function main(args) {
  const [command, base, head] = args;
  let problems;
  if (command === "--check-codeql-pins" && args.length === 1) {
    console.log("Verified " + checkCodeqlPins() + " aligned immutable CodeQL references.");
    return;
  } else if (command === "--compare-workflow-grants" && args.length === 3) {
    problems = compareCommits(base, head);
  } else if (command === "--audit" && args.length === 1) {
    problems = audit();
    if (process.env.GITHUB_EVENT_NAME === "pull_request") {
      const { pull_request: pr } = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      problems.push(...compareCommits(pr.base.sha, pr.head.sha));
    }
  } else {
    throw new Error("Expected --audit, --check-codeql-pins or --compare-workflow-grants BASE HEAD");
  }
  if (problems.length) throw new Error(problems.join("\n"));
}

module.exports = { audit, changedGrants, check, checkCodeqlPins };
if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
