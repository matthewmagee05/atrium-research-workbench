export interface ModelBinding {
  provider: "anthropic" | "ollama" | "openai";
  model_id: string;
  params?: Record<string, unknown>;
}

export interface ResolvedModel {
  provider: string;
  model_id: string;
  model_resolved: string;
  supports_json_schema: boolean;
}

export function resolveModel(binding: ModelBinding): ResolvedModel {
  return {
    provider: binding.provider,
    model_id: binding.model_id,
    model_resolved: binding.model_id,
    supports_json_schema: binding.provider !== "ollama" || binding.model_id.toLowerCase().includes("json")
  };
}
