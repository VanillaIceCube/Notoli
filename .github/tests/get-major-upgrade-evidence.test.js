"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  getMajorUpgradeEvidence,
  githubRepository,
  packageRepositoryUrl,
} = require("../scripts/get-major-upgrade-evidence");

test("Obi-Wan collects bounded external evidence for Dependabot major updates", () => {
  const workflowPath = path.resolve(
    __dirname,
    "../workflows/review-code.yml",
  );
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /Get major-upgrade evidence/);
  assert.match(workflow, /version-update:semver-major/);
  assert.match(workflow, /get-major-upgrade-evidence\.js/);
  assert.match(
    workflow,
    /enable_web_search: \$\{\{ steps\.dependabot-metadata\.outputs\.update-type == 'version-update:semver-major' \}\}/,
  );
  assert.match(workflow, /Do not merely summarize release-note headings/);
  assert.match(workflow, /"upgrade_story"/);
  assert.match(workflow, /"repository_impact"/);
  assert.match(workflow, /"recommendation"/);
  assert.match(workflow, /"sources"/);
});

function dependency(dependencyName, packageEcosystem, prevVersion, newVersion, level = "major") {
  return { dependencyName, packageEcosystem, prevVersion, newVersion, updateType: "version-update:semver-" + level };
}

function notFound() {
  return Object.assign(new Error("not found"), { status: 404 });
}

test("normalizes npm object and string repository metadata", () => {
  assert.equal(
    packageRepositoryUrl({ repository: { url: "git+https://github.com/example/object.git" } }),
    "git+https://github.com/example/object.git",
  );
  assert.equal(
    packageRepositoryUrl({ repository: "git@github.com:example/string.git" }),
    "git@github.com:example/string.git",
  );
  assert.equal(githubRepository("git@github.com:example/string.git"), "example/string");
});

test("collects a scoped npm package release from string repository metadata", async () => {
  const releaseCalls = [];
  const evidence = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("@scope/package", "npm", "1.0.0", "2.0.0")]),
    fetchJson: async () => ({ repository: "https://github.com/example/package.git" }),
    getReleaseByTag: async (request) => {
      releaseCalls.push(request);
      if (request.tag === "v2.0.0") {
        return {
          tag_name: "v2.0.0",
          name: "2.0.0",
          published_at: "2026-07-28T00:00:00Z",
          html_url: "https://github.com/example/package/releases/tag/v2.0.0",
          body: "Major public API change.",
        };
      }
      const error = new Error("not found");
      error.status = 404;
      throw error;
    },
  });

  assert.deepEqual(releaseCalls, [
    { owner: "example", repo: "package", tag: "2.0.0" },
    { owner: "example", repo: "package", tag: "v2.0.0" },
  ]);
  assert.equal(evidence.release_sources.length, 1);
  assert.equal(evidence.release_sources[0].release_notes, "Major public API change.");
  assert.deepEqual(evidence.retrieval_notes, []);
});

test("returns a bounded, non-failing evidence record when upstream lookup fails", async () => {
  const evidence = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("example", "npm", "1.0.0", "2.0.0")]),
    fetchJson: async () => {
      throw new Error("registry unavailable");
    },
    getReleaseByTag: async () => {
      throw new Error("should not be called");
    },
  });

  assert.deepEqual(evidence.release_sources, []);
  assert.deepEqual(evidence.retrieval_notes, [
    "Could not collect upstream metadata for example@2.0.0: registry unavailable",
  ]);
});

test("collects the target and first-major release when they differ", async () => {
  const releaseCalls = [];
  const evidence = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("docker/build-push-action", "github-actions", "6.19.2", "7.3.0")]),
    fetchJson: async () => ({}),
    getReleaseByTag: async (request) => {
      releaseCalls.push(request.tag);
      if (["v7.3.0", "v7.0.0"].includes(request.tag)) {
        return { tag_name: request.tag, html_url: `https://example.test/${request.tag}` };
      }
      const error = new Error("not found");
      error.status = 404;
      throw error;
    },
  });

  assert.deepEqual(releaseCalls, ["7.3.0", "v7.3.0", "7.0.0", "v7.0.0"]);
  assert.deepEqual(evidence.release_sources.map((source) => source.tag), ["v7.3.0", "v7.0.0"]);
});

test("bounds upstream release notes without losing the source record", async () => {
  const evidence = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("actions/checkout", "github-actions", "4.0.0", "5.0.0")]),
    releaseNoteLimit: 12,
    fetchJson: async () => {
      throw new Error("should not be called");
    },
    getReleaseByTag: async () => ({
      tag_name: "v5.0.0",
      html_url: "https://github.com/actions/checkout/releases/tag/v5.0.0",
      body: "A release note that exceeds the configured limit.",
    }),
  });

  assert.equal(evidence.release_sources[0].tag, "v5.0.0");
  assert.equal(
    evidence.release_sources[0].release_notes,
    "A release no\n[truncated to 12 characters]",
  );
});

test("discovers a GitHub release from PyPI project metadata", async () => {
  const releaseCalls = [];
  const evidence = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("gunicorn", "pip", "22.0.0", "23.0.0")]),
    fetchJson: async () => ({
      info: {
        project_urls: {
          Documentation: "https://docs.example.test",
          Source: "https://github.com/benoitc/gunicorn",
        },
      },
    }),
    getReleaseByTag: async (request) => {
      releaseCalls.push(request);
      return { tag_name: "23.0.0", html_url: "https://github.com/benoitc/gunicorn/releases/tag/23.0.0" };
    },
  });

  assert.deepEqual(releaseCalls, [
    { owner: "benoitc", repo: "gunicorn", tag: "23.0.0" },
    { owner: "benoitc", repo: "gunicorn", tag: "v23.0.0" },
  ]);
  assert.equal(evidence.release_sources[0].repository, "benoitc/gunicorn");
});

test("collects uv major-upgrade evidence from PyPI and the upstream release", async () => {
  const registryCalls = [];
  const releaseCalls = [];
  const evidence = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("gunicorn", "uv", "22.0.0", "23.0.0")]),
    fetchJson: async (url) => {
      registryCalls.push(url);
      return { info: { project_urls: {
        Documentation: "https://docs.example.test",
        Source: "https://github.com/benoitc/gunicorn",
      } } };
    },
    getReleaseByTag: async (request) => {
      releaseCalls.push(request);
      return {
        tag_name: "23.0.0", html_url: "https://github.com/benoitc/gunicorn/releases/tag/23.0.0",
        body: "Upstream major release notes.",
      };
    },
  });
  assert.deepEqual(registryCalls, ["https://pypi.org/pypi/gunicorn/23.0.0/json"]);
  assert.deepEqual(releaseCalls, [
    { owner: "benoitc", repo: "gunicorn", tag: "23.0.0" },
    { owner: "benoitc", repo: "gunicorn", tag: "v23.0.0" },
  ]);
  assert.equal(evidence.dependencies[0].package_ecosystem, "uv");
  assert.equal(evidence.release_sources[0].repository, "benoitc/gunicorn");
  assert.equal(evidence.release_sources[0].release_notes, "Upstream major release notes.");
  assert.deepEqual(evidence.retrieval_notes, []);
});

test("records missing GitHub Action releases without failing the collector", async () => {
  const evidence = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("actions/checkout", "github-actions", "4.0.0", "5.0.0")]),
    fetchJson: async () => {
      throw new Error("should not be called");
    },
    getReleaseByTag: async () => {
      const error = new Error("not found");
      error.status = 404;
      throw error;
    },
  });

  assert.deepEqual(evidence.release_sources, []);
  assert.deepEqual(evidence.retrieval_notes, [
    "No GitHub Release matching actions/checkout@5.0.0 or v5.0.0 was found.",
  ]);
});

test("records GitHub API failures and unsupported ecosystems as degraded evidence", async () => {
  const apiFailure = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("actions/checkout", "github-actions", "4.0.0", "5.0.0")]),
    fetchJson: async () => {
      throw new Error("should not be called");
    },
    getReleaseByTag: async () => {
      const error = new Error("rate limited");
      error.status = 429;
      throw error;
    },
  });
  const unsupported = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([dependency("example", "nuget", "1.0.0", "2.0.0")]),
    fetchJson: async () => {
      throw new Error("should not be called");
    },
    getReleaseByTag: async () => {
      throw new Error("should not be called");
    },
  });

  assert.deepEqual(apiFailure.retrieval_notes, [
    "Could not read GitHub release actions/checkout@5.0.0: rate limited",
  ]);
  assert.deepEqual(unsupported.retrieval_notes, [
    "No supported external release collector is configured for package ecosystem nuget.",
  ]);
});

test("uses each major dependency's own ecosystem and target in a grouped update", async () => {
  const registryCalls = [];
  const releaseCalls = [];
  const evidence = await getMajorUpgradeEvidence({
    updatedDependenciesJson: JSON.stringify([
      dependency("first", "npm_and_yarn", "1.0.0", "1.1.0", "minor"),
      dependency("@scope/later", "npm_and_yarn", "5.0.0", "6.0.0"),
      dependency("different-ecosystem", "pip", "8.0.0", "9.0.0"),
    ]),
    fetchJson: async (url) => {
      registryCalls.push(url);
      return url.includes("npmjs")
        ? { repository: "https://github.com/example/later" }
        : { info: { home_page: "https://github.com/example/python" } };
    },
    getReleaseByTag: async (request) => {
      releaseCalls.push(request);
      return { tag_name: request.tag, html_url: "https://github.com/example/releases/" + request.tag };
    },
  });

  assert.deepEqual(registryCalls, [
    "https://registry.npmjs.org/%40scope%2Flater/6.0.0",
    "https://pypi.org/pypi/different-ecosystem/9.0.0/json",
  ]);
  assert.deepEqual(releaseCalls.map(({ repo, tag }) => [repo, tag]), [
    ["later", "6.0.0"], ["later", "v6.0.0"], ["python", "9.0.0"], ["python", "v9.0.0"],
  ]);
  assert.deepEqual(evidence.dependencies, [
    { name: "first", package_ecosystem: "npm_and_yarn", previous_version: "1.0.0", new_version: "1.1.0", update_type: "version-update:semver-minor" },
    { name: "@scope/later", package_ecosystem: "npm_and_yarn", previous_version: "5.0.0", new_version: "6.0.0", update_type: "version-update:semver-major" },
    { name: "different-ecosystem", package_ecosystem: "pip", previous_version: "8.0.0", new_version: "9.0.0", update_type: "version-update:semver-major" },
  ]);
});

test("discovers a full-semver Actions release from bare and v-prefixed versions", async () => {
  for (const [previous, target, tags] of [
    ["6", "7", ["7", "v7", "7.0.0", "v7.0.0"]],
    ["v6", "v7", ["v7", "7", "7.0.0", "v7.0.0"]],
    ["v6.0.0", "v7.3.0", ["v7.3.0", "7.3.0", "7.0.0", "v7.0.0"]],
  ]) {
    const calls = [];
    const evidence = await getMajorUpgradeEvidence({
      updatedDependenciesJson: JSON.stringify([dependency("actions/example", "github_actions", previous, target)]),
      getReleaseByTag: async ({ tag }) => {
        calls.push(tag);
        if (tag === "v7.0.0") return { tag_name: tag };
        throw notFound();
      },
    });
    assert.deepEqual(calls, tags);
    assert.deepEqual(evidence.release_sources.map(({ tag }) => tag), ["v7.0.0"]);
    assert.deepEqual(evidence.retrieval_notes, []);
  }
});

test("reports unsupported Actions refs and missing metadata without guessing versions", async () => {
  for (const target of ["abcdef1234567890abcdef1234567890abcdef12", "main", "stable-v7", ""]) {
    const evidence = await getMajorUpgradeEvidence({
      updatedDependenciesJson: JSON.stringify([dependency("actions/example", "github_actions", "6", target)]),
      getReleaseByTag: async () => assert.fail("Unexpected release lookup"),
    });
    assert.deepEqual(evidence.release_sources, []);
    assert.match(evidence.retrieval_notes[0], /Cannot infer|Incomplete Dependabot metadata/);
  }
  for (const updatedDependenciesJson of [undefined, "{", "{}", "[]"]) {
    const evidence = await getMajorUpgradeEvidence({ updatedDependenciesJson });
    assert.deepEqual(evidence.dependencies, []);
    assert.match(evidence.retrieval_notes[0], /metadata was unavailable/);
  }
});

test("passes evaluated per-dependency metadata intact through the workflow collector", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-upstream-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workflow = fs.readFileSync(path.join(__dirname, "../workflows/review-code.yml"), "utf8");
  const step = workflow.split("      - name: Get major-upgrade evidence")[1]
    .split(/^      - name:/m)[0];
  const [, expression] = step.match(/^          UPDATED_DEPENDENCIES_JSON: (.*)$/m);
  const output = "steps.dependabot-metadata.outputs.updated-dependencies-json";
  assert.equal(expression, "$" + "{{ " + output + " }}");
  // Captured from the pinned v3.1.0 dist/index.js with a mocked GitHub
  // listCommits response for a signed two-dependency Actions update.
  const metadata = fs.readFileSync(path.join(__dirname, "../fixtures/dependabot-grouped-updates.json"), "utf8");
  const { writeUpstreamMajorUpgradeEvidence } = require("../scripts/get-major-upgrade-evidence");
  const requests = [];
  const dependencies = process.env.UPDATED_DEPENDENCIES_JSON;
  const runnerTemp = process.env.RUNNER_TEMP;
  process.env.UPDATED_DEPENDENCIES_JSON = metadata;
  process.env.RUNNER_TEMP = root;
  try {
    await writeUpstreamMajorUpgradeEvidence({
      context: { repo: { repo: "fixture" } },
      fetchResponse: async () => assert.fail("Unexpected registry request"),
      github: {
        rest: { repos: { getReleaseByTag: async ({ owner, repo, tag }) => {
          requests.push([owner, repo, tag]);
          if (tag === "v7.0.0") return { data: { tag_name: tag } };
          throw Object.assign(new Error("not found"), { status: 404 });
        } } },
      },
    });
  } finally {
    if (dependencies === undefined) delete process.env.UPDATED_DEPENDENCIES_JSON;
    else process.env.UPDATED_DEPENDENCIES_JSON = dependencies;
    if (runnerTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = runnerTemp;
  }
  const evidence = JSON.parse(fs.readFileSync(path.join(root, "upstream-major-upgrade-evidence.json"), "utf8"));
  assert.deepEqual(evidence.dependencies.map(({ previous_version, new_version }) => [previous_version, new_version]),
    [["1.0.0", "1.1.0"], ["6", "7"]]);
  assert.deepEqual(requests, ["7", "v7", "7.0.0", "v7.0.0"].map((tag) => ["example", "later", tag]));
  assert.equal(evidence.release_sources[0].tag, "v7.0.0");
  assert.deepEqual(evidence.retrieval_notes, []);
});
