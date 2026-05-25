export type RunProgressPayload = {
  type: "node_started" | "node_completed" | "node_skipped" | "run_started" | "run_completed" | "run_failed";
  runId: string;
  nodeId?: string;
  moduleId?: string;
  order?: number;
  totalNodes?: number;
  durationMs?: number;
  cacheHit?: boolean;
  llmCalls?: number;
  tokens?: number;
  costUsd?: number;
  cumulativeLlmCalls?: number;
  cumulativeTokens?: number;
  cumulativeCostUsd?: number;
  error?: string;
};

export type CredentialTestPayload = {
  ok: boolean;
  status?: number;
  detail?: string;
};

declare global {
  interface Window {
    rwb?: {
      listModules: () => Promise<Array<Record<string, unknown>>>;
      listReviewItems: (projectDir: string) => Promise<Array<Record<string, unknown>>>;
      resolveReviewItem: (projectDir: string, reviewId: string, decision: unknown) => Promise<Record<string, unknown>>;
      setCredential: (provider: "anthropic" | "ollama" | "openai", value: string) => Promise<void>;
      testCredential: (provider: "anthropic" | "ollama" | "openai", value: string) => Promise<CredentialTestPayload>;
      openProject: () => Promise<string | null>;
      validateProtocol: (protocolPath: string) => Promise<unknown>;
      freezeProtocol: (protocolPath: string) => Promise<unknown>;
      run: (protocolPath: string, options?: { mode?: string; varianceIterations?: number }) => Promise<unknown>;
      generateMethods: (projectDir: string) => Promise<string>;
      lockEnvironment: (projectDir: string) => Promise<unknown>;
      exportBundle: (projectDir: string) => Promise<string | null>;
      replayBundle: (bundlePath: string) => Promise<unknown>;
      importBundle: () => Promise<string | null>;
      verifyBundle: (bundlePath: string, options?: { trusted?: boolean }) => Promise<{ ok: boolean; checked: Array<{ node_id: string; port: string; expected: string; actual: string; ok: boolean }>; trustReport: unknown }>;
      inspectBundleTrust: (bundlePath: string) => Promise<{ allTrusted: boolean; modules: Array<{ moduleId: string; bundledVersion: string; localVersion?: string; status: string }>; hashMismatches: Array<{ moduleId: string }> }>;
      diffArtifacts: (artifactIdA: string, artifactIdB: string, projectDir: string) => Promise<{ ok: boolean; rowsA: number; rowsB: number; diffPath?: string; diff?: string }>;
      onRunProgress: (handler: (event: RunProgressPayload) => void) => () => void;
    };
  }
}

export {};
