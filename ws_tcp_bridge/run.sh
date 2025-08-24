#!/usr/bin/with-contenv bashio
set -euo pipefail

PORT_CFG=$(bashio::config 'port')
ADV=$(bashio::config 'advertise_host')

export PORT=${PORT_CFG:-8765}
if [[ -n "${ADV}" ]]; then
  export ADVERTISE_HOST="${ADV}"
fi

exec node /opt/app/ws-tcp-bridge.js "$PORT"
