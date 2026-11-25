"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { payload } = require("../request-ai-response/request-ai-response");
const { readProjectFields, validateGroups, synchronizeSecurityAlerts } = require("./sync-security-alerts");

function validateConfiguration(env) {
  if (!["codeql", "vulnerability", "malware"].includes(env.FEED)) throw new Error("Unsupported alert feed");
  if (!env.ROBOCOP_TOKEN) throw new Error("Missing RoboCop installation token for the chosen feed and issue writes");
  if (!env.PROJECT_TOKEN || env.PROJECT_TOKEN === env.ROBOCOP_TOKEN) throw new Error("A separate SECURITY_ALERTS_TOKEN is required for GitHub Projects");
  if (!env.PROJECT_ID) throw new Error("Missing repository variable SECURITY_ALERTS_PROJECT_ID");
  const config = payload({ ...env, ENABLE_WEB_SEARCH: "false" }, "");
  return { model: config.model, reasoning_effort: config.reasoning.effort, max_output_tokens: config.max_output_tokens };
}

async function validateProject(github, core, projectId) {
  const { fields, title } = await readProjectFields(github, projectId);
  for (const [name, options] of Object.entries({
    Status: ['Backlog', 'Done'], Domain: ['CI/CD'], 'Work type': ['Security'],
    Priority: ['P0', 'P1', 'P2'], Size: ['M'],
  })) {
    const field = fields.get(name);
    if (field?.dataType !== 'SINGLE_SELECT' || options.some(option => !field.options.some(value => value.name === option))) {
      throw new Error(`Project field/options unavailable: ${name}`);
    }
  }
  if (fields.get('Estimate')?.dataType !== 'NUMBER') throw new Error('Project numeric Estimate field unavailable.');
  if (fields.get('End date')?.dataType !== 'DATE') throw new Error('Project End date field unavailable.');
  core.info(`Validated Project access and schema: ${title}`);
}

async function collectAlerts(github, { owner, repo }, feed) {
  if (!["codeql", "vulnerability", "malware"].includes(feed)) throw new Error("Unsupported alert feed");
  const compactCodeqlAlert = (alert) => ({
    ref: `code-scanning:${alert.number}`,
    url: alert.html_url,
    rule: alert.rule?.id ?? 'unknown-rule',
    severity: alert.rule?.security_severity_level ?? alert.rule?.severity ?? 'unknown',
    description: alert.rule?.description ?? alert.rule?.name ?? 'No description supplied.',
    location: alert.most_recent_instance?.location?.path ?? 'unknown location',
  });
  const compactDependabotAlert = (alert) => ({
    ref: `dependabot:${alert.number}`,
    url: alert.html_url,
    ghsa: alert.security_advisory?.ghsa_id ?? 'unknown-advisory',
    severity: alert.security_advisory?.severity ?? 'unknown',
    package: alert.dependency?.package?.name ?? 'unknown-package',
    ecosystem: alert.dependency?.package?.ecosystem ?? 'unknown-ecosystem',
    manifest: alert.dependency?.manifest_path ?? 'unknown manifest',
    summary: alert.security_advisory?.summary ?? alert.security_advisory?.description ?? 'No summary supplied.',
  });

  if (feed === "codeql") {
    const results = await github.paginate(github.rest.codeScanning.listAlertsForRepo, { owner, repo, state: "open", per_page: 100 });
    return { feed, alerts: results.map(compactCodeqlAlert) };
  }
  const results = await github.paginate(github.rest.dependabot.listAlertsForRepo, { owner, repo, state: "open", per_page: 100 });
  const alerts = results.map(compactDependabotAlert);
  if (feed === "vulnerability") return { feed, alerts };
  const malwareGhsas = new Set();
  for (const ghsa of new Set(alerts.map(alert => alert.ghsa))) {
    const { data: advisory } = await github.request("GET /advisories/{ghsa_id}", {
      ghsa_id: ghsa, headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (advisory.ghsa_id !== ghsa || !["reviewed", "unreviewed", "malware"].includes(advisory.type)) {
      throw new Error(`Cannot classify source advisory ${ghsa}; no issues were changed.`);
    }
    if (advisory.type === "malware") malwareGhsas.add(ghsa);
  }
  return { feed, alerts: alerts.filter(alert => malwareGhsas.has(alert.ghsa)) };
}

async function writeSource({ github, context, core }) {
  const source = await collectAlerts(github, context.repo, process.env.FEED);
  fs.writeFileSync(path.join(process.env.RUNNER_TEMP, "security-alerts.json"), JSON.stringify(source));
  core.setOutput("has_alerts", String(source.alerts.length > 0));
  core.info(`Found ${source.alerts.length} open ${source.feed} alert(s).`);
}

function groupsFromDraft(source, draft, core) {
  if (!source.alerts.length) return [];
  const parsed = JSON.parse(draft);
  if (!Array.isArray(parsed?.groups) || parsed.groups.length > 25) throw new Error("Invalid model group inventory; no issues changed.");
  const { groups, recoveredRefs } = validateGroups(source, parsed.groups, { recoverOmissions: true });
  if (recoveredRefs.length) core.warning(`Recovered omitted alerts with source-linked groups: ${recoveredRefs.join(", ")}`);
  return groups;
}

async function reconcile({ issueGithub, projectGithub, context, core }) {
  const source = JSON.parse(fs.readFileSync(path.join(process.env.RUNNER_TEMP, "security-alerts.json"), "utf8"));
  const groups = groupsFromDraft(source, process.env.LLM_OUTPUT, core);
  await synchronizeSecurityAlerts({ issueGithub, projectGithub, core, context, projectId: process.env.PROJECT_ID, source, groups });
}

if (require.main === module) {
  const config = validateConfiguration(process.env);
  for (const [key, value] of Object.entries(config)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

module.exports = { validateConfiguration, validateProject, collectAlerts, writeSource, reconcile };
