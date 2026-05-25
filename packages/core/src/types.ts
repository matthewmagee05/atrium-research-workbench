export type DeterminismLevel = "deterministic" | "replayable" | "volatile" | "stochastic";
export type OutputKind = "structured_data" | "figure_spec" | "rendered_figure" | "report_text";
export type RunMode = "execute" | "replay" | "deterministic-rerun" | "full-rerun" | "variance-audit";

export interface Protocol {
  protocol_version: string;
  project: {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    created_by: string;
  };
  frozen: {
    is_frozen: boolean;
    frozen_at?: string;
    protocol_hash?: string;
    frozen_by?: string;
  };
  budget: Record<string, unknown>;
  reproduction_policy: Record<string, unknown>;
  nodes: ProtocolNode[];
  edges: ProtocolEdge[];
  narrative_journal_ref?: string;
  environment?: Record<string, unknown>;
}

export interface ProtocolNode {
  id: string;
  name: string;
  module: {
    id: string;
    version: string;
  };
  params?: Record<string, unknown>;
  llm_binding?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface ProtocolEdge {
  from: { node_id: string; port: string };
  to: { node_id: string; port: string };
}

export interface ModuleManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  stage: string;
  runtime: "python" | "r" | "node" | "binary";
  entry: string;
  runtime_version: string;
  dependencies?: Record<string, string>;
  inputs: Array<{ name: string; schema: string; optional?: boolean }>;
  outputs: Array<{ name: string; schema: string; description: string; output_kind: OutputKind }>;
  params_schema: string;
  ui_schema?: string;
  llm: {
    required: boolean;
    budget?: Record<string, unknown>;
    prompts?: Array<{ id: string; path: string; version: string }>;
  };
  determinism: {
    level: DeterminismLevel;
    guarantee: string;
    variance_sources?: string[];
    reproduction_metrics?: string[];
  };
  human_in_the_loop: {
    enabled: boolean;
    triggers?: string[];
  };
  side_effects: {
    network: boolean;
    network_domains?: string[];
    filesystem_write: boolean;
    external_processes: boolean;
  };
  author: string;
  license: string;
  documentation_url?: string;
}

export interface ArtifactMeta {
  artifact_id: string;
  content_hash: string;
  created_at: string;
  module: {
    id: string;
    version: string;
    manifest_hash: string;
  };
  determinism_level: DeterminismLevel;
  output_kind: OutputKind;
  run_id: string;
  node_id: string;
  inputs: Array<{ port: string; artifact_id: string }>;
  params: Record<string, unknown>;
  params_hash: string;
  llm_calls: unknown[];
  external_api_calls: unknown[];
  schema: string;
  schema_hash: string;
  row_count?: number;
  size_bytes: number;
  canonicalization_applied: string;
  duration_ms: number;
  human_decisions: unknown[];
}

export interface RunManifest {
  run_id: string;
  protocol_hash: string;
  mode: RunMode;
  started_at: string;
  completed_at: string;
  completed_status: "success" | "partial" | "failed";
  workbench_version: string;
  nodes: RunManifestNode[];
  total_cost_usd: number;
  total_llm_calls: number;
  total_tokens: number;
  variance_audit?: VarianceAuditResult[];
}

export interface RunManifestNode {
  node_id: string;
  module: string;
  manifest_hash: string;
  execution_order: number;
  status: "completed" | "failed" | "replayed" | "skipped";
  cache_hit: boolean;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  inputs: Array<{ port: string; artifact_id: string }>;
  outputs: Array<{ port: string; artifact_id: string; content_hash: string }>;
  llm_calls: number;
  tokens: number;
  cost_usd: number;
}

export interface CorePaths {
  repoRoot: string;
  modulesRoot: string;
  fixturesRoot: string;
}

export interface VarianceAuditResult {
  nodeId: string;
  moduleId: string;
  iterations: number;
  outputs: Array<{
    port: string;
    artifactIds: string[];
    contentHashes: string[];
    allIdentical: boolean;
    uniqueCount: number;
    metrics?: {
      schema_validity: number;
      row_count_agreement: number;
      decision_agreement_rate: number | null;
      field_agreement_rate: number | null;
      distribution_distance: number | null;
    };
  }>;
}

export interface BundleModuleTrust {
  moduleId: string;
  bundledVersion: string;
  bundledManifestHash: string;
  localVersion: string | null;
  localManifestHash: string | null;
  hashMatch: boolean;
  presentLocally: boolean;
  networkDomains: string[];
}

export interface BundleTrustReport {
  allTrusted: boolean;
  modules: BundleModuleTrust[];
  untrustedModules: string[];
  missingLocally: string[];
  hashMismatches: string[];
  networkDomains: string[];
}
