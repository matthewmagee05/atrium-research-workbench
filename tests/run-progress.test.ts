import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freezeProtocol, initProject, resolveCorePaths, runProtocol } from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

describe("runProtocol progress events", () => {
  it("emits run_started, node_started, node_completed, and run_completed for each node", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-progress-"));
    fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), projectDir, { recursive: true });
    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    freezeProtocol(protocolPath, paths);

    const events: Array<{ type: string; nodeId?: string; cumulativeCostUsd?: number }> = [];
    const manifest = await runProtocol(protocolPath, paths, {
      projectDir,
      onProgress: (event) => {
        events.push({ type: event.type, nodeId: event.nodeId, cumulativeCostUsd: event.cumulativeCostUsd });
      },
    });

    expect(manifest.completed_status).toBe("success");
    expect(events[0]?.type).toBe("run_started");
    expect(events[events.length - 1]?.type).toBe("run_completed");

    const nodeStarted = events.filter((e) => e.type === "node_started");
    const nodeCompleted = events.filter((e) => e.type === "node_completed");
    expect(nodeStarted.length).toBe(manifest.nodes.length);
    expect(nodeCompleted.length).toBe(manifest.nodes.length);

    for (const completed of nodeCompleted) {
      expect(completed.nodeId).toBeTruthy();
      expect(typeof completed.cumulativeCostUsd).toBe("number");
    }

    fs.rmSync(projectDir, { recursive: true });
  });

  it("emits run_failed when a node throws", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-progress-fail-"));
    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    fs.writeFileSync(protocolPath, `protocol_version: "1.0"
project:
  id: "11111111-1111-4111-8111-aaaaaaaaaaaa"
  name: "Failing"
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
  - id: "22222222-2222-4222-8222-aaaaaaaaaaaa"
    name: "Fixture"
    module: {id: "fixture-source", version: "1.0.0"}
    params: {fixture_id: "does-not-exist"}
edges: []
`, "utf8");
    freezeProtocol(protocolPath, paths);

    const events: Array<{ type: string; error?: string }> = [];
    await expect(runProtocol(protocolPath, paths, {
      projectDir,
      onProgress: (event) => events.push({ type: event.type, error: event.error }),
    })).rejects.toThrow();

    expect(events.some((e) => e.type === "run_started")).toBe(true);
    const failedEvent = events.find((e) => e.type === "run_failed");
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.error).toBeTruthy();

    fs.rmSync(projectDir, { recursive: true });
  });
});
