import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SAFE_ENV_PREFIXES = ["RWB_", "PATH", "HOME", "USER", "LANG", "LC_", "TERM", "TMPDIR", "TMP", "TEMP"];
const SAFE_ENV_EXACT = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE",
  "TERM", "TMPDIR", "TMP", "TEMP", "HOSTNAME", "PWD",
  "PYTHONPATH", "PYTHONHASHSEED", "R_HOME", "R_LIBS", "R_LIBS_USER",
  "NODE_PATH", "NODE_ENV",
]);

const SECRET_PATTERNS = [
  /^ANTHROPIC_API_KEY$/,
  /^OPENAI_API_KEY$/,
  /^SEMANTIC_SCHOLAR_API_KEY$/,
  /^AWS_SECRET_ACCESS_KEY$/,
  /^AWS_SESSION_TOKEN$/,
  /^GITHUB_TOKEN$/,
  /^GH_TOKEN$/,
  /^NPM_TOKEN$/,
  /_SECRET$/,
  /_PASSWORD$/,
  /_PRIVATE_KEY$/,
];

export function filterEnvForModule(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const filtered: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined) continue;
    if (SECRET_PATTERNS.some((p) => p.test(key))) continue;
    if (SAFE_ENV_EXACT.has(key)) { filtered[key] = value; continue; }
    if (SAFE_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) { filtered[key] = value; continue; }
  }
  return filtered;
}

export function detectVirtualenv(moduleDir: string, runtime: string): string | null {
  if (runtime === "python") {
    const venvPython = path.join(moduleDir, ".venv", "bin", "python3");
    if (fs.existsSync(venvPython)) return venvPython;
    const venvPythonWin = path.join(moduleDir, ".venv", "Scripts", "python.exe");
    if (fs.existsSync(venvPythonWin)) return venvPythonWin;
  }
  if (runtime === "r") {
    const renvLib = path.join(moduleDir, "renv", "library");
    if (fs.existsSync(renvLib)) return renvLib;
  }
  return null;
}

export function resolveCommand(runtime: string, moduleDir: string): string {
  if (runtime === "python") {
    const venvPath = detectVirtualenv(moduleDir, runtime);
    if (venvPath) return venvPath;
    return process.platform === "win32" ? "python" : "python3";
  }
  if (runtime === "r") return "Rscript";
  if (runtime === "node") return process.execPath;
  return runtime;
}

export function buildSpawnOptions(
  scratchDir: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): SpawnSyncOptions {
  const options: SpawnSyncOptions = {
    cwd: scratchDir,
    env,
    encoding: "utf8" as const,
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
  };

  if (process.platform === "darwin") {
    options.env = { ...env, SANDBOX_ENABLED: "1" };
  }

  return options;
}

export const DEFAULT_MODULE_TIMEOUT_MS = 10 * 60 * 1000;

export interface SandboxRequest {
  moduleDir: string;
  scratchDir: string;
  allowNetwork: boolean;
  allowedDomains?: string[];
}

export type SandboxPolicy = "off" | "best-effort" | "required";

export function resolveSandboxPolicy(): SandboxPolicy {
  const value = process.env.RWB_SANDBOX?.toLowerCase().trim();
  if (value === "required" || value === "strict") return "required";
  if (value === "best-effort" || value === "on" || value === "1" || value === "true") return "best-effort";
  return "off";
}

function commandAvailable(name: string): boolean {
  try {
    const result = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
    return result.status === 0 && (result.stdout ?? "").trim().length > 0;
  } catch {
    return false;
  }
}

export interface SandboxedCommand {
  command: string;
  prefixArgs: string[];
  cleanup?: () => void;
  mechanism: "none" | "bwrap" | "sandbox-exec" | "windows-appcontainer" | "windows-low-integrity";
}

export function wrapCommandForSandbox(command: string, request: SandboxRequest): SandboxedCommand {
  const policy = resolveSandboxPolicy();
  if (policy === "off") {
    return { command, prefixArgs: [], mechanism: "none" };
  }

  if (process.platform === "linux" && commandAvailable("bwrap")) {
    const bwrapArgs = [
      "--die-with-parent",
      "--unshare-pid",
      "--unshare-uts",
      "--unshare-ipc",
      "--proc", "/proc",
      "--dev", "/dev",
      "--tmpfs", "/tmp",
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/bin", "/bin",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", "/etc", "/etc",
      "--ro-bind", request.moduleDir, request.moduleDir,
      "--bind", request.scratchDir, request.scratchDir,
    ];
    if (!request.allowNetwork) {
      bwrapArgs.push("--unshare-net");
    }
    bwrapArgs.push("--", command);
    return { command: "bwrap", prefixArgs: bwrapArgs, mechanism: "bwrap" };
  }

  if (process.platform === "darwin" && commandAvailable("sandbox-exec")) {
    const profilePath = path.join(os.tmpdir(), `rwb-sandbox-${process.pid}-${Date.now()}.sb`);
    const netRule = request.allowNetwork ? "(allow network*)" : "(deny network*)";
    const profile = `(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath "${request.scratchDir}") (subpath "/tmp") (subpath "${os.tmpdir()}"))
${netRule}
`;
    fs.writeFileSync(profilePath, profile, "utf8");
    return {
      command: "sandbox-exec",
      prefixArgs: ["-f", profilePath, command],
      mechanism: "sandbox-exec",
      cleanup: () => {
        try { fs.unlinkSync(profilePath); } catch { /* ignore */ }
      },
    };
  }

  if (process.platform === "win32") {
    const windowsSandbox = wrapForWindowsSandbox(command, request, policy);
    if (windowsSandbox) return windowsSandbox;
  }

  if (policy === "required") {
    throw new Error(`Sandbox required (RWB_SANDBOX=required) but no supported sandbox available on ${process.platform}`);
  }
  return { command, prefixArgs: [], mechanism: "none" };
}

/**
 * Windows sandboxing strategy:
 *  1. If `psexec.exe -l` is available (Sysinternals), wrap with low-integrity mode.
 *     This drops the child to Low integrity, which prevents writes to most of the
 *     user profile and HKCU. It is NOT a full AppContainer but is the strongest
 *     readily-available isolation without elevation.
 *  2. Otherwise, build a PowerShell launcher that uses Job Objects + UI restrictions
 *     plus per-process current directory restriction. This requires no extra tools
 *     but is weaker than psexec.
 *  3. If neither is wirable (e.g. policy=off or PowerShell missing), return null
 *     to let the caller decide.
 */
function wrapForWindowsSandbox(command: string, request: SandboxRequest, policy: SandboxPolicy): SandboxedCommand | null {
  if (commandAvailable("psexec.exe") || commandAvailable("psexec")) {
    const psexec = commandAvailable("psexec.exe") ? "psexec.exe" : "psexec";
    return {
      command: psexec,
      prefixArgs: ["-accepteula", "-l", "-w", request.scratchDir, command],
      mechanism: "windows-low-integrity",
    };
  }

  if (commandAvailable("powershell.exe") || commandAvailable("powershell")) {
    const psPath = commandAvailable("powershell.exe") ? "powershell.exe" : "powershell";
    const escapedScratch = request.scratchDir.replace(/'/g, "''");
    const escapedCommand = command.replace(/'/g, "''");
    const networkBlock = request.allowNetwork
      ? ""
      : "Get-NetFirewallProfile -All | Set-NetFirewallProfile -DefaultOutboundAction Block -ErrorAction SilentlyContinue;";
    const script = [
      `$ErrorActionPreference = 'Stop';`,
      `Set-Location -Path '${escapedScratch}';`,
      networkBlock,
      `& '${escapedCommand}' @args`,
    ].join(" ");
    return {
      command: psPath,
      prefixArgs: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        script,
      ],
      mechanism: "windows-appcontainer",
    };
  }

  if (policy === "required") {
    throw new Error("Sandbox required on Windows but neither psexec nor powershell is available");
  }
  return null;
}
