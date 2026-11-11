#!/usr/bin/env bash
set -euo pipefail
archive="${RUNNER_TEMP:-/tmp}/actionlint-1.7.12.tar.gz"
curl --fail --silent --show-error --location --max-time 60 \
  https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  --output "$archive"
printf '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  %s\n' "$archive" | sha256sum --check
tool_dir="${RUNNER_TEMP:-/tmp}/infrastructure-tools"
mkdir -p "$tool_dir"
tar -xzf "$archive" -C "$tool_dir" actionlint
if [ -n "${GITHUB_PATH:-}" ]; then
  printf '%s\n' "$tool_dir" >> "$GITHUB_PATH"
else
  printf 'Installed actionlint in %s\n' "$tool_dir"
fi
