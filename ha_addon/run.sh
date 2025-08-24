#!/usr/bin/env bash
set -euo pipefail

# Read Home Assistant add-on options from /data/options.json
OPTIONS_FILE="/data/options.json"

PORT=8765
ADVERTISE_HOST=""
DEBUG_SERIAL="false"

if [ -f "$OPTIONS_FILE" ]; then
  # Use jq if available; otherwise fallback to simple grep parsing
  if command -v jq >/dev/null 2>&1; then
    PORT=$(jq -r '.port // 8765' "$OPTIONS_FILE")
    ADVERTISE_HOST=$(jq -r '.advertise_host // ""' "$OPTIONS_FILE")
    DEBUG_SERIAL=$(jq -r '.debug_serial // false' "$OPTIONS_FILE")
  else
    PORT=$(grep -oP '"port"\s*:\s*\K[0-9]+' "$OPTIONS_FILE" || echo 8765)
    ADVERTISE_HOST=$(grep -oP '"advertise_host"\s*:\s*"\K[^"]+' "$OPTIONS_FILE" || true)
    if grep -q '"debug_serial"\s*:\s*true' "$OPTIONS_FILE"; then DEBUG_SERIAL=true; fi
  fi
fi

export PORT
if [ -n "$ADVERTISE_HOST" ] && [ "$ADVERTISE_HOST" != "null" ]; then
  export ADVERTISE_HOST
fi
if [ "$DEBUG_SERIAL" = "true" ]; then
  export DEBUG_SERIAL=1
fi

echo "Starting ws-tcp-bridge on port ${PORT} (ADVERTISE_HOST=${ADVERTISE_HOST:-<auto>})"
exec node /usr/src/app/ws-tcp-bridge.js "$PORT"
