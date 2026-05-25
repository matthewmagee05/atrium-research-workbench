import { assertBudgetAvailable, type BudgetState } from "../budget/budget";
import { getCredential } from "../credentials/credentials";
import { resolveModel, type ModelBinding } from "../model-registry/model-registry";

export interface LlmCompleteRequest {
  binding: ModelBinding;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  schema?: Record<string, unknown>;
  budget: BudgetState;
  max_output_tokens?: number;
}

export interface LlmCompleteResponse {
  text: string;
  model_resolved: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd_estimate: number;
  raw_response: unknown;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function responseTextFromOpenAI(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }
  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) {
      if (typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("");
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function callOpenAI(request: LlmCompleteRequest, apiKey: string): Promise<{ text: string; raw: unknown; inputTokens?: number; outputTokens?: number }> {
  const body: Record<string, unknown> = {
    model: request.binding.model_id,
    input: request.messages.map((message) => ({ role: message.role, content: message.content })),
    max_output_tokens: request.max_output_tokens ?? 2048
  };
  if (request.schema) {
    body.text = {
      format: {
        type: "json_schema",
        name: "research_workbench_output",
        strict: true,
        schema: request.schema
      }
    };
  }
  const payload = await postJson("https://api.openai.com/v1/responses", { authorization: `Bearer ${apiKey}` }, body);
  const usage = payload.usage as Record<string, unknown> | undefined;
  return {
    text: responseTextFromOpenAI(payload),
    raw: payload,
    inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : undefined
  };
}

async function callAnthropic(request: LlmCompleteRequest, apiKey: string): Promise<{ text: string; raw: unknown; inputTokens?: number; outputTokens?: number }> {
  const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const messages = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role, content: message.content }));
  const body: Record<string, unknown> = {
    model: request.binding.model_id,
    max_tokens: request.max_output_tokens ?? 2048,
    messages
  };
  if (system) {
    body.system = system;
  }
  const payload = await postJson("https://api.anthropic.com/v1/messages", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01"
  }, body);
  const content = Array.isArray(payload.content) ? payload.content : [];
  const text = (content as Array<Record<string, unknown>>)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
  const usage = payload.usage as Record<string, unknown> | undefined;
  return {
    text,
    raw: payload,
    inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : undefined
  };
}

async function callOllama(request: LlmCompleteRequest, baseUrl: string): Promise<{ text: string; raw: unknown; inputTokens?: number; outputTokens?: number }> {
  const body: Record<string, unknown> = {
    model: request.binding.model_id,
    messages: request.messages,
    stream: false
  };
  if (request.schema) {
    body.format = request.schema;
  }
  const payload = await postJson(`${baseUrl.replace(/\/$/, "")}/api/chat`, {}, body);
  const message = payload.message as Record<string, unknown> | undefined;
  return {
    text: typeof message?.content === "string" ? message.content : "",
    raw: payload,
    inputTokens: typeof payload.prompt_eval_count === "number" ? payload.prompt_eval_count : undefined,
    outputTokens: typeof payload.eval_count === "number" ? payload.eval_count : undefined
  };
}

export async function llmComplete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
  const model = resolveModel(request.binding);
  if (process.env.RWB_LLM_MOCK_RESPONSE) {
    const mock = JSON.parse(process.env.RWB_LLM_MOCK_RESPONSE) as { text?: string; input_tokens?: number; output_tokens?: number };
    return {
      text: mock.text ?? "",
      model_resolved: model.model_resolved,
      input_tokens: mock.input_tokens ?? 0,
      output_tokens: mock.output_tokens ?? 0,
      cost_usd_estimate: 0,
      raw_response: { mocked: true }
    };
  }
  const credential = await getCredential(request.binding.provider);
  if (!credential && request.binding.provider !== "ollama") {
    throw new Error(`Missing credential for ${request.binding.provider}`);
  }
  const estimatedInputTokens = estimateTokens(request.messages.map((message) => message.content).join("\n"));
  assertBudgetAvailable(request.budget, { cost_usd: 0, calls: 1, tokens: estimatedInputTokens + (request.max_output_tokens ?? 2048) });
  const result =
    request.binding.provider === "openai" ? await callOpenAI(request, credential as string) :
    request.binding.provider === "anthropic" ? await callAnthropic(request, credential as string) :
    await callOllama(request, credential ?? "http://localhost:11434");
  const inputTokens = result.inputTokens ?? estimatedInputTokens;
  const outputTokens = result.outputTokens ?? estimateTokens(result.text);
  return {
    text: result.text,
    model_resolved: model.model_resolved,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd_estimate: 0,
    raw_response: result.raw
  };
}
