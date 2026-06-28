#!/usr/bin/env bash
# Seed the runtime cache dirs from the baked /seed copy on first boot.
#
# When .scan_cache / .fii_cache are backed by named volumes (compose), the very
# first boot mounts them EMPTY over the image's baked dirs. We copy the seed in
# only if the target is empty, so:
#   • first ever boot  -> volume populated with the 18 baked ranges + FII history
#   • later boots       -> existing (newer) cache is kept untouched
set -euo pipefail

seed_if_empty() {
  local seed="$1" target="$2"
  mkdir -p "$target"
  if [ -d "$seed" ] && [ -z "$(ls -A "$target" 2>/dev/null)" ]; then
    echo "[entrypoint] seeding $target from $seed"
    cp -a "$seed/." "$target/"
  fi
}

seed_if_empty /seed/.scan_cache /app/.scan_cache
seed_if_empty /seed/.fii_cache  /app/.fii_cache

exec "$@"
