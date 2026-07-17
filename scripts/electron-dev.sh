#!/usr/bin/env bash
# Always kill existing grok-build-desktop Electron/Vite, then start fresh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${VITE_PORT:-5175}"

echo "[electron:dev] stopping previous instances..."

# Electron for this app
pkill -f "${ROOT}/node_modules/electron" 2>/dev/null || true
pkill -f "Electron.app.*grok-build-desktop" 2>/dev/null || true

# Vite / concurrently leftover on project port
if command -v lsof >/dev/null 2>&1; then
  lsof -ti ":${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
fi

# Stray vite/wait-on for this package
pkill -f "vite.*${ROOT}|wait-on http://127.0.0.1:${PORT}" 2>/dev/null || true

sleep 0.5

echo "[electron:dev] building main process..."
npx tsc -p tsconfig.electron.json

echo "[electron:dev] starting Vite + Electron on :${PORT}..."
exec npx concurrently -k \
  "vite --host 127.0.0.1 --port ${PORT}" \
  "wait-on http://127.0.0.1:${PORT} && tsc -p tsconfig.electron.json && ELECTRON_DEV=1 VITE_DEV_SERVER_URL=http://127.0.0.1:${PORT} electron ."
