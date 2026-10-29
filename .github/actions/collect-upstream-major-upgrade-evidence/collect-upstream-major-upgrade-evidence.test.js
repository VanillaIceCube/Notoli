"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  collectUpstreamMajorUpgradeEvidence,
  githubRepository,
  majorReleaseVersion,
  packageRepositoryUrl,
} = require("./collect-upstream-major-upgrade-evidence");

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

test("derives the first release in a semver-major line", () => {
  assert.equal(majorReleaseVersion("7.3.0"), "7.0.0");
  assert.equal(majorReleaseVersion("7.3.0-beta.1"), "7.0.0");
  assert.equal(majorReleaseVersion("v7.3.0"), "");
});

test("collects a scoped npm package release from string repository metadata", async () => {
  const releaseCalls = [];
  const evidence = await collectUpstreamMajorUpgradeEvidence({
    dependencyNames: "@scope/package",
    packageEcosystem: "npm",
    previousVersion: "1.0.0",
    newVersion: "2.0.0",
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
    dependencyNames: ["example"],
    packageEcosystem: "npm",
    previousVersion: "1.0.0",
    newVersion: "2.0.0",
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
    dependencyNames: "docker/build-push-action",
    packageEcosystem: "github-actions",
    previousVersion: "6.19.2",
    newVersion: "7.3.0",
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
    dependencyNames: ["actions/checkout"],
    packageEcosystem: "github-actions",
    previousVersion: "4.0.0",
    newVersion: "5.0.0",
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
    dependencyNames: "gunicorn",
    packageEcosystem: "pip",
    previousVersion: "22.0.0",
    newVersion: "23.0.0",
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
    dependencyNames: "actions/checkout",
    packageEcosystem: "github-actions",
    previousVersion: "4.0.0",
    newVersion: "5.0.0",
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
    dependencyNames: "actions/checkout",
    packageEcosystem: "github-actions",
    previousVersion: "4.0.0",
    newVersion: "5.0.0",
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
    dependencyNames: "example",
    packageEcosystem: "nuget",
    previousVersion: "1.0.0",
    newVersion: "2.0.0",
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
