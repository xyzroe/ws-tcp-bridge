# WS-TCP Bridge Home Assistant Add-on

This folder contains a Home Assistant Community Add-on wrapper for the `ws-tcp-bridge` project.

How it works:

- The add-on image runs the Node.js app `ws-tcp-bridge.js`.
- Configuration is exposed via the add-on options (`/data/options.json`), see `config.json`.

Options:

- port: TCP port for the WebSocket server (default 8765)
- advertise_host: optional IP to advertise instead of auto-detected
- debug_serial: enable debug logs for serial prebuild extraction
