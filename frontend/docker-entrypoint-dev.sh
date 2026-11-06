#!/bin/sh
set -eu

if [ ! -f package.json ] || [ ! -f package-lock.json ]; then
  echo "Development startup requires package.json and package-lock.json" >&2
  exit 1
fi
mkdir -p node_modules
dependency_hash="$(sha256sum package.json package-lock.json | sha256sum | awk '{print $1}')"
stamp="node_modules/.dependency-manifests.sha256"
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$dependency_hash" ]; then
  echo "Installing development dependencies for current manifests..."
  npm ci
  printf '%s\n' "$dependency_hash" > "$stamp"
fi
exec "$@"
