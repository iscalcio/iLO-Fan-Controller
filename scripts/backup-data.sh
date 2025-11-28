#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

mkdir -p backups
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="backups/data-$TIMESTAMP.tar.gz"

tar -czf "$ARCHIVE" data || echo "Pasta 'data' não encontrada, criando arquivo vazio" && touch "$ARCHIVE"
echo "Backup criado: $ARCHIVE"
