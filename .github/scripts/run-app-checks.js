"use strict";

const { spawnSync } = require("node:child_process");

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { env: { ...process.env, ...env }, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  if (result.signal) console.error(`${command} stopped by ${result.signal}`);
  const status = result.status ?? 1;
  if (status !== 0) process.exitCode = status;
  return status === 0;
}

switch (process.argv[2]) {
  case "lint-frontend":
    run("npm", ["run", "format:check"]);
    run("npm", ["run", "lint:strict"]);
    break;
  case "lint-backend":
    run("uv", ["run", "--locked", "--only-group", "dev", "ruff", "check", "."]);
    run("uv", ["run", "--locked", "--only-group", "dev", "ruff", "format", "--check", "."]);
    break;
  case "test-frontend":
    if (run("npm", ["test", "--", "--maxWorkers=2"])) run("npm", ["run", "build"]);
    break;
  case "test-backend":
    run("uv", ["run", "--locked", "python", "manage.py", "test", "--verbosity=2"], { DJANGO_MCP_ENABLED: "0" });
    run("uv", ["run", "--locked", "python", "manage.py", "test", "apps.mcp", "--verbosity=2"], {
      DJANGO_MCP_ENABLED: "1",
      DJANGO_MCP_BASE_URL: "http://localhost:8000",
      DJANGO_MCP_SERVER_FACTORY: "apps.mcp.tools.server.create_server",
    });
    break;
  case "test-automation":
    if (!run(process.execPath, [".github/scripts/validate-workflows.js", "--audit"])) break;
    if (!run(process.execPath, [".github/scripts/validate-repository.js"])) break;
    if (!run("python3", ["deploy/production/build_bundle.py", "--check-parity"])) break;
    run("python3", ["-m", "unittest", "discover", "-s", "deploy/tests", "-v"]);
    run(process.execPath, [".github/scripts/run-automation-tests.js"]);
    break;
  default:
    throw new Error(`Unknown application check: ${process.argv[2]}`);
}
