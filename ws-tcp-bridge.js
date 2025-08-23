#!/usr/bin/env node

const net = require("net");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const { pathToFileURL } = require("url");
const path = require("path");
const fs = require("fs");
const { Module } = require("module");
const DEBUG = /^(1|true|yes|on)$/i.test(String(process.env.DEBUG_SERIAL || ""));
// Global cache for extracted prebuild info to avoid duplicate writes/races
global.__XZG_SERIAL_PREBUILD = global.__XZG_SERIAL_PREBUILD || null;
global.__XZG_SERIAL_PREBUILD_CLEANUP = global.__XZG_SERIAL_PREBUILD_CLEANUP || false;

function registerTempCleanup(dir) {
  try {
    if (!dir || global.__XZG_SERIAL_PREBUILD_CLEANUP) return;
    const clean = () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    };
    process.on("exit", clean);
    process.on("SIGINT", () => {
      try {
        clean();
      } catch {}
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      try {
        clean();
      } catch {}
      process.exit(0);
    });
    process.on("SIGHUP", () => {
      try {
        clean();
      } catch {}
      process.exit(0);
    });
    process.on("uncaughtException", (e) => {
      try {
        clean();
      } catch {}
      // rethrow after cleanup
      throw e;
    });
    global.__XZG_SERIAL_PREBUILD_CLEANUP = true;
  } catch {}
}
let BonjourCtor;
let SerialPortLib;
let serialPortResolvePromise = null;
try {
  const mod = require("bonjour-service");
  // Support both CJS and ESM default/named exports
  BonjourCtor = mod?.Bonjour || mod?.default || mod || null;
} catch (_) {
  BonjourCtor = null;
}
// Lazy resolver for serialport that supports both CJS and ESM builds
async function getSerialPort() {
  if (SerialPortLib) return SerialPortLib;
  if (!serialPortResolvePromise) {
    serialPortResolvePromise = (async () => {
      // In packaged mode, extract the right prebuild into a temp dir and point NODE_GYP_BUILD_PREBUILD there
      if (process.pkg) {
        try {
          const extracted = await ensureSerialportPrebuildExtracted();
          if (extracted && extracted.dir) process.env.NODE_GYP_BUILD_PREBUILD = extracted.dir;
          // Override node-gyp-build to return our extracted native binding directly
          if (extracted && extracted.file) {
            try {
              const loader = function () {
                try {
                  return require(extracted.file);
                } catch (e) {
                  console.warn("[serial][pkg] direct load failed:", String(e));
                  throw e;
                }
              };
              const toPatch = [];
              try {
                toPatch.push(require.resolve("node-gyp-build"));
              } catch {}
              try {
                const lb = require.resolve("@serialport/bindings-cpp/dist/load-bindings.js");
                const id2 = require.resolve("node-gyp-build", { paths: [path.dirname(lb)] });
                toPatch.push(id2);
              } catch {}
              try {
                const sp = require.resolve("serialport");
                const id3 = require.resolve("node-gyp-build", { paths: [path.dirname(sp)] });
                toPatch.push(id3);
              } catch {}
              for (const ngbId of Array.from(new Set(toPatch)).filter(Boolean)) {
                try {
                  const m = new Module(ngbId);
                  m.filename = ngbId;
                  m.loaded = true;
                  m.exports = function () {
                    return loader();
                  };
                  Module._cache[ngbId] = m;
                } catch (e) {
                  console.warn("[serial][pkg] patch node-gyp-build failed:", ngbId, String(e));
                }
              }
            } catch (e3) {
              process.env.DEBUG_SERIAL && console.warn("[serial][pkg] override node-gyp-build failed:", String(e3));
            }
          }
          // Note: do NOT prime require.cache for '@serialport/bindings-cpp'.
          // Serialport expects the JS wrapper (which exports autoDetect()),
          // and priming it with the native exports breaks that contract.
        } catch (e) {
          process.env.DEBUG_SERIAL && console.warn("[serial][pkg] prebuild extraction failed:", String(e));
        }
      }
      try {
        // Prefer CJS require
        const sp = require("serialport");
        // Some broken states may return an unexpected value; validate shape
        if (!sp || (typeof sp !== "function" && typeof sp.SerialPort !== "function" && typeof sp.list !== "function")) {
          throw new Error("serialport invalid export");
        }
        return sp;
      } catch (e) {
        // Fallback for ESM-only package (ERR_REQUIRE_ESM)
        if (e && (e.code === "ERR_REQUIRE_ESM" || /Cannot use import statement/.test(String(e)))) {
          try {
            const mod = await import("serialport");
            return mod?.default || mod;
          } catch (e2) {
            process.env.DEBUG_SERIAL && console.warn("[serial] dynamic import failed:", String(e2));
            return null;
          }
        }
        console.warn("[serial] require('serialport') failed:", String(e));
        // Last resort: try build a thin adapter around bindings-cpp using extracted native binding
        try {
          const extracted = process.pkg ? await ensureSerialportPrebuildExtracted() : null;
          if (extracted && extracted.file) {
            // Load bindings-cpp JS which will call our patched node-gyp-build and return binding classes
            const bindingsCpp = require("@serialport/bindings-cpp");
            const Stream = (() => {
              try {
                return require("@serialport/stream");
              } catch {
                return null;
              }
            })();
            const { autoDetect } = bindingsCpp || {};
            const Binding =
              typeof autoDetect === "function" ? autoDetect() : (bindingsCpp && bindingsCpp.Binding) || null;
            if (Binding && Stream && Stream.SerialPortStream) {
              // Construct SerialPort-compatible facade
              class SerialPortCompat extends Stream.SerialPortStream {}
              SerialPortCompat.Binding = Binding;
              return { SerialPort: SerialPortCompat, ...Stream };
            }
          }
        } catch (e3) {
          console.warn("[serial] fallback via bindings-cpp failed:", String(e3));
        }
        return null;
      }
    })().then((mod) => {
      SerialPortLib = mod;
      return mod;
    });
  }
  return serialPortResolvePromise;
}

// Synchronous extractor used by the global require hook
function ensureSerialportPrebuildExtractedSync() {
  try {
    if (global.__XZG_SERIAL_PREBUILD && fs.existsSync(global.__XZG_SERIAL_PREBUILD.file)) {
      return global.__XZG_SERIAL_PREBUILD;
    }
    const plat = process.platform;
    const arch = process.arch;
    let subdir = null;
    let filename = "node.napi.node";
    if (plat === "win32") {
      if (arch === "x64" || arch === "arm64" || arch === "ia32") {
        subdir = `win32-${arch}`;
      }
    } else if (plat === "darwin") {
      subdir = "darwin-x64+arm64";
    } else if (plat === "linux") {
      if (arch === "x64") {
        const isMusl = detectMusl();
        subdir = "linux-x64";
        filename = isMusl ? "node.napi.musl.node" : "node.napi.glibc.node";
      } else if (arch === "arm64") {
        subdir = "linux-arm64";
        filename = "node.napi.armv8.node";
      } else if (arch === "arm") {
        subdir = "linux-arm";
        filename = "node.napi.armv7.node";
      }
    }
    if (!subdir) return null;
    // External prebuilds next to exe/cwd
    const tryDirs = [];
    try {
      tryDirs.push(path.join(path.dirname(process.execPath), "prebuilds", subdir));
    } catch {}
    try {
      tryDirs.push(path.join(process.cwd(), "prebuilds", subdir));
    } catch {}
    for (const d of tryDirs) {
      try {
        const entries = fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith(".node"));
        if (entries && entries.length) {
          const file = path.join(d, entries[0]);
          return { dir: d, file };
        }
      } catch {}
    }
    // Snapshot prebuilds
    let bindingsPkgDir = null;
    try {
      bindingsPkgDir = path.dirname(require.resolve("@serialport/bindings-cpp/package.json"));
    } catch {}
    if (!bindingsPkgDir) {
      try {
        const entry = require.resolve("@serialport/bindings-cpp");
        bindingsPkgDir = path.join(path.dirname(entry), "..");
      } catch {}
    }
    if (!bindingsPkgDir) return null;
    const prebuildDir = path.join(bindingsPkgDir, "prebuilds", subdir);
    let chosen = path.join(prebuildDir, filename);
    if (!fs.existsSync(chosen)) {
      try {
        const list = fs.readdirSync(prebuildDir).filter((f) => f.toLowerCase().endsWith(".node"));
        if (list && list.length) chosen = path.join(prebuildDir, list[0]);
      } catch {}
    }
    if (!fs.existsSync(chosen)) return null;
    const data = fs.readFileSync(chosen);
    // Use a per-process folder to avoid cross-run locking conflicts
    const outDir = path.join(os.tmpdir(), "xzg-serial-bridge-prebuilds", `${plat}-${arch}-${process.pid}`);
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch {}
    const outFile = path.join(outDir, "node.napi.node");
    try {
      if (!fs.existsSync(outFile)) {
        fs.writeFileSync(outFile, data);
      }
    } catch {
      // If we cannot write but the file exists, try to use it
      if (!fs.existsSync(outFile)) return null;
    }
    const result = { dir: outDir, file: outFile };
    global.__XZG_SERIAL_PREBUILD = result;
    return result;
  } catch {
    return null;
  }
}

// Global hook to ensure any 'node-gyp-build' import gets a callable that returns our extracted binding
if (process.pkg && !global.__XZG_NGB_HOOKED) {
  global.__XZG_NGB_HOOKED = true;
  try {
    const origReq = Module.prototype.require;
    Module.prototype.require = function patchedRequire(id) {
      if (id === "node-gyp-build" || id === "node-gyp-build/index.js") {
        // node-gyp-build modules typically export a function that accepts an optional directory
        // but our loader doesn't need the dir, it always returns the extracted binding.
        const extracted = ensureSerialportPrebuildExtractedSync();
        const loader = () => {
          if (!extracted || !extracted.file) throw new Error("prebuild not prepared");
          return origReq.call(this, extracted.file);
        };
        const fn = function (_dir) {
          return loader();
        };
        return fn;
      }
      return origReq.apply(this, arguments);
    };
    if (DEBUG) console.log("[serial][pkg] node-gyp-build hook installed");
  } catch (e) {
    if (DEBUG) console.warn("[serial][pkg] failed to install node-gyp-build hook:", String(e));
  }
}

// Extract the correct @serialport/bindings[-cpp] prebuild from packaged assets to a temp dir
async function ensureSerialportPrebuildExtracted() {
  if (global.__XZG_SERIAL_PREBUILD && fs.existsSync(global.__XZG_SERIAL_PREBUILD.file)) {
    if (DEBUG) console.log("[serial][pkg] using cached prebuild:", global.__XZG_SERIAL_PREBUILD.file);
    return global.__XZG_SERIAL_PREBUILD;
  }
  // Decide subdir and filename inside bindings-cpp/prebuilds
  const plat = process.platform; // 'win32' | 'linux' | 'darwin'
  const arch = process.arch; // 'x64' | 'arm64' | ...
  let subdir = null;
  let filename = "node.napi.node";
  if (plat === "win32") {
    if (arch === "x64" || arch === "arm64" || arch === "ia32") {
      subdir = `win32-${arch}`;
    }
  } else if (plat === "darwin") {
    // universal binary in darwin-x64+arm64
    subdir = "darwin-x64+arm64";
  } else if (plat === "linux") {
    if (arch === "x64") {
      const isMusl = detectMusl();
      subdir = "linux-x64";
      filename = isMusl ? "node.napi.musl.node" : "node.napi.glibc.node";
    } else if (arch === "arm64") {
      subdir = "linux-arm64";
      filename = "node.napi.armv8.node";
    } else if (arch === "arm") {
      subdir = "linux-arm";
      // pick armv7 as a safer default; @serialport has both v6 and v7
      filename = "node.napi.armv7.node";
    }
  }
  if (!subdir) {
    console.log("[serial][pkg] unsupported platform/arch for prebuilds:", { plat, arch });
    return null;
  }
  // First, try to use an existing external prebuild placed next to the exe or in cwd
  const externalDirs = [];
  try {
    externalDirs.push(path.join(path.dirname(process.execPath), "prebuilds", subdir));
  } catch {}
  try {
    externalDirs.push(path.join(process.cwd(), "prebuilds", subdir));
  } catch {}
  for (const d of externalDirs) {
    try {
      const entries = fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith(".node"));
      if (entries && entries.length) {
        const file = path.join(d, entries[0]);
        console.log("[serial][pkg] using external prebuild:", file);
        return { dir: d, file };
      }
    } catch {}
  }
  // Resolve path to packaged asset inside snapshot
  let bindingsPkgDir = null;
  let bindingsPkgName = null; // '@serialport/bindings-cpp' or '@serialport/bindings'
  try {
    const pkgJsonPath = require.resolve("@serialport/bindings-cpp/package.json");
    bindingsPkgDir = path.dirname(pkgJsonPath);
    bindingsPkgName = "@serialport/bindings-cpp";
  } catch {}
  if (!bindingsPkgDir) {
    try {
      const pkgJsonPath2 = require.resolve("@serialport/bindings/package.json");
      bindingsPkgDir = path.dirname(pkgJsonPath2);
      bindingsPkgName = "@serialport/bindings";
    } catch {}
  }
  // Fallback: resolve by JS entrypoint and go up one level
  if (!bindingsPkgDir) {
    try {
      const entry = require.resolve("@serialport/bindings-cpp");
      bindingsPkgDir = path.join(path.dirname(entry), "..");
      bindingsPkgName = "@serialport/bindings-cpp";
    } catch {}
  }
  if (!bindingsPkgDir) {
    try {
      const entry = require.resolve("@serialport/bindings");
      bindingsPkgDir = path.join(path.dirname(entry), "..");
      bindingsPkgName = "@serialport/bindings";
    } catch {}
  }
  if (!bindingsPkgDir) {
    console.log("[serial][pkg] bindings package dir not found in snapshot");
    return null;
  }
  const prebuildDir = path.join(bindingsPkgDir, "prebuilds", subdir);
  if (DEBUG) console.log("[serial][pkg] looking for prebuild in:", prebuildDir);
  let chosenFile = path.join(prebuildDir, filename);
  // If default filename not found, scan directory for any suitable .node
  if (!fs.existsSync(chosenFile)) {
    try {
      const entries = fs.readdirSync(prebuildDir).filter((f) => f.toLowerCase().endsWith(".node"));
      if (entries && entries.length) {
        // Prefer musl/glibc match on linux
        if (process.platform === "linux") {
          const isMusl = detectMusl();
          const musl = entries.find((f) => f.includes("musl"));
          const glibc = entries.find((f) => f.includes("glibc"));
          if (isMusl && musl) chosenFile = path.join(prebuildDir, musl);
          else if (!isMusl && glibc) chosenFile = path.join(prebuildDir, glibc);
          else chosenFile = path.join(prebuildDir, entries[0]);
        } else {
          chosenFile = path.join(prebuildDir, entries[0]);
        }
      }
    } catch {}
  }
  // Fallback: try bundled static folder under __dirname/serialprebuilds
  if (!fs.existsSync(chosenFile)) {
    const altPrebuildDir = path.join(__dirname, "serialprebuilds", subdir);
    if (DEBUG) console.log("[serial][pkg] fallback prebuild lookup in:", altPrebuildDir);
    let alt = path.join(altPrebuildDir, filename);
    if (!fs.existsSync(alt)) {
      try {
        const entries = fs.readdirSync(altPrebuildDir).filter((f) => f.toLowerCase().endsWith(".node"));
        if (entries && entries.length) {
          alt = path.join(altPrebuildDir, entries[0]);
        }
      } catch {}
    }
    if (fs.existsSync(alt)) chosenFile = alt;
  }
  if (!fs.existsSync(chosenFile)) {
    console.warn("[serial][pkg] no prebuild found in:", prebuildDir, "and no fallback in serialprebuilds");
    return null;
  }
  if (DEBUG) console.log("[serial][pkg] selected prebuild file:", chosenFile);
  const data = fs.readFileSync(chosenFile);
  // Write to a stable temp dir
  const baseTmp = path.join(os.tmpdir(), "xzg-serial-bridge-prebuilds");
  try {
    fs.mkdirSync(baseTmp, { recursive: true });
  } catch {}
  // Use a per-process folder to avoid cross-run locking conflicts
  const outDir = path.join(baseTmp, `${plat}-${arch}-${process.pid}`);
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch {}
  const outFile = path.join(outDir, "node.napi.node");
  try {
    if (!fs.existsSync(outFile)) {
      fs.writeFileSync(outFile, data);
    }
  } catch (e) {
    // If write failed due to being locked but the file exists, reuse it
    if (!fs.existsSync(outFile)) {
      if (DEBUG) console.warn("[serial][pkg] write prebuild failed:", String(e));
      return null;
    }
  }
  const result = { dir: outDir, file: outFile, pkg: bindingsPkgName };
  global.__XZG_SERIAL_PREBUILD = result;
  registerTempCleanup(outDir);
  // No mirroring next to the exe or cwd; we keep everything in temp and load via the hook
  if (DEBUG) console.log("[serial][pkg] prepared prebuilds:", { temp: outFile, pkg: bindingsPkgName });
  return result;
}

function detectMusl() {
  try {
    if (process.report && typeof process.report.getReport === "function") {
      const rep = process.report.getReport();
      const glibc = rep && rep.header && rep.header.glibcVersionRuntime;
      return !glibc;
    }
  } catch {}
  // Fallback heuristic
  return false;
}

const WS_PORT = Number(process.argv[2] || 8765);

// --- Global store of opened SerialPort instances ---
const openSerialPorts = new Map(); // path -> SerialPort instance
// Reverse mapping of local TCP server port to the serial path
const tcpPortToSerialPath = new Map(); // tcpPort -> path

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname === "/mdns") {
      if (!BonjourCtor) {
        console.warn("[mdns] bonjour-service not installed; cannot scan");
        res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ error: "bonjour-service not installed" }));
      }
      const typesParam = u.searchParams.get("types");
      const timeout = Math.max(500, Math.min(10000, Number(u.searchParams.get("timeout")) || 2000));
      const types = (typesParam || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const normalized = types.map((t) => parseServiceType(t)).filter(Boolean);
      const wantsLocalSerial = types.some((t) => isLocalSerialToken(t));
      // console.log(
      //   "[mdns] request types=",
      //   types,
      //   "normalized=",
      //   normalized,
      //   "localSerial=",
      //   wantsLocalSerial,
      //   "timeout=",
      //   timeout
      // );
      const results = await scanMdns(normalized, timeout);
      if (wantsLocalSerial) {
        const locals = await listLocalSerialAsServices();
        results.push(...locals);
      }
      console.log("[mdns] scan done, found", results.length);
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      return res.end(JSON.stringify({ devices: results }));
    }

    // --- Endpoint to control DTR/RTS on a local serial port ---
    if (u.pathname === "/sc") {
      const SerialPortLib = await getSerialPort();
      if (!SerialPortLib) {
        res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ error: "serialport not installed" }));
      }
      // Accept either a serial path or the TCP port of a local TCP server bound to a serial
      let path = u.searchParams.get("path");
      const tcpPortStr = u.searchParams.get("port");
      const tcpPort = tcpPortStr ? Number(tcpPortStr) : null;
      if (!path && tcpPort) {
        path = tcpPortToSerialPath.get(tcpPort) || null;
      }
      const dtr = u.searchParams.get("dtr");
      const rts = u.searchParams.get("rts");
      if (!path || (dtr === null && rts === null)) {
        res.writeHead(400, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ error: "Missing path/tcpPort or dtr/rts param" }));
      }
      let serial = openSerialPorts.get(path);
      if (!serial) {
        try {
          const SP = SerialPortLib.SerialPort || SerialPortLib;
          serial = new SP({ path, baudRate: 115200, autoOpen: true });
          openSerialPorts.set(path, serial);
        } catch (e) {
          res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
          return res.end(JSON.stringify({ error: "Failed to open serial port", details: String(e) }));
        }
      }
      const setObj = {};
      if (dtr !== null) setObj.dtr = dtr === "1" || dtr === "true";
      if (rts !== null) setObj.rts = rts === "1" || rts === "true";
      serial.set(setObj, (err) => {
        if (err) {
          res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
          return res.end(JSON.stringify({ error: "Failed to set DTR/RTS", details: String(err) }));
        }
        res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
        return res.end(JSON.stringify({ ok: true, path, tcpPort: tcpPort || tcpPortFromPath(path), set: setObj }));
      });
      return;
    }
  } catch (e) {
    console.error("[mdns] handler error:", e);
    try {
      res.writeHead(500, { "content-type": "application/json", "access-control-allow-origin": "*" });
      return res.end(JSON.stringify({ error: String(e) }));
    } catch {}
  }
});
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

const ADVERTISE_HOST = process.env.ADVERTISE_HOST || null;

function getPrimaryIPv4() {
  try {
    const ifaces = os.networkInterfaces();
    const prefer = ["en0", "en1", "eth0", "wlan0"]; // macOS often en0
    // Prefer common primary interfaces first
    for (const name of prefer) {
      const arr = ifaces[name];
      if (!arr) continue;
      const hit = arr.find((x) => x && x.family === "IPv4" && !x.internal);
      if (hit?.address) return hit.address;
    }
    // Otherwise, return the first external IPv4
    for (const arr of Object.values(ifaces)) {
      const hit = (arr || []).find((x) => x && x.family === "IPv4" && !x.internal);
      if (hit?.address) return hit.address;
    }
  } catch {}
  return "127.0.0.1";
}

function getAdvertiseHost() {
  return ADVERTISE_HOST || getPrimaryIPv4();
}

wss.on("connection", (ws, req) => {
  try {
    // Reduce latency on the WebSocket TCP socket (disable Nagle)
    ws?._socket?.setNoDelay?.(true);
    ws?._socket?.setKeepAlive?.(true, 5000);
  } catch {}
  const url = new URL(req.url, `http://${req.headers.host}`);
  const host = url.searchParams.get("host");
  const port = Number(url.searchParams.get("port"));
  if (!host || !port) {
    ws.close(1008, "Missing host/port");
    return;
  }

  const sock = net.createConnection({ host, port }, () => {
    try {
      sock.setNoDelay(true);
    } catch {}
    // ok
  });

  sock.on("data", (chunk) => {
    try {
      ws.readyState === WebSocket.OPEN && ws.send(chunk);
    } catch {}
  });
  sock.on("error", (err) => {
    try {
      ws.close(1011, String(err));
    } catch {}
  });
  sock.on("close", () => {
    try {
      ws.close(1000);
    } catch {}
  });

  ws.on("message", (data) => {
    if (Buffer.isBuffer(data)) sock.write(data);
    else if (typeof data === "string") sock.write(Buffer.from(data, "binary"));
  });
  ws.on("close", () => {
    try {
      sock.destroy();
    } catch {}
  });
});

server.listen(WS_PORT, "0.0.0.0", () => {
  console.log(`[bridge] listening ws://${getAdvertiseHost()}:${WS_PORT}`); // show the effective IP
  if (!BonjourCtor) {
    console.log("[mdns] bonjour-service unavailable.");
  } else {
    try {
      //console.log("[mdns] bonjour ctor resolved:", typeof BonjourCtor);
    } catch {}
  }
  // Startup summary: modules loaded status
  const wsOk = !!WebSocket;
  const bonjourOk = !!BonjourCtor;
  const onSerialReady = (sp) => {
    const serialOk = !!sp;
    console.log(
      `[startup] modules: ws=${wsOk ? "ok" : "missing"}, bonjour=${bonjourOk ? "ok" : "missing"}, serial=${
        serialOk ? "ok" : "missing"
      }`
    );
  };
  if (process.pkg) {
    // Prepare prebuild and warm serial
    ensureSerialportPrebuildExtracted()
      .then(() => getSerialPort())
      .then(onSerialReady)
      .catch((e) => {
        if (DEBUG) console.warn("[serial][pkg] startup extraction error:", String(e));
        onSerialReady(null);
      });
  } else {
    getSerialPort()
      .then(onSerialReady)
      .catch(() => onSerialReady(null));
  }
});

function parseServiceType(full) {
  // e.g. _zigstar_gw._tcp.local. -> { type: 'zigstar_gw', protocol: 'tcp' }
  try {
    // Special token(s) to request local serial exposure
    if (isLocalSerialToken(full)) return { type: "local", protocol: "serial" };
    const m = full.match(/^_([^.]+)\._(tcp|udp)(?:\.|$)/i);
    if (!m) return null;
    //console.log("[mdns] parse type:", full, "=>", { type: m[1], protocol: m[2].toLowerCase() });
    return { type: m[1], protocol: m[2].toLowerCase() };
  } catch {
    return null;
  }
}

function isLocalSerialToken(s) {
  return ["local.serial", "local:serial", "local-serial", "local"]
    .map((x) => x.toLowerCase())
    .includes(String(s || "").toLowerCase());
}

async function scanMdns(typeList, timeoutMs) {
  return await new Promise((resolve) => {
    console.log("[mdns] scanning with timeout", timeoutMs); //, typeList,
    const bonjour = new BonjourCtor();
    const found = new Map();
    const browsers = [];
    const onUp = (svc, base) => {
      try {
        const ip = svc?.addresses?.[0] || svc?.host;
        const board = svc?.txt?.board || "";
        const serialNum = svc?.txt?.serial_number || "";
        console.log(`[mdns] found: ${base?.type} on ${ip}:${svc?.port} (${board}, ${serialNum})`);
        const key = `${svc.name}|${svc.host}|${svc.port}`;
        if (found.has(key)) return;
        const addr =
          (svc.addresses || []).find((a) => /\d+\.\d+\.\d+\.\d+/.test(a)) || (svc.addresses || [])[0] || svc.host;
        found.set(key, {
          name: svc.name || "",
          host: addr || svc.host || "",
          port: svc.port || 0,
          type: base.type,
          protocol: base.protocol,
          fqdn: svc.fqdn || "",
          txt: svc.txt || {},
        });
      } catch {}
    };
    for (const t of typeList) {
      try {
        const finder = bonjour.find || bonjour.browse || bonjour.findServices;
        if (!finder) {
          console.warn("[mdns] no find/browse API on bonjour instance");
          continue;
        }
        const b = finder.call(bonjour, { type: t.type, protocol: t.protocol });
        b.on("up", (svc) => onUp(svc, t));
        b.on("error", (err) => console.error("[mdns] browser error:", err));
        try {
          if (typeof b.start === "function") {
            b.start();
            //console.log("[mdns] started browser for", t);
          } else {
            console.log("[mdns] browser auto-start for", t);
          }
        } catch (e) {
          console.warn("[mdns] start error for", t, e);
        }
        browsers.push(b);
      } catch {}
    }
    const done = () => {
      try {
        for (const b of browsers) {
          try {
            b.stop();
          } catch {}
        }
      } catch {}
      try {
        bonjour.destroy();
      } catch {}
      const arr = Array.from(found.values());
      console.log("[mdns] done; returning", arr.length, "services");
      resolve(arr);
    };
    setTimeout(done, timeoutMs);
  });
}

// --- Local Serial exposure ---
const serialServers = new Map(); // path -> { server, port }

async function listLocalSerialAsServices() {
  const SerialPortLib = await getSerialPort();
  if (!SerialPortLib) {
    console.warn("[serial] serialport not installed; skipping local serial exposure");
    return [];
  }
  let ports = [];
  try {
    const maybeSerialPort = SerialPortLib.SerialPort || SerialPortLib; // compat
    if (typeof maybeSerialPort.list === "function") {
      ports = await maybeSerialPort.list();
    } else if (typeof SerialPortLib.list === "function") {
      ports = await SerialPortLib.list();
    } else {
      console.warn("[serial] no list() available on serialport lib");
      return [];
    }
  } catch (e) {
    console.warn("[serial] list() failed:", e);
    return [];
  }
  const services = [];
  const hostIp = getAdvertiseHost(); // use the actual advertised IP
  for (const p of ports) {
    const path = p.path || p.comName || p.device || p.port || p.friendlyName;
    if (!path) continue;
    const portInfo = await ensureSerialTcpServer(path, 115200 /* default baud */);
    services.push({
      name: path,
      host: hostIp, // instead of "0.0.0.0"
      port: portInfo.port,
      type: "local",
      protocol: "serial",
      fqdn: path,
      txt: {
        board: p.manufacturer || p.productId || "",
        serial_number: p.serialNumber || "",
        vendor_id: p.vendorId || "",
        product_id: p.productId || "",
      },
    });
  }
  return services;
}

async function ensureSerialTcpServer(path, baudRate) {
  // Ensure SerialPort is resolved prior to accepting connections
  const SerialPortLib = await getSerialPort();
  if (serialServers.has(path)) return serialServers.get(path);
  const server = net.createServer();
  let boundPort = null;
  server.on("connection", (socket) => {
    console.log("[serial] client connected for", path);
    let serial;
    try {
      const SP = (SerialPortLib && (SerialPortLib.SerialPort || SerialPortLib)) || null;
      if (!SP) throw new Error("serialport unavailable");
      serial = new SP({ path, baudRate, autoOpen: true });
      openSerialPorts.set(path, serial); // keep for DTR/RTS control
    } catch (e) {
      console.error("[serial] open failed", path, e);
      try {
        socket.destroy(e);
      } catch {}
      return;
    }
    const onSerialData = (data) => {
      try {
        socket.write(data);
      } catch {}
    };
    const onSockData = (data) => {
      try {
        serial.write(data);
      } catch {}
    };
    serial.on("data", onSerialData);
    socket.on("data", onSockData);
    const safeOff = (emitter, event, handler) => {
      try {
        if (!emitter) return;
        if (typeof emitter.off === "function") emitter.off(event, handler);
        else if (typeof emitter.removeListener === "function") emitter.removeListener(event, handler);
      } catch {}
    };
    let cleaned = false;
    const cleanup = (reason) => {
      if (cleaned) return;
      cleaned = true;
      // Detach listeners first to avoid re-entrant calls
      safeOff(serial, "data", onSerialData);
      safeOff(socket, "data", onSockData);
      safeOff(socket, "close", onSocketClose);
      safeOff(socket, "error", onSocketError);
      safeOff(serial, "error", onSerialError);
      safeOff(serial, "close", onSerialClose);
      try {
        if (serial && typeof serial.close === "function" && serial.isOpen) {
          serial.close();
        }
      } catch {}
      try {
        socket && socket.destroy && socket.destroy();
      } catch {}
      openSerialPorts.delete(path); // remove from the store
      console.log("[serial] connection closed for", path, reason ? `(reason: ${reason})` : "");
    };
    const onSocketClose = () => cleanup("socket close");
    const onSocketError = () => cleanup("socket error");
    const onSerialError = () => cleanup("serial error");
    const onSerialClose = () => cleanup("serial close");
    socket.on("close", onSocketClose);
    socket.on("error", onSocketError);
    serial.on("error", onSerialError);
    serial.on && serial.on("close", onSerialClose);
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  boundPort = server.address().port;
  console.log("[serial] TCP server for", path, "listening on", boundPort);
  const info = { server, port: boundPort, baudRate };
  serialServers.set(path, info);
  try {
    tcpPortToSerialPath.set(boundPort, path);
  } catch {}
  return info;
}

function tcpPortFromPath(path) {
  try {
    const info = serialServers.get(path);
    return info?.port || null;
  } catch {
    return null;
  }
}
