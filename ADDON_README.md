# WS TCP Bridge Home Assistant Add-on Repository

This repository contains the Home Assistant add-on for WS TCP Bridge.

## Installation

1. Open your Home Assistant instance
2. Navigate to Settings → Add-ons → Add-on Store
3. Click on the 3-dot menu in the top right corner and select "Repositories"
4. Add this repository URL: `https://github.com/xyzroe/ws-tcp-bridge`
5. Find "WS TCP Bridge" in the add-on store and install it

## Add-ons

### WS TCP Bridge

WebSocket ↔ TCP bridge with mDNS discovery and serial port support.

**Features:**

- Bridge WebSocket clients to TCP servers
- Discover devices via mDNS
- Expose local serial ports over TCP
- Control DTR/RTS signals on serial ports

**Configuration:**

- `port`: WebSocket server port (default: 8765)
- `advertise_host`: Optional hostname/IP to advertise

## Support

For issues and feature requests, please visit the [GitHub repository](https://github.com/xyzroe/ws-tcp-bridge/issues).
