# ws-tcp-bridge

<div align="center"> 
<a href="https://github.com/xyzroe/ws-tcp-bridge/releases"><img src="https://img.shields.io/github/release/xyzroe/ws-tcp-bridge.svg" alt="GitHub version"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/actions/workflows/build-binaries.yml"><img src="https://img.shields.io/github/actions/workflow/status/xyzroe/ws-tcp-bridge/build-binaries.yml" alt="GitHub Actions Workflow Status"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/releases/latest"><img src="https://img.shields.io/github/downloads/xyzroe/ws-tcp-bridge/total.svg" alt="GitHub download"></img></a>
<a href="https://github.com/xyzroe/ws-tcp-bridge/issues"><img src="https://img.shields.io/github/issues/xyzroe/ws-tcp-bridge" alt="GitHub Issues or Pull Requests"></img></a>
<a href="LICENSE"><img src="https://img.shields.io/github/license/xyzroe/ws-tcp-bridge.svg" alt="License"></img></a>
</div>
  
  
  
Tiny WebSocket ↔ TCP bridge for local development. It can also discover devices via mDNS and expose local serial ports over TCP for quick tests.

Warning: development helper only. Don’t expose it to the public Internet.

## What it’s for

- Bridge a WebSocket client to any TCP host:port
- Optionally discover targets via mDNS
- Optionally expose each local serial port as a TCP server and control DTR/RTS

## Quick start — prebuilt binaries

No Node.js required. Download a ready-to-run binary from Releases, make it executable (Linux/macOS), and run. The port argument is optional; default is 8765.

- Releases: https://github.com/xyzroe/ws-tcp-bridge/releases

How to run:

- Windows:
  - Default: `ws-tcp-bridge.exe`
  - Custom port: `ws-tcp-bridge.exe 9000`
- Linux:
  1. `chmod +x ./ws-tcp-bridge`
  2. Default: `./ws-tcp-bridge`
     Custom port: `./ws-tcp-bridge 9000`
- macOS:
  1. `chmod +x ./ws-tcp-bridge`
  2. If blocked by Gatekeeper (unidentified developer), either:
     - Right‑click the app → Open → Open, or
     - Remove quarantine: `xattr -d com.apple.quarantine ./ws-tcp-bridge`
  3. Default: `./ws-tcp-bridge`
     Custom port: `./ws-tcp-bridge 9000`

Examples: `./ws-tcp-bridge` (uses 8765), `./ws-tcp-bridge 9000`

On start it prints the effective URL, e.g. `[bridge] listening ws://192.168.1.42:8765`.

## Quick start — Node.js

Requires Node.js >= 16.

1. Install deps: `npm install`
2. Run: `node ws-tcp-bridge.js 8765` (or `npm start` for the default 8765)

## Protocol: WebSocket ↔ TCP

- Server listens on `ws://0.0.0.0:<WS_PORT>`
- Connect your WS client to:
  `ws://<bridgeHost>:<WS_PORT>/?host=<TCP_HOST>&port=<TCP_PORT>`
- All WS frames are forwarded to the TCP socket; TCP data is sent back as WS binary frames.

Example (bridge to local TCP echo on 127.0.0.1:7000):
`ws://localhost:8765/?host=127.0.0.1&port=7000`

## HTTP endpoints

All responses include CORS headers.

### GET /mdns

Scan via mDNS and/or include local serial ports as “services”.

Query:

- `types`: comma‑separated service types, e.g. `_http._tcp`, `_zigstar_gw._tcp.local.`
  - To include local serial ports: any of `local.serial`, `local:serial`, `local-serial`, `local`
- `timeout`: scan time in ms (500–10000). Default 2000.

Response:

```
{ "devices": [
  { "name": "string", "host": "IPv4 or hostname", "port": 1234,
    "type": "_type_ or 'local'", "protocol": "tcp|udp|serial",
    "fqdn": "string", "txt": { "k": "v" } }
] }
```

Notes:

- When local serial is requested, each port is exposed as a TCP server on an ephemeral port bound to 0.0.0.0.
- The advertised `host` is `ADVERTISE_HOST` (if set) or your primary IPv4.
- Default serial speed: 115200.

### GET /sc

Set DTR/RTS on a local serial port.

Query (one of `path` or `port` is required):

- `path`: serial device path (e.g. `/dev/tty.usbserial-1410`, `COM3`)
- `port`: TCP port of the serial TCP server returned by `/mdns`
- `dtr`: `1|0|true|false` (optional)
- `rts`: `1|0|true|false` (optional)

Response:
`{ "ok": true, "path": "/dev/tty...", "tcpPort": 50123, "set": { "dtr": true, "rts": false } }`

## Serial over TCP (overview)

- Request local serial via `/mdns?types=local` to spin up per‑device TCP servers.
- To talk to a serial device via WS, connect to:
  `ws://<bridgeHost>:<WS_PORT>/?host=<advertisedHost>&port=<serialTcpPort>`

## Configuration

- `ADVERTISE_HOST`: override the host/IP in logs and `/mdns` serial entries
- Port is taken from the CLI arg (default 8765)

## Build your own binaries (optional)

This project uses `pkg` to produce self‑contained executables.

1. `npm install`
2. Build one or all targets:
   - `npm run build:pkg:mac`
   - `npm run build:pkg:linux`
   - `npm run build:pkg:win`
   - `npm run build:pkg:all`

Outputs go to `dist/`.

Legacy Windows 7 build (optional): `npm run build:legacy:win7` → `dist/win-legacy/ws-tcp-bridge.exe`.

## Notes

- Designed for local use; disable or firewall it in production networks.
- Nagle’s algorithm is disabled on WS and TCP sockets to reduce latency.

## License

MIT
