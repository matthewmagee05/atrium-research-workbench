import { describe, expect, it } from "vitest";
import { validatePipeline } from "../apps/desktop/src/renderer/lib/validate-pipeline";
import type { ModuleManifest, PipelineEdge, PipelineNode } from "../apps/desktop/src/renderer/store/workspace";

const MODULES: ModuleManifest[] = [
  {
    id: "question-development",
    version: "0.1.0",
    name: "Question Development",
    stage: "question",
    runtime: "python",
    description: "Generate candidate research questions",
    inputs: [],
    outputs: [{ name: "questions", schema: "schemas/questions.json", description: "", output_kind: "structured_data" }],
    params_schema: "schemas/params.json",
  },
  {
    id: "hypothesis-drafter",
    version: "0.1.0",
    name: "Hypothesis Drafter",
    stage: "hypothesis",
    runtime: "python",
    description: "Draft hypotheses",
    inputs: [{ name: "questions", schema: "schemas/questions.json" }],
    outputs: [{ name: "hypotheses", schema: "schemas/hypotheses.json", description: "", output_kind: "structured_data" }],
    params_schema: "schemas/params.json",
  },
];

const QD_SCHEMA = {
  type: "object",
  required: ["topic"],
  properties: {
    topic: { type: "string" },
    max_questions: { type: "integer", minimum: 1, maximum: 20 },
  },
  additionalProperties: false,
};

const HD_SCHEMA = {
  type: "object",
  properties: {
    max_hypotheses: { type: "integer", minimum: 1 },
  },
  additionalProperties: false,
};

function makeLoader(schemas: Record<string, Record<string, unknown>>) {
  return async (moduleId: string, _schemaRef: string) => {
    if (!schemas[moduleId]) throw new Error(`no schema for ${moduleId}`);
    return schemas[moduleId];
  };
}

describe("validatePipeline", () => {
  it("flags an empty pipeline", async () => {
    const result = await validatePipeline([], [], MODULES, makeLoader({}));
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toMatch(/empty/i);
  });

  it("flags a required string param that is the empty string", async () => {
    const nodes: PipelineNode[] = [
      { id: "n1", moduleId: "question-development", params: { topic: "" }, position: { x: 0, y: 0 } },
    ];
    const result = await validatePipeline(nodes, [], MODULES, makeLoader({
      "question-development": QD_SCHEMA,
    }));
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "n1", field: "topic", message: expect.stringMatching(/empty/i) }),
    ]));
  });

  it("flags a missing required input connection", async () => {
    const nodes: PipelineNode[] = [
      { id: "n1", moduleId: "hypothesis-drafter", params: { max_hypotheses: 5 }, position: { x: 0, y: 0 } },
    ];
    const result = await validatePipeline(nodes, [], MODULES, makeLoader({
      "hypothesis-drafter": HD_SCHEMA,
    }));
    expect(result.valid).toBe(false);
    const conn = result.issues.find((i) => i.field === "questions");
    expect(conn).toBeDefined();
    expect(conn?.message).toMatch(/not connected/i);
  });

  it("passes when topic is set and inputs are connected", async () => {
    const nodes: PipelineNode[] = [
      { id: "n1", moduleId: "question-development", params: { topic: "machine learning fairness" }, position: { x: 0, y: 0 } },
      { id: "n2", moduleId: "hypothesis-drafter", params: { max_hypotheses: 5 }, position: { x: 0, y: 0 } },
    ];
    const edges: PipelineEdge[] = [
      { id: "e1", source: "n1", sourcePort: "questions", target: "n2", targetPort: "questions" },
    ];
    const result = await validatePipeline(nodes, edges, MODULES, makeLoader({
      "question-development": QD_SCHEMA,
      "hypothesis-drafter": HD_SCHEMA,
    }));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("does not block on schema load failure (best-effort)", async () => {
    const nodes: PipelineNode[] = [
      { id: "n1", moduleId: "question-development", params: { topic: "x" }, position: { x: 0, y: 0 } },
    ];
    const result = await validatePipeline(nodes, [], MODULES, async () => { throw new Error("network down"); });
    expect(result.valid).toBe(true);
  });
});
