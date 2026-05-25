interface LlmMessage {
  role: string;
  content: string;
}

interface LlmCompleteOptions {
  provider: string;
  model: string;
  messages: LlmMessage[];
  schema?: Record<string, unknown>;
  maxOutputTokens?: number;
}

interface LlmCompleteResult {
  text: string;
  input_tokens?: number;
  output_tokens?: number;
}

async function call(operation: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = process.env.RWB_PROXY_SOCKET;
  if (!base) throw new Error("RWB_PROXY_SOCKET is not configured");
  const url = `${base.replace(/\/$/, "")}/${operation}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

export async function llmComplete(options: LlmCompleteOptions): Promise<LlmCompleteResult> {
  const result = await call("llm.complete", {
    binding: { provider: options.provider, model_id: options.model },
    messages: options.messages,
    schema: options.schema ?? null,
    max_output_tokens: options.maxOutputTokens ?? null,
  });
  return result as unknown as LlmCompleteResult;
}

export async function journalNote(text: string, metadata?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return call("journal.note", { text, metadata: metadata ?? {} });
}

export async function reviewRequest(payload: Record<string, unknown>, schema: Record<string, unknown>): Promise<Record<string, unknown>> {
  return call("review.request", { payload, schema });
}

export async function progressUpdate(percent: number, message: string): Promise<Record<string, unknown>> {
  return call("progress.update", { percent, message });
}

export async function artifactReadMetadata(artifactId: string): Promise<Record<string, unknown>> {
  return call("artifact.read_metadata", { artifact_id: artifactId });
}
