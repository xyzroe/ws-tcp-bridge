# Home Assistant Add-on: WS TCP Bridge

WebSocket ↔ TCP bridge with mDNS discovery and serial port support for Home Assistant.

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armv7 Architecture][armv7-shield]

## About

This add-on provides a WebSocket to TCP bridge service that allows you to:

- Bridge WebSocket clients to TCP servers
- Discover devices via mDNS
- Expose local serial ports over TCP
- Control DTR/RTS signals on serial ports

This is particularly useful for development and integration with various IoT devices and protocols.

## Installation

1. Navigate in your Home Assistant frontend to **Settings** → **Add-ons** → **Add-on Store**
2. Add this repository: `https://github.com/xyzroe/ws-tcp-bridge`
3. Install the "WS TCP Bridge" add-on
4. Configure the add-on (see Configuration section below)
5. Start the add-on

## Configuration

Add-on configuration:

```yaml
port: 8765
advertise_host: ""
```

### Option: `port`

The port for the WebSocket server (default: 8765).

### Option: `advertise_host`

Optional hostname or IP address to advertise in mDNS responses and logs. If not set, the primary network interface IP will be used.

## Usage

### Basic WebSocket to TCP Bridge

Connect your WebSocket client to:
```
ws://<home-assistant-ip>:<port>/?host=<target-host>&port=<target-port>
```

### mDNS Discovery

Make a GET request to discover devices:
```
http://<home-assistant-ip>:<port>/mdns?types=_zigstar_gw._tcp,local
```

### Serial Port Control

Set DTR/RTS signals on serial ports:
```
http://<home-assistant-ip>:<port>/sc?path=/dev/ttyUSB0&dtr=1&rts=0
```

## Support

Got questions?

You have several options to get them answered:

- The [Home Assistant Community Forum][forum]
- The Home Assistant [Discord Chat Server][discord]
- Join the [Reddit subreddit][reddit] in [/r/homeassistant][reddit]

In case you've found an bug, please [open an issue on our GitHub][issue].

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[discord]: https://discord.gg/c5DvZ4e
[forum]: https://community.home-assistant.io
[reddit]: https://reddit.com/r/homeassistant
[issue]: https://github.com/xyzroe/ws-tcp-bridge/issues
