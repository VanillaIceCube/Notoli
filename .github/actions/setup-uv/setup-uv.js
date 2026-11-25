const { spawnSync } = require("node:child_process");

// PyPI uv 0.13.8 manylinux x86_64 wheel, reviewed 2026-11-15.
// https://pypi.org/pypi/uv/0.13.8/json
const wheelUrl = "https://files.pythonhosted.org/packages/c5/32/52ee34636aea1ab3f8baeeae1c3599461b8cddfb379862cc72ac61b8d91c/" +
  "uv-0.13.8-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl";
const sha256 = "e18a57b8b352eb7c8feb317b9f6f533c8f0ad9673fd6cf34bbe3cf1a9f6a8984";

function install(env, spawn = spawnSync) {
  if (env.RUNNER_OS !== "Linux" || env.RUNNER_ARCH !== "X64") {
    throw new Error("setup-uv requires the reviewed Linux X64 wheel.");
  }
  const result = spawn("python", [
    "-m", "pip", "--isolated", "install", "--disable-pip-version-check",
    "--no-cache-dir", "--force-reinstall", "--no-deps", "--only-binary=:all:",
    "--require-hashes", "--no-index", wheelUrl + "#sha256=" + sha256,
  ], { stdio: "inherit" });
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
