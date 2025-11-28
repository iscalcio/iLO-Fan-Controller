#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8055}"

curl -fsSL "$BASE_URL/api/auth/info" >/dev/null && echo "auth/info OK" || { echo "auth/info FAIL"; exit 1; }
curl -fsSL "$BASE_URL/api/sensors" >/dev/null && echo "sensors OK" || { echo "sensors FAIL"; exit 1; }
echo "Healthcheck OK"
