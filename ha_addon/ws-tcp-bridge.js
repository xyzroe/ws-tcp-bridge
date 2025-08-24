// Entrypoint for the Home Assistant add-on build context.
// Reuse the project root implementation when available.
try {
  module.exports = require("../ws-tcp-bridge.js");
} catch (e) {
  require("../ws-tcp-bridge.js");
}
