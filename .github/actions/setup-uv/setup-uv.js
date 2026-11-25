const { spawnSync } = require("node:child_process");

// PyPI uv 0.13.8 manylinux x86_64 wheel, reviewed 2026-11-15.
// https://pypi.org/pypi/uv/0.13.8/json
const requirement = "uv==0.13.8 --hash=sha256:e18a57b8b352eb7c8feb317b9f6f533c8f0ad9673fd6cf34bbe3cf1a9f6a8984\n";

function install(env, spawn = spawnSync) {
  if (env.RUNNER_OS !== "Linux" || env.RUNNER_ARCH !== "X64") {
    throw new Error("setup-uv requires the reviewed Linux X64 wheel.");
  }
  const result = spawn("python", [
    "-m", "pip", "--isolated", "install", "--disable-pip-version-check",
    "--no-cache-dir", "--force-reinstall", "--no-deps", "--only-binary=:all:",
    "--require-hashes", "--index-url", "https://pypi.org/simple", "--requirement", "/dev/stdin",
  ], { input: requirement, stdio: ["pipe", "inherit", "inherit"] });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (require.main === module) {
  try {
    process.exitCode = install(process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { install };
