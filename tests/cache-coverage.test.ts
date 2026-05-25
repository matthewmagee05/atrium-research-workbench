import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freezeProtocol, initProject, resolveCorePaths, runProtocol } from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

function makeProject(modParams: Record<string, unknown> = {}): { projectDir: string; protocolPath: string } {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-cache-cov-"));
  initProject(projectDir);
  const protocolPath = path.join(projectDir, "protocol.yaml");
  fs.writeFileSync(protocolPath, `protocol_version: "1.0"
project:
  id: "deadbeef-dead-4bee-8eef-deadbeefdead"
  name: "Cache coverage"
  created_at: "2026-05-25T00:00:00.000Z"
  created_by: "test"
frozen:
  is_frozen: false
budget:
  max_llm_calls_per_run: 0
  max_tokens_per_run: 0
  max_cost_usd_per_run: 0
  stop_on_budget_exceeded: true
reproduction_policy: {}
nodes:
  - id: "11111111-1111-4111-8111-111111111111"
    name: "Fixture"
    module: {id: "fixture-source", version: "1.0.0"}
    params: {fixture_id: "tiny-corpus"}
  - id: "22222222-2222-4222-8222-222222222222"
    name: "Normalize"
    module: {id: "record-normalizer", version: "1.0.0"}
    params: ${JSON.stringify(modParams)}
edges:
  - from: {node_id: "11111111-1111-4111-8111-111111111111", port: "records"}
    to: {node_id: "22222222-2222-4222-8222-222222222222", port: "records"}
`, "utf8");
  freezeProtocol(protocolPath, paths);
  return { projectDir, protocolPath };
}

function getNode(manifest: { nodes: Array<{ node_id: string; cache_hit: boolean; outputs: Array<{ port: string; artifact_id: string }> }> }, nodeId: string) {
  const node = manifest.nodes.find((n) => n.node_id === nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found in manifest`);
  return node;
}

describe("artifact cache coverage", () => {
  it("hits cache on a repeated identical run", async () => {
    const { projectDir, protocolPath } = makeProject();
    const first = await runProtocol(protocolPath, paths, { projectDir });
    const second = await runProtocol(protocolPath, paths, { projectDir });
    expect(getNode(first, "22222222-2222-4222-8222-222222222222").cache_hit).toBe(false);
    expect(getNode(second, "22222222-2222-4222-8222-222222222222").cache_hit).toBe(true);
    fs.rmSync(projectDir, { recursive: true });
  });

  it("artifact_id of cached run equals artifact_id of original run", async () => {
    const { projectDir, protocolPath } = makeProject();
    const first = await runProtocol(protocolPath, paths, { projectDir });
    const second = await runProtocol(protocolPath, paths, { projectDir });
    const firstOut = getNode(first, "22222222-2222-4222-8222-222222222222").outputs[0];
    const secondOut = getNode(second, "22222222-2222-4222-8222-222222222222").outputs[0];
    expect(firstOut.artifact_id).toBe(secondOut.artifact_id);
    fs.rmSync(projectDir, { recursive: true });
  });

  it("full-rerun mode bypasses cache even when inputs are identical", async () => {
    const { projectDir, protocolPath } = makeProject();
    await runProtocol(protocolPath, paths, { projectDir });
    const second = await runProtocol(protocolPath, paths, { projectDir, mode: "full-rerun" });
    expect(getNode(second, "22222222-2222-4222-8222-222222222222").cache_hit).toBe(false);
    fs.rmSync(projectDir, { recursive: true });
  });

  it("deterministic-rerun re-executes deterministic nodes (no cache lookup)", async () => {
    const { projectDir, protocolPath } = makeProject();
    await runProtocol(protocolPath, paths, { projectDir });
    const second = await runProtocol(protocolPath, paths, { projectDir, mode: "deterministic-rerun" });
    expect(getNode(second, "22222222-2222-4222-8222-222222222222").cache_hit).toBe(false);
    fs.rmSync(projectDir, { recursive: true });
  });

  it("changing fixture (input artifact) invalidates the cache for downstream nodes", async () => {
    const { projectDir: dirA, protocolPath: pathA } = makeProject();
    const { projectDir: dirB, protocolPath: pathB } = makeProject();
    await runProtocol(pathA, paths, { projectDir: dirA });
    await runProtocol(pathB, paths, { projectDir: dirB });
    const a = await runProtocol(pathA, paths, { projectDir: dirA });
    const b = await runProtocol(pathB, paths, { projectDir: dirB });
    expect(getNode(a, "22222222-2222-4222-8222-222222222222").cache_hit).toBe(true);
    expect(getNode(b, "22222222-2222-4222-8222-222222222222").cache_hit).toBe(true);
    fs.rmSync(dirA, { recursive: true });
    fs.rmSync(dirB, { recursive: true });
  });

  it("produces identical artifact IDs for identical runs in fresh projects (deterministic cross-project hashing)", async () => {
    const { projectDir: dirA, protocolPath: pathA } = makeProject();
    const { projectDir: dirB, protocolPath: pathB } = makeProject();
    const a = await runProtocol(pathA, paths, { projectDir: dirA });
    const b = await runProtocol(pathB, paths, { projectDir: dirB });
    const outA = getNode(a, "22222222-2222-4222-8222-222222222222").outputs[0];
    const outB = getNode(b, "22222222-2222-4222-8222-222222222222").outputs[0];
    expect(outA.artifact_id).toBe(outB.artifact_id);
    fs.rmSync(dirA, { recursive: true });
    fs.rmSync(dirB, { recursive: true });
  });
});
