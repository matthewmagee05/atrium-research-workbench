import { describe, expect, it } from "vitest";
import { serializePipelineToProtocol } from "../apps/desktop/src/renderer/lib/serialize-protocol";
import type { ModuleManifest, PipelineEdge, PipelineNode } from "../apps/desktop/src/renderer/store/workspace";

const MODULES: ModuleManifest[] = [
  { id: "openalex-source", version: "1.0.0", name: "OpenAlex Source", stage: "source", runtime: "python", description: "", inputs: [], outputs: [{ name: "records", schema: "schemas/output.json", description: "", output_kind: "structured_data" }] },
  { id: "record-normalizer", version: "1.0.0", name: "Record Normalizer", stage: "normalize", runtime: "python", description: "", inputs: [{ name: "records", schema: "schemas/input.json" }], outputs: [{ name: "normalized", schema: "schemas/output.json", description: "", output_kind: "structured_data" }] },
];

describe("serializePipelineToProtocol", () => {
  it("produces protocol_version 1.0 with frozen.is_frozen false", () => {
    const nodes: PipelineNode[] = [
      { id: "n1", moduleId: "openalex-source", params: { source_mode: "fixture" }, position: { x: 0, y: 0 } },
    ];
    const proto = serializePipelineToProtocol(nodes, [], MODULES);
    expect(proto.protocol_version).toBe("1.0");
    expect(proto.frozen.is_frozen).toBe(false);
  });

  it("remaps renderer node IDs to UUID-v4-shaped strings consistently across edges", () => {
    const nodes: PipelineNode[] = [
      { id: "openalex-source-l8a", moduleId: "openalex-source", params: {}, position: { x: 0, y: 0 } },
      { id: "record-normalizer-l8b", moduleId: "record-normalizer", params: {}, position: { x: 0, y: 0 } },
    ];
    const edges: PipelineEdge[] = [
      { id: "e1", source: "openalex-source-l8a", sourcePort: "records", target: "record-normalizer-l8b", targetPort: "records" },
    ];
    const proto = serializePipelineToProtocol(nodes, edges, MODULES);
    expect(proto.nodes).toHaveLength(2);
    expect(proto.edges).toHaveLength(1);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(proto.nodes[0].id).toMatch(uuidRe);
    expect(proto.nodes[1].id).toMatch(uuidRe);
    expect(proto.edges[0].from.node_id).toBe(proto.nodes[0].id);
    expect(proto.edges[0].to.node_id).toBe(proto.nodes[1].id);
  });

  it("carries through module.version and node params verbatim", () => {
    const nodes: PipelineNode[] = [
      { id: "n1", moduleId: "openalex-source", params: { source_mode: "fixture", fixture_id: "tiny-corpus" }, position: { x: 0, y: 0 } },
    ];
    const proto = serializePipelineToProtocol(nodes, [], MODULES);
    expect(proto.nodes[0].module.id).toBe("openalex-source");
    expect(proto.nodes[0].module.version).toBe("1.0.0");
    expect(proto.nodes[0].params).toEqual({ source_mode: "fixture", fixture_id: "tiny-corpus" });
  });

  it("sets a non-zero budget so the runner pre-check passes for LLM pipelines", () => {
    const llmModules: ModuleManifest[] = [
      { id: "llm-screener", version: "0.1.0", name: "LLM Screener", stage: "screen", runtime: "python", description: "", inputs: [{ name: "records", schema: "schemas/records.json" }], outputs: [{ name: "screening_decisions", schema: "schemas/screening_decisions.json", description: "", output_kind: "structured_data" }] },
    ];
    const nodes: PipelineNode[] = [
      { id: "n1", moduleId: "llm-screener", params: {}, position: { x: 0, y: 0 } },
    ];
    const proto = serializePipelineToProtocol(nodes, [], llmModules);
    expect(proto.budget.max_cost_usd_per_run).toBeGreaterThan(0);
    expect(proto.budget.max_tokens_per_run).toBeGreaterThan(0);
    expect(proto.budget.max_llm_calls_per_run).toBeGreaterThan(0);
  });
});
