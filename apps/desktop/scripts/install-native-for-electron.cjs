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

// Find every better-sqlite3 installation in the workspace. npm sometimes hoists to
// the root and sometimes leaves a nested copy under packages/<name>/node_modules
// when peer-dep resolution clashes. We have to rebuild every copy, or whichever
// one the runtime resolves to will still be the wrong arch.
function findBetterSqliteCopies(searchRoot) {
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === "better-sqlite3" && fs.existsSync(path.join(full, "package.json"))) {
        out.push(full);
      } else if (entry.name === "node_modules") {
        walk(full);
      } else if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        // Descend into workspaces / packages so we catch packages/core/node_modules
        // and apps/*/node_modules. Skip third-party dep trees (those are inside
        // node_modules already and handled by the walk above).
        if (full.includes("node_modules")) continue;
        walk(full);
      }
    }
  }
  walk(searchRoot);
  return out;
}

const copies = findBetterSqliteCopies(root);
if (copies.length === 0) {
  log("better-sqlite3 not installed anywhere in the workspace; nothing to do.");
  process.exit(0);
}
log(`Found ${copies.length} better-sqlite3 install(s):`);
for (const c of copies) log(`  ${path.relative(root, c)}`);

let failures = 0;
for (const sqliteDir of copies) {
  try {
    execFileSync(
      "npx",
      ["prebuild-install", `--target=${electronVersion}`, "--runtime=electron", `--arch=${arch}`],
      { cwd: sqliteDir, stdio: "inherit" },
    );
    log(`  ✓ ${path.relative(root, sqliteDir)}`);
  } catch (e) {
    failures += 1;
    log(`  ✗ ${path.relative(root, sqliteDir)}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (failures > 0) {
  log(`prebuild-install failed for ${failures} copy/copies.`);
  log("If your Node is x64 under Rosetta, this is expected for non-launch contexts.");
  log("Launching Electron will work if at least the root copy is arm64.");
  process.exit(0); // don't fail the whole install
}
log("Done.");
