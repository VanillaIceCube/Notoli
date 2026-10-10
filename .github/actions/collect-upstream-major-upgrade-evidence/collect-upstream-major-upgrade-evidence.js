"use strict";

const DEFAULT_RELEASE_NOTE_LIMIT = 12000;

function parseDependencyNames(value) {
  return String(value || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

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

function majorReleaseVersion(value) {
  const match = String(value || "").match(/^(\d+)\.\d+\.\d+(?:[-+].*)?$/);
  return match ? `${match[1]}.0.0` : "";
}

async function collectUpstreamMajorUpgradeEvidence({
  dependencyNames,
  packageEcosystem,
  previousVersion,
  newVersion,
  fetchJson,
  getReleaseByTag,
  releaseNoteLimit = DEFAULT_RELEASE_NOTE_LIMIT,
}) {
  const dependencies = Array.isArray(dependencyNames)
    ? dependencyNames.filter(Boolean)
    : parseDependencyNames(dependencyNames);
  const ecosystem = packageEcosystem || "unknown";
  const oldVersion = previousVersion || "unknown";
  const targetVersion = newVersion || "unknown";
  const evidence = {
    source: "Upstream package registries and GitHub Releases",
    package_ecosystem: ecosystem,
    dependency_names: dependencies,
    previous_version: oldVersion,
    new_version: targetVersion,
    release_sources: [],
    retrieval_notes: [],
  };

  const collectGitHubRelease = async (repository) => {
    if (!repository) return;
    const [owner, repo] = repository.split("/");
    const firstMajorRelease = majorReleaseVersion(targetVersion);
    const tags = new Set([targetVersion, `v${targetVersion}`]);
    if (firstMajorRelease) {
      tags.add(firstMajorRelease);
      tags.add(`v${firstMajorRelease}`);
    }
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

  for (const dependency of dependencies) {
    try {
      if (ecosystem === "github-actions") {
        await collectGitHubRelease(githubRepository(dependency));
        continue;
      }

      if (ecosystem === "npm") {
        const metadata = await fetchJson(
          `https://registry.npmjs.org/${encodeURIComponent(dependency)}/${encodeURIComponent(targetVersion)}`,
        );
        await collectGitHubRelease(githubRepository(packageRepositoryUrl(metadata)));
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
        await collectGitHubRelease(repository);
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
  majorReleaseVersion,
  packageRepositoryUrl,
  parseDependencyNames,
  truncate,
};
