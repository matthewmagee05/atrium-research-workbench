#!/usr/bin/env node
/**
 * Fetch better-sqlite3 prebuilt binary matching this machine's hardware arch
 * AND the installed Electron's NODE_MODULE_VERSION. Standalone vs electron-rebuild:
 * we never invoke node-gyp (which fails on Rosetta-x64 Node by reporting success
 * while emitting an x64 binary), and we honour the true hardware arch via
 * `os.machine()` rather than Node's `process.arch` (which is wrong under Rosetta).
 *
 * Run after every npm install and before launching Electron when on Apple Silicon
 * with x64 Node. Safe to run multiple times.
 */
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

function log(msg) { process.stdout.write(`[install-native] ${msg}\n`); }

function hardwareArch() {
  // On macOS, detect the real hardware arch via sysctl. Both `process.arch` and
  // `os.machine()` lie under Rosetta (they report the emulated arch, not the CPU).
  if (process.platform === "darwin") {
    try {
      const out = execFileSync("sysctl", ["-n", "hw.optional.arm64"], { encoding: "utf8" }).trim();
      if (out === "1") return "arm64";
    } catch { /* sysctl unavailable, fall through */ }
    return "x64";
  }
  // On Linux/Windows, process.arch is reliable.
  return process.arch;
}

function findRoot(startDir) {
  // Walk up until we find package.json that declares workspaces (the monorepo root).
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.workspaces) return dir;
      } catch { /* ignore */ }
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

const desktopDir = path.resolve(__dirname, "..");
const root = findRoot(desktopDir);
const electronPkgPath = path.join(desktopDir, "node_modules", "electron", "package.json");
const electronPkgFallback = path.join(root, "node_modules", "electron", "package.json");
const electronPkg = fs.existsSync(electronPkgPath) ? electronPkgPath
  : fs.existsSync(electronPkgFallback) ? electronPkgFallback
  : null;
if (!electronPkg) {
  log("Electron isn't installed; nothing to do.");
  process.exit(0);
}
const electronVersion = JSON.parse(fs.readFileSync(electronPkg, "utf8")).version;
const arch = hardwareArch().toLowerCase().replace("aarch64", "arm64");
log(`Electron ${electronVersion} on ${process.platform}/${arch}`);

const sqliteDir = path.join(root, "node_modules", "better-sqlite3");
if (!fs.existsSync(sqliteDir)) {
  log("better-sqlite3 not installed at workspace root; nothing to do.");
  process.exit(0);
}

try {
  execFileSync(
    "npx",
    ["prebuild-install", `--target=${electronVersion}`, "--runtime=electron", `--arch=${arch}`, "--verbose"],
    { cwd: sqliteDir, stdio: "inherit" },
  );
  log("Done.");
} catch (e) {
  log(`prebuild-install failed: ${e instanceof Error ? e.message : String(e)}`);
  log("This is usually fine if you're not launching Electron right now (vitest uses the host-Node prebuilt).");
  log("If you ARE launching Electron, ensure your Node is native arm64 (not Rosetta x64), then re-run.");
  process.exit(0); // don't fail the whole install
}
