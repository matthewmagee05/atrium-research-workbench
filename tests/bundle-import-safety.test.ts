import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  exportBundle,
  freezeProtocol,
  importBundle,
  initProject,
  inspectBundleTrust,
  resolveCorePaths,
  runProtocol,
  verifyBundle
} from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

async function setupAndExportBundle(): Promise<{ bundlePath: string; projectDir: string }> {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-bimp-"));
  fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), projectDir, { recursive: true });
  initProject(projectDir);
  const protocolPath = path.join(projectDir, "protocol.yaml");
  freezeProtocol(protocolPath, paths);
  await runProtocol(protocolPath, paths, { projectDir });

  const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-bundle-"));
  const bundlePath = path.join(bundleDir, "test-bundle");
  exportBundle(projectDir, bundlePath, paths);
  return { bundlePath, projectDir };
}

describe("bundle import safety", () => {
  it("detects tampered module code in imported bundle", async () => {
    const { bundlePath } = await setupAndExportBundle();

    const modulesDir = path.join(bundlePath, "modules");
    const moduleIds = fs.readdirSync(modulesDir);
    expect(moduleIds.length).toBeGreaterThan(0);

    const targetModule = moduleIds[0];
    const entryFile = path.join(modulesDir, targetModule, "entry.py");
    if (fs.existsSync(entryFile)) {
      fs.appendFileSync(entryFile, "\n# TAMPERED\n");
    }

    const trust = inspectBundleTrust(bundlePath, paths.modulesRoot);
    expect(trust.allTrusted).toBe(false);
    expect(trust.hashMismatches.length).toBeGreaterThan(0);
  });

  it("trust report lists all bundled modules", async () => {
    const { bundlePath } = await setupAndExportBundle();

    const trust = inspectBundleTrust(bundlePath, paths.modulesRoot);
    expect(trust.modules.length).toBeGreaterThan(0);
    for (const mod of trust.modules) {
      expect(mod.moduleId).toBeTruthy();
      expect(mod.bundledVersion).toBeTruthy();
    }
  });

  it("verifyBundle rejects tampered bundle without --trust", async () => {
    const { bundlePath } = await setupAndExportBundle();

    const modulesDir = path.join(bundlePath, "modules");
    const firstMod = fs.readdirSync(modulesDir)[0];
    const entryFile = path.join(modulesDir, firstMod, "entry.py");
    if (fs.existsSync(entryFile)) {
      fs.appendFileSync(entryFile, "\n# INJECTED CODE\n");
    }

    const result = await verifyBundle(bundlePath, { localModulesRoot: paths.modulesRoot });
    expect(result.ok).toBe(false);
    expect(result.checked).toEqual([]);
  });

  it("importBundle imports into destination directory", async () => {
    const { bundlePath } = await setupAndExportBundle();
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-import-dest-"));

    importBundle(bundlePath, destDir);

    expect(fs.existsSync(path.join(destDir, "protocol.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(destDir, ".rwb"))).toBe(true);
  });
});
