"use strict";

const DEFAULT_RELEASE_NOTE_LIMIT = 12000;

function truncate(value, limit = DEFAULT_RELEASE_NOTE_LIMIT) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n[truncated to ${limit} characters]`;
}

function githubRepository(value) {
  const text = String(value || "")
    .trim()
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  try {
    const url = new URL(text);
    if (!["github.com", "www.github.com"].includes(url.hostname)) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
  } catch {
    return /^[\w.-]+\/[\w.-]+$/.test(text) ? text : "";
  }
}

function packageRepositoryUrl(metadata) {
  const repository = metadata?.repository;
  return typeof repository === "string" ? repository : repository?.url;
}

const MAJOR_UPDATE = "version-update:semver-major";
const ACTION_ECOSYSTEMS = new Set(["github-actions", "github_actions"]);

function majorReleaseVersion(version) {
  const match = version.match(/^(\d+)\.\d+\.\d+(?:[-+].*)?$/);
  return match ? `${match[1]}.0.0` : "";
}

function releaseTags(version, isAction) {
  let target = version;
  if (isAction) {
    // Recognize numeric tags and semver, including prereleases. Branches and
    // immutable SHA references cannot tell us which major release to look up.
    if (/^[a-f0-9]{40}$/i.test(version) || !/^v?(?:0|[1-9]\d*)(?:\.\d+(?:\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)?)?$/.test(version)) {
      return [];
    }
    target = version.replace(/^v/, "");
  }
  const tags = new Set([version, target, `v${target}`]);
  const firstMajorRelease = isAction
    ? `${target.split(".")[0]}.0.0`
    : majorReleaseVersion(target);
  if (firstMajorRelease) {
    tags.add(firstMajorRelease);
    tags.add(`v${firstMajorRelease}`);
  }
  return [...tags];
}

async function collectUpstreamMajorUpgradeEvidence({
  updatedDependenciesJson,
  fetchJson,
  getReleaseByTag,
  releaseNoteLimit = DEFAULT_RELEASE_NOTE_LIMIT,
}) {
  const evidence = {
    source: "Upstream package registries and GitHub Releases",
    dependencies: [],
    release_sources: [],
    retrieval_notes: [],
  };
  try {
    const metadata = JSON.parse(updatedDependenciesJson);
    if (!Array.isArray(metadata) || metadata.length === 0) {
      throw new Error("Expected non-empty dependency metadata");
    }
    evidence.dependencies = metadata.map((dependency) => ({
      name: dependency?.dependencyName || "unknown",
      package_ecosystem: dependency?.packageEcosystem || "unknown",
      previous_version: dependency?.prevVersion || "unknown",
      new_version: dependency?.newVersion || "unknown",
      update_type: dependency?.updateType || "unknown",
    }));
  } catch {
    evidence.retrieval_notes.push(
      "Per-dependency Dependabot metadata was unavailable; upstream versions could not be established.",
    );
  }

  const collectGitHubRelease = async (repository, targetVersion, isAction = false) => {
    if (!repository) return;
    const tags = releaseTags(targetVersion, isAction);
    if (tags.length === 0) {
      evidence.retrieval_notes.push(
        `Cannot infer a release version for GitHub Action ${repository}@${targetVersion}.`,
      );
      return;
    }
    const [owner, repo] = repository.split("/");
    let foundRelease = false;
    for (const tag of tags) {
      try {
        const data = await getReleaseByTag({ owner, repo, tag });
        if (!evidence.release_sources.some(
          (source) => source.repository === repository && source.tag === data.tag_name,
        )) {
          evidence.release_sources.push({
            kind: "GitHub Release",
            repository,
            tag: data.tag_name,
            title: data.name || "",
            published_at: data.published_at || "",
            url: data.html_url || "",
            release_notes: truncate(data.body, releaseNoteLimit),
          });
        }
        foundRelease = true;
      } catch (error) {
        if (error.status !== 404) {
          evidence.retrieval_notes.push(
            `Could not read GitHub release ${repository}@${tag}: ${error.message}`,
          );
          return;
        }
      }
    }
    if (!foundRelease) {
      evidence.retrieval_notes.push(
        `No GitHub Release matching ${repository}@${targetVersion} or v${targetVersion} was found.`,
      );
    }
  };

  for (const update of evidence.dependencies) {
    if (update.update_type !== MAJOR_UPDATE) continue;
    const { name: dependency, package_ecosystem: ecosystem, new_version: targetVersion } = update;
    if (dependency === "unknown" || targetVersion === "unknown") {
      evidence.retrieval_notes.push(
        `Incomplete Dependabot metadata for ${dependency}; no upstream version was assumed.`,
      );
      continue;
    }
    try {
      if (ACTION_ECOSYSTEMS.has(ecosystem)) {
        await collectGitHubRelease(githubRepository(dependency), targetVersion, true);
        continue;
      }

      if (["npm", "npm_and_yarn"].includes(ecosystem)) {
        const metadata = await fetchJson(
          `https://registry.npmjs.org/${encodeURIComponent(dependency)}/${encodeURIComponent(targetVersion)}`,
        );
        await collectGitHubRelease(githubRepository(packageRepositoryUrl(metadata)), targetVersion);
        continue;
      }

      if (ecosystem === "pip") {
        const metadata = await fetchJson(
          `https://pypi.org/pypi/${encodeURIComponent(dependency)}/${encodeURIComponent(targetVersion)}/json`,
        );
        const projectUrls = metadata.info?.project_urls || {};
        const repository = githubRepository(
          Object.values(projectUrls).find((url) => githubRepository(url)) ||
            metadata.info?.home_page,
        );
        await collectGitHubRelease(repository, targetVersion);
        continue;
      }

      evidence.retrieval_notes.push(
        `No supported external release collector is configured for package ecosystem ${ecosystem}.`,
      );
    } catch (error) {
      evidence.retrieval_notes.push(
        `Could not collect upstream metadata for ${dependency}@${targetVersion}: ${error.message}`,
      );
    }
  }

  return evidence;
}

module.exports = {
  DEFAULT_RELEASE_NOTE_LIMIT,
  collectUpstreamMajorUpgradeEvidence,
  githubRepository,
  packageRepositoryUrl,
  truncate,
};
