#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/ops/compose-production.sh <docker-compose-arguments...>" >&2
  exit 2
fi

workspace_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$workspace_root"

compose=(
  docker compose
  -f compose.yml
  -f compose.crawler.yml
  -f compose.ops.yml
  -f compose.tunnel.yml
  --profile scheduled-crawler
  --profile ops
  --profile discord-bot
  --profile public-tunnel
)

"${compose[@]}" config --quiet
exec "${compose[@]}" "$@"
