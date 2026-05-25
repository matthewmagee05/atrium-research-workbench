import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  exportBundle,
  freezeProtocol,
  generateEnvironmentLock,
  generateMethods,
  initProject,
  replayBundle,
  resolveCorePaths,
  runProtocol,
  verifyBundle
} from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

function copyProject(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-tier1a-"));
  fs.cpSync(path.join(repoRoot, "golden-pipelines", "minimal-bibliometric"), tmp, { recursive: true });
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

describe("Tier 1A minimal bibliometric pipeline", () => {
  it("runs without LLM credentials, generates methods/env/corpus lock, exports, replays, and verifies", async () => {
    const projectDir = copyProject();
    const protocolPath = path.join(projectDir, "protocol.yaml");
    delete process.env.ANTHROPIC_API_KEY;
    freezeProtocol(protocolPath, paths);
    const manifest = await runProtocol(protocolPath, paths, { projectDir });
    expect(manifest.completed_status).toBe("success");
    expect(manifest.nodes).toHaveLength(4);

    const expected = JSON.parse(fs.readFileSync(path.join(repoRoot, "golden-pipelines", "minimal-bibliometric", "expected_hashes.json"), "utf8"));
    expect(hashesByNode(path.join(projectDir, ".rwb", "run.manifest.json"))).toEqual(expected.nodes);

    generateMethods(projectDir);
    generateEnvironmentLock(projectDir, paths);
    expect(fs.readFileSync(path.join(projectDir, "METHODS.md"), "utf8")).toContain("METHODS.md` is a convenience narrative");
    expect(fs.existsSync(path.join(projectDir, "environment.lock"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "corpus.lock.json"))).toBe(true);

    const bundlePath = path.join(os.tmpdir(), `rwb-tier1a-bundle-${Date.now()}`);
    exportBundle(projectDir, bundlePath, paths);
    for (const required of ["METHODS.md", "corpus.lock.json", "environment.lock", "run.manifest.json", "manifest.json"]) {
      expect(fs.existsSync(path.join(bundlePath, required))).toBe(true);
    }

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
    expect(replayBundle(bundlePath).materialized).toHaveLength(8);
    expect((await verifyBundle(bundlePath, { trusted: true })).ok).toBe(true);
  });
});
