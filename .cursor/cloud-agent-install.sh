#!/usr/bin/env bash
# Cursor Cloud Agent Build install step (.cursor/environment.json). Cursor
# re-runs it on every Build, possibly on previously prepared disk, so it must
# stay idempotent. See AGENTS.md § Running in a Cloud Agent.
set -euo pipefail

echo "node $(node -v), npm $(npm -v)"

# Same installs as the PR CI gate (.github/workflows/ci.yml).
npm ci
npm ci --prefix mvp/server

# apps/kite uses Bun and is not part of the CI gate: a Bun or Kite install
# failure warns instead of failing the Build.
BUN_VERSION=1.2.19
export PATH="$HOME/.bun/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
    || echo "warning: Bun install failed; Kite checks unavailable" >&2
fi
if command -v bun >/dev/null 2>&1; then
  npm run install:kite \
    || echo "warning: Kite install failed; Kite checks unavailable" >&2
fi
