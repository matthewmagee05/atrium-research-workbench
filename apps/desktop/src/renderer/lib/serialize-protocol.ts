import type { ModuleManifest, PipelineEdge, PipelineNode } from "../store/workspace";

export interface SerializedProtocol {
  protocol_version: string;
  project: {
    id: string;
    name: string;
    description: string;
    created_at: string;
    created_by: string;
  };
  frozen: { is_frozen: boolean };
  budget: {
    max_llm_calls_per_run: number;
    max_tokens_per_run: number;
    max_cost_usd_per_run: number;
    require_confirmation_above_usd: number;
    stop_on_budget_exceeded: boolean;
  };
  reproduction_policy: {
    default_mode: string;
    on_volatile_stage: { rerun_warning: boolean };
    on_replayable_stage: { enable_variance_audit: boolean };
    human_decisions: { replay_by_default: boolean; rerun_behavior: string };
  };
  nodes: Array<{
    id: string;
    name: string;
    module: { id: string; version: string };
    params: Record<string, unknown>;
  }>;
  edges: Array<{
    from: { node_id: string; port: string };
    to: { node_id: string; port: string };
  }>;
}

// Coerce arbitrary UUID-shaped strings; the protocol schema expects valid UUID v4-ish IDs.
// Renderer-generated IDs look like "openalex-source-l8x9a2" — produce a stable UUID from them.
function toUuid(seed: string): string {
  // Simple deterministic UUID-shaped output from a hash of the seed. Not crypto.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const hex = (Math.abs(h).toString(16) + seed.replace(/[^a-f0-9]/gi, "").toLowerCase()).padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface SerializeOptions {
  projectId?: string;
  projectName?: string;
  description?: string;
  createdBy?: string;
  budget?: {
    max_llm_calls_per_run: number;
    max_tokens_per_run: number;
    max_cost_usd_per_run: number;
  };
}

export function serializePipelineToProtocol(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  modules: ModuleManifest[],
  options: SerializeOptions = {},
): SerializedProtocol {
  // Estimate a budget that's high enough to clear the runner's pre-check.
  let estimatedMaxCost = 0;
  let estimatedMaxTokens = 0;
  let estimatedMaxCalls = 0;
  for (const node of nodes) {
    const mod = modules.find((m) => m.id === node.moduleId) as (ModuleManifest & {
      llm?: { budget?: { max_cost_usd_per_run?: number; max_tokens_per_run?: number; max_calls_per_run?: number } };
    }) | undefined;
    estimatedMaxCost += Number(mod?.llm?.budget?.max_cost_usd_per_run ?? 0);
    estimatedMaxTokens += Number(mod?.llm?.budget?.max_tokens_per_run ?? 0);
    estimatedMaxCalls += Number(mod?.llm?.budget?.max_calls_per_run ?? 0);
  }

  const idMap = new Map<string, string>();
  for (const node of nodes) {
    idMap.set(node.id, toUuid(node.id));
  }

  return {
    protocol_version: "1.0",
    project: {
      id: options.projectId ?? toUuid("atrium-project-" + Date.now().toString(36)),
      name: options.projectName ?? "Atrium Research Project",
      description: options.description ?? "Composed in the Atrium desktop workbench.",
      created_at: new Date().toISOString(),
      created_by: options.createdBy ?? "atrium-desktop",
    },
    frozen: { is_frozen: false },
    budget: {
      max_llm_calls_per_run: options.budget?.max_llm_calls_per_run ?? Math.max(estimatedMaxCalls, 100),
      max_tokens_per_run: options.budget?.max_tokens_per_run ?? Math.max(estimatedMaxTokens, 200_000),
      max_cost_usd_per_run: options.budget?.max_cost_usd_per_run ?? Math.max(estimatedMaxCost, 25),
      require_confirmation_above_usd: 0,
      stop_on_budget_exceeded: true,
    },
    reproduction_policy: {
      default_mode: "replay",
      on_volatile_stage: { rerun_warning: true },
      on_replayable_stage: { enable_variance_audit: false },
      human_decisions: { replay_by_default: true, rerun_behavior: "treat_as_suggestions" },
    },
    nodes: nodes.map((n) => {
      const mod = modules.find((m) => m.id === n.moduleId);
      return {
        id: idMap.get(n.id) ?? toUuid(n.id),
        name: mod?.name ?? n.moduleId,
        module: { id: n.moduleId, version: mod?.version ?? "1.0.0" },
        params: n.params ?? {},
      };
    }),
    edges: edges.map((e) => ({
      from: { node_id: idMap.get(e.source) ?? toUuid(e.source), port: e.sourcePort },
      to: { node_id: idMap.get(e.target) ?? toUuid(e.target), port: e.targetPort },
    })),
  };
}
