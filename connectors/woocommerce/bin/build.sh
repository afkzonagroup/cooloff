#!/bin/sh
# Copies the shared data files and the compiled web component into the plugin,
# then (with --zip) creates cooloff.zip for upload to WordPress.
# Run from anywhere; needs `npm run build` to have been run in the repository root.
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
plugin="$here/cooloff"

if [ ! -f "$root/dist/component/define.js" ]; then
  echo "dist/ is missing: run 'npm run build' in $root first" >&2
  exit 1
fi

mkdir -p "$plugin/data"
cp "$root/data/labels.json" "$root/data/messages.json" "$plugin/data/"

rm -rf "$plugin/assets/cooloff"
mkdir -p "$plugin/assets/cooloff/core" "$plugin/assets/cooloff/component"
# Only the browser files: core and component JavaScript, no maps, no type declarations.
for dir in core component; do
  for file in "$root/dist/$dir"/*.js; do
    cp "$file" "$plugin/assets/cooloff/$dir/"
  done
done
cp "$root/LICENSE" "$root/NOTICE" "$plugin/"

if [ "${1:-}" = "--zip" ]; then
  (cd "$here" && rm -f cooloff.zip && zip -qr cooloff.zip cooloff -x 'cooloff/.DS_Store')
  echo "Wrote $here/cooloff.zip"
fi
