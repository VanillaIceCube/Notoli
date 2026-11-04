"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  collectUpstreamMajorUpgradeEvidence,
  githubRepository,
  packageRepositoryUrl,
} = require("./collect-upstream-major-upgrade-evidence");

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
  const evidence = await collectUpstreamMajorUpgradeEvidence({
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
  const evidence = await collectUpstreamMajorUpgradeEvidence({
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
  const evidence = await collectUpstreamMajorUpgradeEvidence({
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
  const evidence = await collectUpstreamMajorUpgradeEvidence({
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
  const evidence = await collectUpstreamMajorUpgradeEvidence({
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

test("records missing GitHub Action releases without failing the collector", async () => {
  const evidence = await collectUpstreamMajorUpgradeEvidence({
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
  const apiFailure = await collectUpstreamMajorUpgradeEvidence({
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
  const unsupported = await collectUpstreamMajorUpgradeEvidence({
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
  const evidence = await collectUpstreamMajorUpgradeEvidence({
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
    const evidence = await collectUpstreamMajorUpgradeEvidence({
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
    const evidence = await collectUpstreamMajorUpgradeEvidence({
      updatedDependenciesJson: JSON.stringify([dependency("actions/example", "github_actions", "6", target)]),
      getReleaseByTag: async () => assert.fail("Unexpected release lookup"),
    });
    assert.deepEqual(evidence.release_sources, []);
    assert.match(evidence.retrieval_notes[0], /Cannot infer|Incomplete Dependabot metadata/);
  }
  for (const updatedDependenciesJson of [undefined, "{", "{}", "[]"]) {
    const evidence = await collectUpstreamMajorUpgradeEvidence({ updatedDependenciesJson });
    assert.deepEqual(evidence.dependencies, []);
    assert.match(evidence.retrieval_notes[0], /metadata was unavailable/);
  }
});
