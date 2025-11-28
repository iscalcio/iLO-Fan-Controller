#!/usr/bin/env bash
set -euo pipefail

SERVICE=${1:-}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

if [[ -n "$SERVICE" ]]; then
  docker compose logs -f "$SERVICE"
else
  docker compose logs -f
fi
