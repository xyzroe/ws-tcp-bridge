# WS TCP Bridge Add-on

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armv7 Architecture][armv7-shield]

WebSocket ↔ TCP bridge with mDNS discovery and serial port support.

## About

This add-on provides a WebSocket to TCP bridge service that allows you to:

- Bridge WebSocket clients to TCP servers  
- Discover devices via mDNS
- Expose local serial ports over TCP
- Control DTR/RTS signals on serial ports

## Installation

The installation of this add-on is pretty straightforward and not different in comparison to installing any other Home Assistant add-on.

1. Search for "WS TCP Bridge" in the Supervisor add-on store and install it.
1. Start the "WS TCP Bridge" add-on.
1. Check the logs of the "WS TCP Bridge" add-on to see if everything went well.

## Configuration

```yaml
port: 8765
advertise_host: ""
```

### Option: `port`

The port for the WebSocket server.

### Option: `advertise_host`

Optional hostname or IP address to advertise in mDNS responses and logs.

## Changelog & Releases

This repository keeps a change log using [GitHub's releases][releases]
functionality.

Releases are based on [Semantic Versioning][semver], and use the format
of `MAJOR.MINOR.PATCH`. In a nutshell, the version will be incremented
based on the following:

- `MAJOR`: Incompatible or major changes.
- `MINOR`: Backwards-compatible new features and enhancements.
- `PATCH`: Backwards-compatible bugfixes and package updates.

## Support

Got questions?

You have several options to get them answered:

- The [Home Assistant Community Forum][forum].
- The Home Assistant [Discord Chat Server][discord] for general Home
  Assistant discussions and questions.
- Join the [Reddit subreddit][reddit] in [/r/homeassistant][reddit]

You could also [open an issue here][issue] GitHub.

## Authors & contributors

The original setup of this repository is by [xyzroe][xyzroe].

For a full list of all authors and contributors,
check [the contributor's page][contributors].

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[contributors]: https://github.com/xyzroe/ws-tcp-bridge/graphs/contributors
[discord]: https://discord.gg/c5DvZ4e
[forum]: https://community.home-assistant.io/
[issue]: https://github.com/xyzroe/ws-tcp-bridge/issues
[reddit]: https://reddit.com/r/homeassistant
[releases]: https://github.com/xyzroe/ws-tcp-bridge/releases
[semver]: http://semver.org/spec/v2.0.0.html
[xyzroe]: https://github.com/xyzroe
