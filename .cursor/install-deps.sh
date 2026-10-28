#!/usr/bin/env bash
# Idempotent Cloud Agent / local install: skip when lockfile hashes are unchanged.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HASH_FILE="${CURSOR_INSTALL_LOCK_HASH:-$ROOT/.cursor/.install-lock-hash}"

hash_lockfiles() {
  local files=(
    "$ROOT/package-lock.json"
    "$ROOT/mvp/server/package-lock.json"
    "$ROOT/apps/kite/bun.lock"
  )
  local existing=()
  local f
  for f in "${files[@]}"; do
    if [[ -f "$f" ]]; then
      existing+=("$f")
    fi
  done
  if [[ ${#existing[@]} -eq 0 ]]; then
    echo "no-lockfiles"
    return
  fi
  # Sort paths for stable hash across runs.
  printf '%s\0' "${existing[@]}" | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
}

CURRENT="$(hash_lockfiles)"
if [[ -f "$HASH_FILE" ]]; then
  PREV="$(tr -d '[:space:]' <"$HASH_FILE" || true)"
  if [[ -n "$PREV" && "$PREV" == "$CURRENT" ]]; then
    echo "install-deps: lockfile hash unchanged ($CURRENT); skipping install"
    exit 0
  fi
fi

echo "install-deps: installing (hash $CURRENT)"

if [[ -f "$ROOT/package-lock.json" ]]; then
  npm ci
fi

if [[ -f "$ROOT/mvp/server/package-lock.json" ]]; then
  npm ci --prefix mvp/server
fi

if [[ -f "$ROOT/apps/kite/bun.lock" ]]; then
  if ! command -v bun >/dev/null 2>&1; then
    echo "install bun 1.4.3" >&2
    exit 1
  fi
  bun install --frozen-lockfile --cwd apps/kite
fi

mkdir -p "$(dirname "$HASH_FILE")"
printf '%s\n' "$CURRENT" >"$HASH_FILE"
echo "install-deps: wrote $HASH_FILE"
