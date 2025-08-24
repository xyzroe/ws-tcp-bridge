#!/usr/bin/with-contenv bashio
set -euo pipefail

# Get configuration from options
PORT_CFG=$(bashio::config 'port' '8765')
ADV_HOST=$(bashio::config 'advertise_host' '')

# Set environment variables
export PORT="${PORT_CFG}"
if [[ -n "${ADV_HOST}" ]]; then
  export ADVERTISE_HOST="${ADV_HOST}"
fi

# Log configuration
bashio::log.info "Starting WS TCP Bridge on port ${PORT}"
if [[ -n "${ADV_HOST}" ]]; then
  bashio::log.info "Advertise host: ${ADV_HOST}"
fi

# Start the application
exec node /opt/app/ws-tcp-bridge.js "${PORT}"
