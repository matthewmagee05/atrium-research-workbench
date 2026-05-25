import http from "node:http";
import { AuditLog } from "../audit/audit-log";
import { ArtifactStore } from "../artifacts/store";
import { addJournalEntry } from "../journal/journal";
import { llmComplete } from "../llm-proxy/proxy";
import { createReviewItem } from "../review/review-queue";
import type { BudgetState } from "../budget/budget";

interface ProxyConfig {
  projectDir: string;
  runId: string;
  nodeId: string;
  budget: BudgetState;
  usagePath?: string;
}

interface ProxyUsage {
  llmCalls: number;
  costUsd: number;
  tokens: number;
}

function writeUsage(config: ProxyConfig, usage: ProxyUsage): void {
  if (!config.usagePath) {
    return;
  }
  const fs = require("node:fs") as typeof import("node:fs");
  fs.writeFileSync(config.usagePath, JSON.stringify(usage, null, 2));
}

async function readBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function writeJson(response: http.ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function main(): Promise<void> {
  const config = JSON.parse(process.env.RWB_PROXY_CONFIG ?? "{}") as ProxyConfig;
  const usage: ProxyUsage = { llmCalls: 0, costUsd: 0, tokens: 0 };
  writeUsage(config, usage);
  const audit = new AuditLog(config.projectDir);
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== "POST") {
        writeJson(response, 405, { error: "method_not_allowed" });
        return;
      }
      const body = await readBody(request);
      if (request.url === "/llm.complete") {
        const result = await llmComplete({
          binding: body.binding as never,
          messages: body.messages as never,
          schema: body.schema as Record<string, unknown> | undefined,
          max_output_tokens: body.max_output_tokens as number | undefined,
          budget: config.budget
        });
        usage.llmCalls += 1;
        usage.costUsd += result.cost_usd_estimate;
        usage.tokens += result.input_tokens + result.output_tokens;
        writeUsage(config, usage);
        audit.append("proxy.llm_complete", {
          run_id: config.runId,
          node_id: config.nodeId,
          model_resolved: result.model_resolved,
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          cost_usd_estimate: result.cost_usd_estimate
        });
        writeJson(response, 200, result);
        return;
      }
      if (request.url === "/journal.note") {
        const path = addJournalEntry(config.projectDir, String(body.text ?? ""), config.nodeId, "module");
        audit.append("proxy.journal_note", { run_id: config.runId, node_id: config.nodeId, journal: path, metadata: body.metadata ?? null });
        writeJson(response, 200, { ok: true, journal_path: path });
        return;
      }
      if (request.url === "/review.request") {
        const item = createReviewItem(config.projectDir, body.payload ?? {}, body.schema ?? {}, { runId: config.runId, nodeId: config.nodeId });
        audit.append("proxy.review_request", { run_id: config.runId, node_id: config.nodeId, review_id: item.id });
        writeJson(response, 200, item);
        return;
      }
      if (request.url === "/progress.update") {
        audit.append("proxy.progress_update", { run_id: config.runId, node_id: config.nodeId, percent: body.percent ?? null, message: body.message ?? "" });
        writeJson(response, 200, { ok: true });
        return;
      }
      if (request.url === "/artifact.read_metadata") {
        const artifactId = String(body.artifact_id ?? "");
        const store = new ArtifactStore(config.projectDir);
        try {
          writeJson(response, 200, store.getMeta(artifactId));
        } finally {
          store.close();
        }
        return;
      }
      writeJson(response, 404, { error: "unknown_operation" });
    } catch (error) {
      writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address === "object") {
      process.stdout.write(`${JSON.stringify({ url: `http://127.0.0.1:${address.port}` })}\n`);
    }
  });
}

void main();
