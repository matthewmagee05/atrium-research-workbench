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

type TokenPrice = { inputPerMillion: number; outputPerMillion: number };

function priceForModel(provider: ModelBinding["provider"], modelId: string): TokenPrice {
  const model = modelId.toLowerCase();
  if (provider === "ollama") {
    return { inputPerMillion: 0, outputPerMillion: 0 };
  }
  if (provider === "openai") {
    if (model.includes("gpt-4o-mini")) return { inputPerMillion: 0.15, outputPerMillion: 0.60 };
    if (model.includes("gpt-4o")) return { inputPerMillion: 2.50, outputPerMillion: 10.00 };
    if (model.includes("gpt-5")) return { inputPerMillion: 1.25, outputPerMillion: 10.00 };
    if (model.includes("gpt-4.1-mini")) return { inputPerMillion: 0.40, outputPerMillion: 1.60 };
    if (model.includes("gpt-4.1-nano")) return { inputPerMillion: 0.10, outputPerMillion: 0.40 };
    if (model.includes("gpt-4.1")) return { inputPerMillion: 2.00, outputPerMillion: 8.00 };
  }
  if (provider === "anthropic") {
    if (model.includes("opus")) return { inputPerMillion: 15.00, outputPerMillion: 75.00 };
    if (model.includes("sonnet")) return { inputPerMillion: 3.00, outputPerMillion: 15.00 };
    if (model.includes("haiku")) return { inputPerMillion: 0.80, outputPerMillion: 4.00 };
  }
  return { inputPerMillion: 0, outputPerMillion: 0 };
}

export function estimateCostUsd(binding: ModelBinding, inputTokens: number, outputTokens: number): number {
  const price = priceForModel(binding.provider, binding.model_id);
  return Number((((inputTokens / 1_000_000) * price.inputPerMillion) + ((outputTokens / 1_000_000) * price.outputPerMillion)).toFixed(8));
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
  const estimatedInputTokens = estimateTokens(request.messages.map((message) => message.content).join("\n"));
  if (process.env.RWB_LLM_MOCK_RESPONSE) {
    const mock = JSON.parse(process.env.RWB_LLM_MOCK_RESPONSE) as { text?: string; input_tokens?: number; output_tokens?: number };
    const inputTokens = mock.input_tokens ?? estimatedInputTokens;
    const outputTokens = mock.output_tokens ?? estimateTokens(mock.text ?? "");
    const costUsd = estimateCostUsd(request.binding, inputTokens, outputTokens);
    assertBudgetAvailable(request.budget, { cost_usd: costUsd, calls: 1, tokens: inputTokens + outputTokens });
    return {
      text: mock.text ?? "",
      model_resolved: model.model_resolved,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd_estimate: costUsd,
      raw_response: { mocked: true }
    };
  }
  const credential = await getCredential(request.binding.provider);
  if (!credential && request.binding.provider !== "ollama") {
    throw new Error(`Missing credential for ${request.binding.provider}`);
  }
  const maxOutputTokens = request.max_output_tokens ?? 2048;
  assertBudgetAvailable(request.budget, {
    cost_usd: estimateCostUsd(request.binding, estimatedInputTokens, maxOutputTokens),
    calls: 1,
    tokens: estimatedInputTokens + maxOutputTokens
  });
  const result =
    request.binding.provider === "openai" ? await callOpenAI(request, credential as string) :
    request.binding.provider === "anthropic" ? await callAnthropic(request, credential as string) :
    await callOllama(request, credential ?? "http://localhost:11434");
  const inputTokens = result.inputTokens ?? estimatedInputTokens;
  const outputTokens = result.outputTokens ?? estimateTokens(result.text);
  const costUsd = estimateCostUsd(request.binding, inputTokens, outputTokens);
  assertBudgetAvailable(request.budget, { cost_usd: costUsd, calls: 1, tokens: inputTokens + outputTokens });
  return {
    text: result.text,
    model_resolved: model.model_resolved,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd_estimate: costUsd,
    raw_response: result.raw
  };
}
