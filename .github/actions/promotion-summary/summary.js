"use strict";
const MARKER = "<!-- shared-promotion-summary:v1 -->";
const isProtected = pr => (pr.labels || []).some(l => ["jules", "codex"].includes(typeof l === "string" ? l : l.name));

async function pages(method, args, maximum = 30) {
  const rows = [];
  for (let page = 1; page <= maximum; page++) {
    const { data } = await method({ ...args, per_page: 100, page });
    if (!Array.isArray(data)) throw new Error("invalid_page");
    rows.push(...data);
    if (data.length < 100) return rows;
  }
  throw new Error("incomplete_inventory");
}
function classify(files) {
  const groups = { backend: 0, frontend: 0, authentication_email: 0, automation: 0, migrations: 0, dependencies: 0, configuration: 0, release: 0, documentation: 0, other: 0 };
  for (const file of files) {
    const names = [file.filename, file.previous_filename].filter(p => typeof p === "string");
    const codeNames = names.filter(p => !/\.md$/i.test(p));
    const hit = re => codeNames.some(p => re.test(p));
    let known = false;
    const add = (group, condition) => { if (condition) { groups[group]++; known = true; } };
    add("backend", hit(/^backend\//));
    add("frontend", hit(/^frontend\//));
    add("authentication_email", hit(/^(backend\/authentication\/|frontend\/src\/pages\/authentication\/)/));
    add("automation", hit(/^\.github\//));
    add("migrations", codeNames.some(p => /^backend\/.*\/migrations\/[^/]+\.py$/.test(p) && !p.endsWith("/__init__.py")));
    add("dependencies", hit(/(^|\/)(package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|environment\.ya?ml|pyproject\.toml|uv\.lock)$/));
    add("configuration", hit(/^\.github\/(workflows\/|workflow-write-grants\.json$|actions\/openai-chat\/policy\.cjs$)/) || hit(/(^|\/)(settings\.py|app\.json|compose[^/]*\.ya?ml|docker-compose[^/]*\.ya?ml|Dockerfile[^/]*|[^/]*\.conf|[^/]*\.env(?:\.[^/]*)?)$/));
    add("release", hit(/^(deploy\/|app-release\/|nginx\/|compose\.yml$|scripts\/.*(?:release|gateway|cutover)|\.github\/workflows\/(?:ci-deploy|deploy-gateway|promotion-summary)\.yml$)/));
    add("documentation", names.some(p => /\.md$/i.test(p)));
    if (!known) groups.other++;
  }
  return groups;
}
function render({ owner = "VanillaIceCube", repo, number, base, head, files }) {
  if (!Number.isSafeInteger(number) || number < 1 || !/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head) || !/^[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9-]+$/.test(owner)) throw new Error("invalid_identity");
  const groups = classify(files);
  const gateway = repo === "JudeAndrewAlabaInfrastructure";
  const labels = { backend: "Backend", frontend: "Frontend", authentication_email: "Authentication/email", automation: "GitHub automation", migrations: "Migrations", dependencies: "Dependencies", configuration: "Configuration", release: "Release", documentation: "Documentation", other: "Other" };
  const rows = Object.entries(groups).filter(([, count]) => count).map(([group, count]) => `| ${labels[group]} | ${count} |`);
  const changes = files.reduce((result, file) => { result.additions += Number.isSafeInteger(file.additions) ? file.additions : 0; result.deletions += Number.isSafeInteger(file.deletions) ? file.deletions : 0; return result; }, { additions: 0, deletions: 0 });
  const risks = [];
  if (groups.migrations) risks.push("Schema migration files changed: inspect operations and compatibility with retained data before promotion. File detection does not prove reversibility.");
  if (groups.dependencies) risks.push("Dependency inputs changed: verify supported runtime/peer compatibility and the independent vulnerability/malware checks.");
  if (groups.configuration || groups.release) risks.push("Configuration/release inputs changed: verify destination, readiness, capacity and credential-name requirements; no secret values are inspected here.");
  if (groups.automation) risks.push("Workflow/reviewer automation changed: verify event eligibility, permission boundaries and independent required checks; no release authorization is created by this summary.");
  if (groups.backend || groups.frontend) risks.push("Application files changed: run the relevant tests and confirm routing/authentication behavior for the reviewed images.");
  if (!risks.length) risks.push("No application, migration, dependency or release/configuration impact was detected by path rules. Other changes still require ordinary review.");
  return [MARKER, "## Production promotion impact", "", `Observed comparison for #${number}: \`env-prod@${base}\` → \`${head}\`.`,
    `Source: [GitHub target-branch comparison](https://github.com/${owner}/${repo}/compare/${base}...${head}).`, "",
    `${files.length} changed file(s), ${changes.additions} added / ${changes.deletions} removed lines. Categories overlap; renames include old and new paths.`, "",
    ...(rows.length ? ["| Observed area | Files |", "| --- | ---: |", ...rows] : ["No changed files in the current target comparison."]), "",
    "### Inferred review considerations", "", ...risks.map(r => `- ${r}`), "",
    "### Release and recovery", "",
    gateway ? "Infrastructure owns the gateway and shared release source. Preserve owner/branch authorization, maintenance locking, secret scanning and Required CI. Unchanged gateway configuration should retain the running gateway; application releases stay independent." : "Promote only the reviewed main source through the existing app pipeline. Verify immutable image/source identity and the companion app/gateway. Workflow/documentation-only changes do not justify an unnecessary runtime restart.",
    gateway ? "Before activation, identify the previous accepted gateway configuration/images and follow the documented gateway recovery guide. This summary does not authorize deployment, recovery, network recreation or application database changes." : "Before activation, identify the previous accepted release and complete recovery dependencies. Use the existing migration/generation guards and explicit data-safe recovery procedure; never restore an older database over newer committed data or assume every migration can roll back.",
    "", "This deterministic summary uses only current GitHub comparison metadata. It does not inspect secret values, PR prose or file contents; path-based risks are inferences, not scanner findings, approvals or proof of production acceptance. Missing or failed required checks remain blockers.",
  ].join("\n");
}
async function summarize({ github, context, core, number }) {
  const args = { ...context.repo, pull_number: number };
  const { data: pr } = await github.rest.pulls.get(args);
  if (pr.state !== "open" || pr.base.ref !== "env-prod" || pr.head.repo?.full_name !== `${context.repo.owner}/${context.repo.repo}` || isProtected(pr)) {
    core.info("Promotion summary skipped: closed, wrong target, fork or protected tracking item."); return { status: "skipped" };
  }
  const base = pr.base.sha, head = pr.head.sha;
  const verify = async () => {
    const { data: fresh } = await github.rest.pulls.get(args);
    if (fresh.state !== "open" || fresh.base.ref !== "env-prod" || fresh.base.sha !== base || fresh.head.sha !== head || fresh.head.repo?.full_name !== `${context.repo.owner}/${context.repo.repo}` || isProtected(fresh)) throw new Error("comparison_changed_or_protected");
  };
  const files = await pages(github.rest.pulls.listFiles, args);
  // GitHub caps PR file responses at3000. Refuse incomplete summaries.
  if (!Number.isSafeInteger(pr.changed_files) || files.length !== pr.changed_files || files.length >= 3000) throw new Error("incomplete_file_comparison");
  await verify();
  const body = render({ owner: context.repo.owner, repo: context.repo.repo, number, base, head, files });
  const { data: bot } = await github.rest.users.getByUsername({ username: "github-actions[bot]" });
  if (bot.login !== "github-actions[bot]" || bot.type !== "Bot" || !Number.isSafeInteger(bot.id)) throw new Error("bot_identity_unavailable");
  const comments = await pages(github.rest.issues.listComments, { ...context.repo, issue_number: number }, 20);
  const owned = comments.filter(c => c.user?.id === bot.id && c.user?.type === "Bot" && c.user?.login === bot.login && c.body?.startsWith(MARKER));
  if (owned.length > 1) throw new Error("duplicate_owned_summaries_require_review");
  await verify(); // Fresh labels and revision check immediately before each write.
  if (owned[0]?.body === body) return { status: "unchanged", comment_id: owned[0].id, base, head };
  const result = owned.length ? await github.rest.issues.updateComment({ ...context.repo, comment_id: owned[0].id, body }) : await github.rest.issues.createComment({ ...context.repo, issue_number: number, body });
  if (result.data?.body !== body || !result.data?.id) throw new Error("comment_write_unconfirmed");
  await verify();
  core.info(`Promotion summary ${owned.length ? "updated" : "created"} for verified comparison ${base}...${head}.`);
  return { status: owned.length ? "updated" : "created", comment_id: result.data.id, base, head };
}
// Workflow concurrency serializes all summary writers for this repository;
// local callers serialize too. Do not introduce another uncoordinated writer.
const pending = new Map();
async function run(args) {
  const key = JSON.stringify([args.context.repo, args.number]);
  const previous = pending.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => summarize(args));
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}
module.exports = { run, render, classify, pages, MARKER };
