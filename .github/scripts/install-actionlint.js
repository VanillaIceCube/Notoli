"use strict";

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

async function install() {
  const version = "1.7.12";
  const url = `https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_linux_amd64.tar.gz`;
  const expectedHash = "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8";
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Actionlint download failed with HTTP ${response.status}`);

  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(archive).digest("hex") !== expectedHash) {
    throw new Error("Actionlint archive failed SHA-256 verification");
  }

  const toolDir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, "actionlint-"));
  execFileSync("tar", ["-xzf", "-", "-C", toolDir, "actionlint"], {
    input: archive, stdio: ["pipe", "inherit", "inherit"],
  });
  fs.appendFileSync(process.env.GITHUB_PATH, `${toolDir}\n`);
}

install().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
