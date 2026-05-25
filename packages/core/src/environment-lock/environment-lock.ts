import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { listModules } from "../modules/registry";
import { writeJsonFile } from "../fs-utils";
import type { CorePaths } from "../types";

function commandVersion(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  return (result.stdout || result.stderr).split("\n")[0]?.trim() || null;
}

function cleanPythonVersion(version: string | null): string | null {
  return version?.replace(/^Python\s+/, "") ?? null;
}

export function generateEnvironmentLock(projectDir: string, paths: CorePaths): Record<string, unknown> {
  const lock = {
    workbench_version: "0.0.0-tier1a",
    platform: {
      os: process.platform,
      arch: process.arch,
      version: os.release()
    },
    runtimes: {
      node: process.version.replace(/^v/, ""),
      python: cleanPythonVersion(commandVersion("python3", ["--version"])),
      r: commandVersion("Rscript", ["--version"])?.replace(/^R scripting front-end version\s+/, "") ?? null
    },
    module_packages: Object.fromEntries(
      listModules(paths.modulesRoot).map((mod) => [
        `${mod.manifest.id}@${mod.manifest.version}`,
        { runtime: mod.manifest.runtime, dependencies: mod.manifest.dependencies ?? {} }
      ])
    ),
    captured_at: new Date().toISOString()
  };
  writeJsonFile(path.join(projectDir, "environment.lock"), lock);
  return lock;
}
