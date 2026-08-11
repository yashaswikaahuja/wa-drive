#!/usr/bin/env bash
set -euo pipefail

# Start local Postgres if docker is available
if command -v docker >/dev/null 2>&1; then
  echo "[codespace] Starting local Postgres..."
  docker compose -f .devcontainer/docker-compose.yml up -d postgres || true
  sleep 2
else
  echo "[codespace] docker not available — set DATABASE_URL yourself"
fi

echo "[codespace] Ready. Start API with:  cd extension-service && npm run dev"
echo "[codespace] Fill-plan debug logging: DEBUG_FILL_TRACE=1 (on by default in this branch profile)"
