#!/usr/bin/env bash
set -euo pipefail

REMOVE_VOLUMES=${1:-}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

if [[ "$REMOVE_VOLUMES" == "-v" ]]; then
  docker compose down -v
else
  docker compose down
fi
