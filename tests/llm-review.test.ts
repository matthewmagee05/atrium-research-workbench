import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createReviewItem,
  exportReviewQueue,
  importReviewQueue,
  initProject,
  listReviewItems,
  llmComplete,
  resolvedDecisionsForNode,
  resolveReviewItem
} from "../packages/core/src";

describe("LLM proxy transports", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
  });

  it("calls OpenAI Responses API and extracts output_text", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: "{\"ok\":true}",
        usage: { input_tokens: 7, output_tokens: 3 }
      })
    } as Response);
    const result = await llmComplete({
      binding: { provider: "openai", model_id: "gpt-5.4" },
      messages: [{ role: "user", content: "Return JSON" }],
      schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
      budget: { max_cost_usd_per_run: 1, max_llm_calls_per_run: 2, max_tokens_per_run: 10000, spent_usd: 0, calls: 0, tokens: 0 }
    });
    expect(result.text).toBe("{\"ok\":true}");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  });

  it("calls Anthropic Messages API and extracts text content", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "answer" }],
        usage: { input_tokens: 4, output_tokens: 2 }
      })
    } as Response);
    const result = await llmComplete({
      binding: { provider: "anthropic", model_id: "claude-sonnet-4-5" },
      messages: [{ role: "user", content: "Hi" }],
      budget: { max_cost_usd_per_run: 1, max_llm_calls_per_run: 2, max_tokens_per_run: 10000, spent_usd: 0, calls: 0, tokens: 0 }
    });
    expect(result.text).toBe("answer");
  });

  it("calls Ollama chat API", async () => {
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: { content: "local" }, prompt_eval_count: 2, eval_count: 1 })
    } as Response);
    const result = await llmComplete({
      binding: { provider: "ollama", model_id: "llama3.1" },
      messages: [{ role: "user", content: "Hi" }],
      budget: { max_cost_usd_per_run: 1, max_llm_calls_per_run: 2, max_tokens_per_run: 10000, spent_usd: 0, calls: 0, tokens: 0 }
    });
    expect(result.text).toBe("local");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/chat");
  });
});

describe("review queue", () => {
  it("creates, lists, and resolves review items", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-review-"));
    initProject(projectDir);
    const item = createReviewItem(projectDir, { claim: "needs review" }, { type: "object" }, { nodeId: "node-1", runId: "run-1" });
    expect(listReviewItems(projectDir, "pending")).toHaveLength(1);
    const resolved = resolveReviewItem(projectDir, item.id, { accepted: true });
    expect(resolved.status).toBe("resolved");
    expect(listReviewItems(projectDir, "pending")).toHaveLength(0);
    expect(listReviewItems(projectDir, "resolved")).toHaveLength(1);
  });

  it("normalizes legacy accept/reject decisions to structured ReviewDecision", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-review-"));
    initProject(projectDir);
    const item = createReviewItem(projectDir, { data: "test" }, { type: "object" }, { nodeId: "n1", runId: "r1" });
    const resolved = resolveReviewItem(projectDir, item.id, { accepted: true });
    expect(resolved.decision).not.toBeNull();
    expect(resolved.decision!.decision_type).toBe("accept");
    expect(resolved.decision!.accepted).toBe(true);
    expect(resolved.decision!.decided_at).toBeTruthy();
  });

  it("normalizes override decisions with corrected_fields", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-review-"));
    initProject(projectDir);
    const item = createReviewItem(projectDir, { data: "test" }, { type: "object" }, { nodeId: "n1", runId: "r1" });
    const resolved = resolveReviewItem(projectDir, item.id, {
      accepted: true,
      corrected_fields: { name: "fixed value" },
      reviewer_rationale: "Field was incorrect"
    });
    expect(resolved.decision!.decision_type).toBe("override");
    expect(resolved.decision!.override_value).toEqual({ name: "fixed value" });
    expect(resolved.decision!.reviewer_rationale).toBe("Field was incorrect");
  });

  it("preserves explicit decision_type when provided", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-review-"));
    initProject(projectDir);
    const item = createReviewItem(projectDir, { data: "test" }, { type: "object" }, { nodeId: "n1", runId: "r1" });
    const resolved = resolveReviewItem(projectDir, item.id, {
      accepted: false,
      decision_type: "defer",
      reviewer_rationale: "Need more data",
      decided_at: "2024-01-01T00:00:00.000Z",
      decided_by: "reviewer@example.com"
    });
    expect(resolved.decision!.decision_type).toBe("defer");
    expect(resolved.decision!.accepted).toBe(false);
    expect(resolved.decision!.decided_by).toBe("reviewer@example.com");
  });

  it("normalizes reviewer ORCID aliases on resolved decisions", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-review-"));
    initProject(projectDir);
    const item = createReviewItem(projectDir, { data: "test" }, { type: "object" }, { nodeId: "n1", runId: "r1" });
    const resolved = resolveReviewItem(projectDir, item.id, {
      accepted: true,
      orcid: "0000-0002-1825-0097",
      decided_by: "reviewer@example.com"
    });
    expect(resolved.decision!.reviewer_orcid).toBe("0000-0002-1825-0097");
  });

  it("resolvedDecisionsForNode returns decisions for a specific run/node", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-review-"));
    initProject(projectDir);

    const item1 = createReviewItem(projectDir, { idx: 1 }, { type: "object" }, { nodeId: "nodeA", runId: "run1" });
    const item2 = createReviewItem(projectDir, { idx: 2 }, { type: "object" }, { nodeId: "nodeA", runId: "run1" });
    const item3 = createReviewItem(projectDir, { idx: 3 }, { type: "object" }, { nodeId: "nodeB", runId: "run1" });

    resolveReviewItem(projectDir, item1.id, { accepted: true, decision_type: "accept", decided_at: new Date().toISOString() });
    resolveReviewItem(projectDir, item2.id, { accepted: false, decision_type: "reject", decided_at: new Date().toISOString() });
    resolveReviewItem(projectDir, item3.id, { accepted: true, decision_type: "accept", decided_at: new Date().toISOString() });

    const decisionsA = resolvedDecisionsForNode(projectDir, "run1", "nodeA");
    expect(decisionsA).toHaveLength(2);
    expect(decisionsA[0].decision_type).toBe("accept");
    expect(decisionsA[1].decision_type).toBe("reject");

    const decisionsB = resolvedDecisionsForNode(projectDir, "run1", "nodeB");
    expect(decisionsB).toHaveLength(1);

    const decisionsNone = resolvedDecisionsForNode(projectDir, "run1", "nonexistent");
    expect(decisionsNone).toHaveLength(0);
  });

  it("exports and imports review queue snapshots with timestamp conflict resolution", () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-review-source-"));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-review-target-"));
    initProject(sourceDir);
    initProject(targetDir);

    const local = createReviewItem(targetDir, { idx: "local-old" }, { type: "object" }, { nodeId: "nodeA", runId: "run1" });
    const source = createReviewItem(sourceDir, { idx: "incoming" }, { type: "object" }, { nodeId: "nodeA", runId: "run1" });

    resolveReviewItem(targetDir, local.id, {
      accepted: false,
      decision_type: "defer",
      decided_at: "2024-01-01T00:00:00.000Z"
    });
    resolveReviewItem(sourceDir, source.id, {
      accepted: true,
      decision_type: "accept",
      decided_at: "2024-01-02T00:00:00.000Z",
      reviewer_orcid: "0000-0002-1825-0097"
    });

    const snapshotPath = path.join(os.tmpdir(), `rwb-review-${Date.now()}.json`);
    const snapshot = exportReviewQueue(sourceDir, snapshotPath);
    const incoming = snapshot.items[0];
    const localItems = listReviewItems(targetDir);
    snapshot.items = [{ ...incoming, id: localItems[0].id }];
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");

    const result = importReviewQueue(targetDir, snapshotPath);
    expect(result).toEqual({ imported: 0, updated: 1, skipped: 0 });
    const updated = listReviewItems(targetDir, "resolved")[0];
    expect(updated.decision!.decision_type).toBe("accept");
    expect(updated.decision!.reviewer_orcid).toBe("0000-0002-1825-0097");
  });
});
