#!/bin/sh
set -eu

dependency_hash="$(sha256sum package.json package-lock.json | sha256sum | awk '{print $1}')"
dependency_hash_file="node_modules/.notoli-dependency-hash"

if [ ! -f "$dependency_hash_file" ] || [ "$(cat "$dependency_hash_file")" != "$dependency_hash" ]; then
  echo "Installing frontend dependencies for the current package manifest..."
  npm ci
  printf '%s\n' "$dependency_hash" > "$dependency_hash_file"
fi

exec "$@"
