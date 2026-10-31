#!/usr/bin/env bash
set -euo pipefail

port="${INFORMED_NEWS_PORT:-3001}"
target="http://127.0.0.1:${port}"

tailscale serve --bg "${target}"
tailscale serve status
