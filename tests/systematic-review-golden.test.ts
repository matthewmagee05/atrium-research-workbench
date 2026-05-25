import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { freezeProtocol, initProject, resolveCorePaths, runProtocol } from "../packages/core/src";
import type { RunManifest } from "../packages/core/src/types";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RWB_LLM_MOCK_RESPONSE;
});

describe("Systematic review golden pipeline", () => {
  it("runs source → normalize → dedupe → llm-screener → prisma-flow with mocked LLM", async () => {
    process.env.RWB_LLM_MOCK_RESPONSE = JSON.stringify({
      text: JSON.stringify({
        recommendation: "include",
        confidence: 0.92,
        rationale: "Matches inclusion criteria.",
      }),
      input_tokens: 50,
      output_tokens: 30,
    });

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-sysrev-"));
    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    fs.writeFileSync(protocolPath, `protocol_version: "1.0"
project:
  id: "cafecafe-cafe-4afe-8afe-cafecafecafe"
  name: "Systematic Review Golden"
  created_at: "2026-05-25T00:00:00.000Z"
  created_by: "test"
frozen:
  is_frozen: false
budget:
  max_llm_calls_per_run: 50
  max_tokens_per_run: 200000
  max_cost_usd_per_run: 25
  stop_on_budget_exceeded: true
reproduction_policy:
  default_mode: "replay"
  on_volatile_stage: {rerun_warning: true}
  on_replayable_stage: {enable_variance_audit: false}
  human_decisions: {replay_by_default: true, rerun_behavior: "treat_as_suggestions"}
nodes:
  - id: "11111111-1111-4111-8111-aaaaaaaaaaaa"
    name: "OpenAlex Fixture"
    module: {id: "openalex-source", version: "1.0.0"}
    params: {source_mode: "fixture", fixture_id: "tiny-corpus"}
  - id: "22222222-2222-4222-8222-aaaaaaaaaaaa"
    name: "Normalize Records"
    module: {id: "record-normalizer", version: "1.0.0"}
    params: {}
  - id: "33333333-3333-4333-8333-aaaaaaaaaaaa"
    name: "Deduplicate"
    module: {id: "deterministic-dedupe", version: "1.0.0"}
    params:
      doi_match: true
      title_similarity_threshold: 0.95
      author_overlap_threshold: 0.5
  - id: "44444444-4444-4444-8444-aaaaaaaaaaaa"
    name: "LLM Screener"
    module: {id: "llm-screener", version: "0.1.0"}
    params:
      provider: "ollama"
      model: "test-model"
      inclusion_criteria: ["bibliometrics"]
      exclusion_criteria: ["off-topic"]
      confidence_threshold: 0.7
  - id: "55555555-5555-4555-8555-aaaaaaaaaaaa"
    name: "PRISMA Flow"
    module: {id: "prisma-flow", version: "0.1.0"}
    params: {}
edges:
  - from: {node_id: "11111111-1111-4111-8111-aaaaaaaaaaaa", port: "records"}
    to: {node_id: "22222222-2222-4222-8222-aaaaaaaaaaaa", port: "records"}
  - from: {node_id: "22222222-2222-4222-8222-aaaaaaaaaaaa", port: "normalized"}
    to: {node_id: "33333333-3333-4333-8333-aaaaaaaaaaaa", port: "normalized"}
  - from: {node_id: "33333333-3333-4333-8333-aaaaaaaaaaaa", port: "deduped"}
    to: {node_id: "44444444-4444-4444-8444-aaaaaaaaaaaa", port: "records"}
  - from: {node_id: "44444444-4444-4444-8444-aaaaaaaaaaaa", port: "screening_decisions"}
    to: {node_id: "55555555-5555-4555-8555-aaaaaaaaaaaa", port: "screening_decisions"}
narrative_journal_ref: "journal.md"
`, "utf8");
    freezeProtocol(protocolPath, paths);

    const manifest: RunManifest = await runProtocol(protocolPath, paths, { projectDir });

    expect(manifest.completed_status).toBe("success");
    expect(manifest.nodes).toHaveLength(5);

    const findOutput = (nodeId: string, port: string) => {
      const node = manifest.nodes.find((n) => n.node_id === nodeId);
      const output = node?.outputs.find((o) => o.port === port);
      if (!output) throw new Error(`output ${port} not found on ${nodeId}`);
      return output;
    };

    const sourceArt = findOutput("11111111-1111-4111-8111-aaaaaaaaaaaa", "records");
    const normalizedArt = findOutput("22222222-2222-4222-8222-aaaaaaaaaaaa", "normalized");
    const dedupedArt = findOutput("33333333-3333-4333-8333-aaaaaaaaaaaa", "deduped");
    const corpusLockArt = findOutput("33333333-3333-4333-8333-aaaaaaaaaaaa", "corpus_lock");
    const decisionsArt = findOutput("44444444-4444-4444-8444-aaaaaaaaaaaa", "screening_decisions");
    const prismaArt = findOutput("55555555-5555-4555-8555-aaaaaaaaaaaa", "prisma_flow");

    for (const a of [sourceArt, normalizedArt, dedupedArt, corpusLockArt, decisionsArt, prismaArt]) {
      expect(a.artifact_id).toMatch(/^sha256:/);
    }

    // Verify corpus_lock was generated and copied to project root (Tier 1A item)
    expect(fs.existsSync(path.join(projectDir, "corpus.lock.json"))).toBe(true);

    // PRISMA flow should report all records as included (mock said "include" for every record)
    const prismaHash = prismaArt.artifact_id.replace("sha256:", "");
    const prismaDataPath = path.join(
      projectDir,
      ".rwb", "artifacts",
      prismaHash.slice(0, 2),
      prismaHash,
      "data.json",
    );
    expect(fs.existsSync(prismaDataPath)).toBe(true);
    const prisma = JSON.parse(fs.readFileSync(prismaDataPath, "utf8"));
    expect(prisma).toHaveProperty("identified");
    expect(prisma).toHaveProperty("included");
    expect(prisma).toHaveProperty("excluded");
    expect(prisma.included).toBeGreaterThan(0);
    expect(prisma.excluded).toBe(0);
    expect(prisma.identified).toBe(prisma.screened);

    // Screener node should report LLM usage > 0
    const screenerNode = manifest.nodes.find((n) => n.node_id === "44444444-4444-4444-8444-aaaaaaaaaaaa");
    expect(screenerNode?.llm_calls).toBeGreaterThan(0);
    expect(screenerNode?.tokens).toBeGreaterThan(0);

    // Run totals reflect the screener's usage
    expect(manifest.total_llm_calls).toBe(screenerNode?.llm_calls);

    fs.rmSync(projectDir, { recursive: true });
  });

  it("rejects all records when mock returns 'exclude' (decision pass-through)", async () => {
    process.env.RWB_LLM_MOCK_RESPONSE = JSON.stringify({
      text: JSON.stringify({
        recommendation: "exclude",
        confidence: 0.99,
        rationale: "off topic",
      }),
      input_tokens: 20,
      output_tokens: 10,
    });

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-sysrev-exclude-"));
    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    fs.writeFileSync(protocolPath, `protocol_version: "1.0"
project:
  id: "babababa-baba-4aba-8aba-babababababa"
  name: "Exclude all"
  created_at: "2026-05-25T00:00:00.000Z"
  created_by: "test"
frozen:
  is_frozen: false
budget:
  max_llm_calls_per_run: 50
  max_tokens_per_run: 200000
  max_cost_usd_per_run: 25
  stop_on_budget_exceeded: true
reproduction_policy: {}
nodes:
  - id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    name: "Fixture"
    module: {id: "openalex-source", version: "1.0.0"}
    params: {source_mode: "fixture", fixture_id: "tiny-corpus"}
  - id: "bbbbbbbb-bbbb-4bbb-8bbb-aaaaaaaaaaaa"
    name: "Normalize"
    module: {id: "record-normalizer", version: "1.0.0"}
    params: {}
  - id: "cccccccc-cccc-4ccc-8ccc-aaaaaaaaaaaa"
    name: "Screener"
    module: {id: "llm-screener", version: "0.1.0"}
    params: {provider: "ollama", model: "test-model", inclusion_criteria: ["x"], exclusion_criteria: ["y"], confidence_threshold: 0.5}
  - id: "dddddddd-dddd-4ddd-8ddd-aaaaaaaaaaaa"
    name: "PRISMA"
    module: {id: "prisma-flow", version: "0.1.0"}
    params: {}
edges:
  - from: {node_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", port: "records"}
    to: {node_id: "bbbbbbbb-bbbb-4bbb-8bbb-aaaaaaaaaaaa", port: "records"}
  - from: {node_id: "bbbbbbbb-bbbb-4bbb-8bbb-aaaaaaaaaaaa", port: "normalized"}
    to: {node_id: "cccccccc-cccc-4ccc-8ccc-aaaaaaaaaaaa", port: "records"}
  - from: {node_id: "cccccccc-cccc-4ccc-8ccc-aaaaaaaaaaaa", port: "screening_decisions"}
    to: {node_id: "dddddddd-dddd-4ddd-8ddd-aaaaaaaaaaaa", port: "screening_decisions"}
`, "utf8");
    freezeProtocol(protocolPath, paths);

    const manifest = await runProtocol(protocolPath, paths, { projectDir });
    expect(manifest.completed_status).toBe("success");

    const prismaArt = manifest.nodes.find((n) => n.node_id === "dddddddd-dddd-4ddd-8ddd-aaaaaaaaaaaa")!.outputs[0];
    const prismaHash = prismaArt.artifact_id.replace("sha256:", "");
    const dataPath = path.join(
      projectDir, ".rwb", "artifacts",
      prismaHash.slice(0, 2),
      prismaHash, "data.json"
    );
    const prisma = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    expect(prisma.included).toBe(0);
    expect(prisma.excluded).toBeGreaterThan(0);

    fs.rmSync(projectDir, { recursive: true });
  });
});
