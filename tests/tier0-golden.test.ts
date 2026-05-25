import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exportBundle,
  freezeProtocol,
  importBundle,
  initProject,
  replayBundle,
  resolveCorePaths,
  runProtocol,
  verifyBundle
} from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

function copyFixtureProject(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-tier0-"));
  fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), tmp, { recursive: true });
  initProject(tmp);
  return tmp;
}

function hashesByNode(manifestPath: string): Record<string, Record<string, string>> {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const result: Record<string, Record<string, string>> = {};
  for (const node of manifest.nodes) {
    result[node.node_id] = {};
    for (const output of node.outputs) {
      result[node.node_id][output.port] = output.artifact_id;
    }
  }
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Tier 0 golden pipeline", () => {
  it("runs, exports, imports, replays without network, and verifies deterministic hashes", async () => {
    const projectDir = copyFixtureProject();
    const protocolPath = path.join(projectDir, "protocol.yaml");
    freezeProtocol(protocolPath, paths);
    const runManifest = await runProtocol(protocolPath, paths, { projectDir });
    expect(runManifest.completed_status).toBe("success");
    expect(runManifest.nodes).toHaveLength(3);

    const expected = JSON.parse(fs.readFileSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike", "expected_hashes.json"), "utf8"));
    expect(hashesByNode(path.join(projectDir, ".rwb", "run.manifest.json"))).toEqual(expected.nodes);

    const bundlePath = path.join(os.tmpdir(), `rwb-tier0-bundle-${Date.now()}`);
    exportBundle(projectDir, bundlePath, paths);
    expect(fs.existsSync(path.join(bundlePath, "run.manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(bundlePath, "artifacts"))).toBe(true);
    expect(fs.existsSync(path.join(bundlePath, "modules", "fixture-source", "entry.py"))).toBe(true);

    const importedProject = path.join(os.tmpdir(), `rwb-tier0-import-${Date.now()}`);
    importBundle(bundlePath, importedProject);
    expect(fs.existsSync(path.join(importedProject, ".rwb", "artifacts"))).toBe(true);

    const guardedReplay = spawnSync(
      process.execPath,
      [path.join(repoRoot, "apps", "cli", "dist", "index.js"), "bundle", "replay", bundlePath],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_OPTIONS: `--require=${path.join(repoRoot, "tests", "network-guard.cjs")}`
        },
        encoding: "utf8"
      }
    );
    expect(guardedReplay.status, guardedReplay.stderr).toBe(0);
    const replay = replayBundle(bundlePath);
    expect(replay.materialized).toHaveLength(3);

    const verification = await verifyBundle(bundlePath, { trusted: true });
    expect(verification.ok).toBe(true);
    expect(verification.checked).toHaveLength(3);
  });
});
