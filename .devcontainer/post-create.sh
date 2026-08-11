#!/usr/bin/env bash
set -euo pipefail

echo "[codespace] Installing extension-service dependencies..."
cd extension-service
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

echo "[codespace] Writing local .env from example (never commit .env)..."
if [[ ! -f .env ]]; then
  cp ../.devcontainer/env.codespace.example .env
  echo "[codespace] Created extension-service/.env from env.codespace.example"
else
  echo "[codespace] extension-service/.env already exists — left unchanged"
fi

cd ..
echo "[codespace] post-create done."
