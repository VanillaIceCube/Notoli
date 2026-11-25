const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

function setupLintBot(env, spawn = spawnSync) {
  if (!env.APP_SLUG) throw new Error("The Lint Eastwood GitHub App slug is unavailable.");
  const login = `${env.APP_SLUG}[bot]`;
  const account = spawn("gh", ["api", `/users/${login}`, "--jq", ".id"], { encoding: "utf8", env });
  if (account.status !== 0) throw new Error("GitHub bot account lookup failed.");
  const id = account.stdout.trim();
  if (!/^\d+$/.test(id)) throw new Error(`GitHub returned an invalid bot account ID for ${login}.`);
  if (!env.GH_TOKEN || !env.GITHUB_REPOSITORY) throw new Error("The GitHub push credential or repository is unavailable.");
  // Child-process errors may include arguments. Keep the credential out of diagnostics.
  const pushUrl = `https://x-access-token:${env.GH_TOKEN}@github.com/${env.GITHUB_REPOSITORY}.git`;
  const git = spawn("git", ["remote", "set-url", "--push", "origin", pushUrl], { stdio: "ignore" });
  if (git.status !== 0) throw new Error("Could not configure the Lint Eastwood Git push URL.");
  fs.appendFileSync(env.GITHUB_OUTPUT, `bot_email=${id}+${login}@users.noreply.github.com\n`);
}

if (require.main === module) {
  try {
    setupLintBot(process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { setupLintBot };
