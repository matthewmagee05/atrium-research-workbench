import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { freezeProtocol, initProject, resolveCorePaths, runProtocol } from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.RWB_LLM_MOCK_RESPONSE;
});

describe("narrative drafter", () => {
  it("executes through the runner proxy when provider/model are configured", async () => {
    process.env.RWB_LLM_MOCK_RESPONSE = JSON.stringify({ text: "## Results\n\nProxy drafted text.", input_tokens: 8, output_tokens: 5 });
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-narrative-"));
    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    fs.writeFileSync(protocolPath, `protocol_version: "1.0"
project:
  id: "77777777-7777-4777-8777-777777777777"
  name: "Narrative Proxy"
  created_at: "2026-05-25T00:00:00.000Z"
  created_by: "test"
frozen:
  is_frozen: false
budget:
  max_llm_calls_per_run: 3
  max_tokens_per_run: 10000
  max_cost_usd_per_run: 2
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
    params: {}
  - id: "33333333-3333-4333-8333-333333333333"
    name: "Summary"
    module: {id: "descriptive-summary-py", version: "1.0.0"}
    params: {summary_fields: ["publication_year"]}
  - id: "44444444-4444-4444-8444-444444444444"
    name: "Narrative"
    module: {id: "narrative-drafter", version: "1.0.0"}
    params: {provider: "ollama", model: "test-model"}
edges:
  - from: {node_id: "11111111-1111-4111-8111-111111111111", port: "records"}
    to: {node_id: "22222222-2222-4222-8222-222222222222", port: "records"}
  - from: {node_id: "22222222-2222-4222-8222-222222222222", port: "normalized"}
    to: {node_id: "33333333-3333-4333-8333-333333333333", port: "normalized"}
  - from: {node_id: "33333333-3333-4333-8333-333333333333", port: "summary"}
    to: {node_id: "44444444-4444-4444-8444-444444444444", port: "summary"}
`, "utf8");
    freezeProtocol(protocolPath, paths);
    const manifest = await runProtocol(protocolPath, paths, { projectDir });
    expect(manifest.completed_status).toBe("success");
    expect(manifest.total_llm_calls).toBe(1);
    expect(manifest.total_tokens).toBe(13);
    const narrativeNode = manifest.nodes.find((node) => node.node_id === "44444444-4444-4444-8444-444444444444");
    expect(narrativeNode?.llm_calls).toBe(1);
    expect(narrativeNode?.tokens).toBe(13);
    expect(narrativeNode?.outputs.map((output) => output.port).sort()).toEqual(["claims", "draft"]);
  });
});
