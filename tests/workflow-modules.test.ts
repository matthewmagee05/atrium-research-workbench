import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { freezeProtocol, initProject, resolveCorePaths, runProtocol } from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.RWB_LLM_MOCK_RESPONSE;
});

describe("workflow modules through the runner proxy", () => {
  it("question-development → hypothesis-drafter → preregistration-generator with mocked LLM", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-workflow-"));
    initProject(projectDir);
    process.env.RWB_LLM_MOCK_RESPONSE = JSON.stringify({
      text: JSON.stringify({
        questions: [
          { text: "Does X improve Y?", rationale: "exploratory" },
          { text: "Is Z related to W?", rationale: "correlational" },
        ],
        hypotheses: [
          { text: "H1: X improves Y", variables: ["X", "Y"], assumptions: ["random sampling"] },
        ],
        markdown: "# Preregistration\n\n## Background\n\nDrafted via mock.",
      }),
      input_tokens: 10,
      output_tokens: 20,
    });
    const protocolPath = path.join(projectDir, "protocol.yaml");
    fs.writeFileSync(protocolPath, `protocol_version: "1.0"
project:
  id: "abcabcab-abca-4bca-8abc-abcabcabcabc"
  name: "Workflow Pipeline"
  created_at: "2026-05-25T00:00:00.000Z"
  created_by: "test"
frozen:
  is_frozen: false
budget:
  max_llm_calls_per_run: 30
  max_tokens_per_run: 100000
  max_cost_usd_per_run: 20
  stop_on_budget_exceeded: true
reproduction_policy: {}
nodes:
  - id: "11111111-1111-4111-8111-111111111111"
    name: "Questions"
    module: {id: "question-development", version: "0.1.0"}
    params: {topic: "open source research tools", provider: "ollama", model: "test-model", max_questions: 2}
  - id: "22222222-2222-4222-8222-222222222222"
    name: "Hypotheses"
    module: {id: "hypothesis-drafter", version: "0.1.0"}
    params: {provider: "ollama", model: "test-model", max_hypotheses: 1}
  - id: "33333333-3333-4333-8333-333333333333"
    name: "Preregistration"
    module: {id: "preregistration-generator", version: "0.1.0"}
    params: {template: "osf-standard", provider: "ollama", model: "test-model"}
edges:
  - from: {node_id: "11111111-1111-4111-8111-111111111111", port: "questions"}
    to: {node_id: "22222222-2222-4222-8222-222222222222", port: "questions"}
  - from: {node_id: "22222222-2222-4222-8222-222222222222", port: "hypotheses"}
    to: {node_id: "33333333-3333-4333-8333-333333333333", port: "hypotheses"}
`, "utf8");
    freezeProtocol(protocolPath, paths);

    const manifest = await runProtocol(protocolPath, paths, { projectDir });

    expect(manifest.completed_status).toBe("success");
    expect(manifest.nodes).toHaveLength(3);

    const findOutput = (nodeId: string, port: string) => {
      const node = manifest.nodes.find((n) => n.node_id === nodeId);
      const output = node?.outputs.find((o) => o.port === port);
      if (!output) throw new Error(`output ${port} not found on ${nodeId}`);
      return output;
    };

    const questionsArtifact = findOutput("11111111-1111-4111-8111-111111111111", "questions");
    const hypothesesArtifact = findOutput("22222222-2222-4222-8222-222222222222", "hypotheses");
    const prereg = findOutput("33333333-3333-4333-8333-333333333333", "preregistration");

    expect(questionsArtifact.artifact_id).toMatch(/^sha256:/);
    expect(hypothesesArtifact.artifact_id).toMatch(/^sha256:/);
    expect(prereg.artifact_id).toMatch(/^sha256:/);

    fs.rmSync(projectDir, { recursive: true });
  });
});
