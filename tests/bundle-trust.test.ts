import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  exportBundle,
  freezeProtocol,
  initProject,
  inspectBundleTrust,
  resolveCorePaths,
  runProtocol,
  verifyBundle
} from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

function setupBundle(): string {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-trust-"));
  fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), projectDir, { recursive: true });
  initProject(projectDir);
  freezeProtocol(path.join(projectDir, "protocol.yaml"), paths);
  return projectDir;
}

describe("bundle trust inspection", () => {
  it("reports all trusted when bundled modules match local modules", async () => {
    const projectDir = setupBundle();
    await runProtocol(path.join(projectDir, "protocol.yaml"), paths, { projectDir });
    const bundlePath = path.join(os.tmpdir(), `rwb-trust-bundle-${Date.now()}`);
    exportBundle(projectDir, bundlePath, paths);

    const report = inspectBundleTrust(bundlePath, paths.modulesRoot);
    expect(report.allTrusted).toBe(true);
    expect(report.untrustedModules).toEqual([]);
    expect(report.missingLocally).toEqual([]);
    expect(report.hashMismatches).toEqual([]);
    expect(report.modules).toHaveLength(3);
    for (const mod of report.modules) {
      expect(mod.hashMatch).toBe(true);
      expect(mod.presentLocally).toBe(true);
    }
  });

  it("reports untrusted when no local modules root is provided", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-trust2-"));
    fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), projectDir, { recursive: true });
    initProject(projectDir);
    const report = inspectBundleTrust(projectDir);
    expect(report.allTrusted).toBe(false);
    expect(report.missingLocally).toHaveLength(3);
  });

  it("reports hash mismatch when bundled module is modified", async () => {
    const projectDir = setupBundle();
    await runProtocol(path.join(projectDir, "protocol.yaml"), paths, { projectDir });
    const bundlePath = path.join(os.tmpdir(), `rwb-trust-tamper-${Date.now()}`);
    exportBundle(projectDir, bundlePath, paths);

    const tamperTarget = path.join(bundlePath, "modules", "fixture-source", "entry.py");
    fs.appendFileSync(tamperTarget, "\n# tampered\n");

    const report = inspectBundleTrust(bundlePath, paths.modulesRoot);
    expect(report.allTrusted).toBe(false);
    expect(report.hashMismatches).toContain("fixture-source");
  });

  it("verifyBundle refuses execution without --trust when modules are untrusted", async () => {
    const projectDir = setupBundle();
    await runProtocol(path.join(projectDir, "protocol.yaml"), paths, { projectDir });
    const bundlePath = path.join(os.tmpdir(), `rwb-trust-refuse-${Date.now()}`);
    exportBundle(projectDir, bundlePath, paths);

    const result = await verifyBundle(bundlePath);
    expect(result.ok).toBe(false);
    expect(result.checked).toEqual([]);
    expect(result.trustReport.allTrusted).toBe(false);
  });

  it("verifyBundle proceeds with --trust flag", async () => {
    const projectDir = setupBundle();
    await runProtocol(path.join(projectDir, "protocol.yaml"), paths, { projectDir });
    const bundlePath = path.join(os.tmpdir(), `rwb-trust-proceed-${Date.now()}`);
    exportBundle(projectDir, bundlePath, paths);

    const result = await verifyBundle(bundlePath, { trusted: true });
    expect(result.ok).toBe(true);
    expect(result.checked.length).toBeGreaterThan(0);
  });

  it("verifyBundle auto-trusts when modules match local", async () => {
    const projectDir = setupBundle();
    await runProtocol(path.join(projectDir, "protocol.yaml"), paths, { projectDir });
    const bundlePath = path.join(os.tmpdir(), `rwb-trust-auto-${Date.now()}`);
    exportBundle(projectDir, bundlePath, paths);

    const result = await verifyBundle(bundlePath, { localModulesRoot: paths.modulesRoot });
    expect(result.ok).toBe(true);
    expect(result.trustReport.allTrusted).toBe(true);
    expect(result.checked.length).toBeGreaterThan(0);
  });
});
