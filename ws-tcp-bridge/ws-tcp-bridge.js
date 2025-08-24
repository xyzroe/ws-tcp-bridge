// Entrypoint copied for add-on build context; uses the same code as project root.
// To avoid duplication drift, import from parent if available.
try {
  module.exports = require("../ws-tcp-bridge.js");
} catch (e) {
  // Fallback: if not available due to build context, include minimal shim to run root file when mounted
  require("../ws-tcp-bridge.js");
}
