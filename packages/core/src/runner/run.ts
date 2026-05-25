import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import Ajv from "ajv";
import { ArtifactStore, type StoredArtifact } from "../artifacts/store";
import { AuditLog } from "../audit/audit-log";
import { canonicalJson } from "../canonicalize/json";
import { sha256 } from "../canonicalize/hash";
import { ensureDir, readJsonFile, writeJsonFile } from "../fs-utils";
import { loadModule, schemaPath } from "../modules/registry";
import { protocolHash, readProtocol, validateProtocol } from "../protocol/service";
import { scrubSecrets } from "../credentials/credentials";
import { resolvedDecisionsForNode } from "../review/review-queue";
import { computeVarianceMetrics } from "../variance/metrics";
import { startProxyProcess } from "./proxy-process";
import { buildSpawnOptions, DEFAULT_MODULE_TIMEOUT_MS, filterEnvForModule, resolveCommand, wrapCommandForSandbox } from "./sandbox";
import type { CorePaths, DeterminismLevel, Protocol, ProtocolNode, RunManifest, RunManifestNode, RunMode, VarianceAuditResult } from "../types";

export interface RunProgressEvent {
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
}

export interface RunOptions {
  mode?: RunMode;
  projectDir?: string;
  varianceIterations?: number;
  existingManifestPath?: string;
  onProgress?: (event: RunProgressEvent) => void;
}

interface NodeRuntimeResult {
  manifestNode: RunManifestNode;
  outputs: Map<string, StoredArtifact>;
}

interface ProxyUsage {
  llmCalls: number;
  costUsd: number;
  tokens: number;
}

function cacheKeyForNode(args: {
  moduleId: string;
  moduleVersion: string;
  manifestHash: string;
  inputArtifacts: Array<{ artifact_id: string }>;
  params: Record<string, unknown>;
  promptHashes?: string[];
  resolvedModelIds?: string[];
}): string {
  return sha256(canonicalJson({
    module_id: args.moduleId,
    module_version: args.moduleVersion,
    manifest_hash: args.manifestHash,
    input_artifact_ids: args.inputArtifacts.map((input) => input.artifact_id).sort(),
    params_hash: sha256(canonicalJson(args.params)),
    prompt_hashes: (args.promptHashes ?? []).slice().sort(),
    resolved_model_ids: (args.resolvedModelIds ?? []).slice().sort()
  }));
}

function topologicalNodes(protocol: Protocol): ProtocolNode[] {
  const byId = new Map(protocol.nodes.map((node) => [node.id, node]));
  const indegree = new Map(protocol.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of protocol.edges ?? []) {
    indegree.set(edge.to.node_id, (indegree.get(edge.to.node_id) ?? 0) + 1);
    outgoing.set(edge.from.node_id, [...(outgoing.get(edge.from.node_id) ?? []), edge.to.node_id]);
  }
  const queue = protocol.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const ordered: ProtocolNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const node = byId.get(id);
    if (!node) {
      continue;
    }
    ordered.push(node);
    for (const next of outgoing.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
      }
    }
  }
  if (ordered.length !== protocol.nodes.length) {
    throw new Error("Protocol graph contains a cycle");
  }
  return ordered;
}

function inputArtifactsForNode(protocol: Protocol, node: ProtocolNode, completed: Map<string, Map<string, StoredArtifact>>): Array<{ port: string; artifact_id: string; dataPath: string }> {
  return (protocol.edges ?? [])
    .filter((edge) => edge.to.node_id === node.id)
    .map((edge) => {
      const sourceOutputs = completed.get(edge.from.node_id);
      const artifact = sourceOutputs?.get(edge.from.port);
      if (!artifact) {
        throw new Error(`Missing input artifact for ${node.id}:${edge.to.port} from ${edge.from.node_id}:${edge.from.port}`);
      }
      return { port: edge.to.port, artifact_id: artifact.meta.artifact_id, dataPath: artifact.dataPath };
    });
}

function validateJson(schemaFile: string, dataFile: string): void {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = readJsonFile<Record<string, unknown>>(schemaFile);
  const data = readJsonFile<unknown>(dataFile);
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    throw new Error(`Output schema validation failed for ${dataFile}: ${ajv.errorsText(validate.errors)}`);
  }
}

function validateValue(schemaFile: string, value: unknown, label: string): void {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = readJsonFile<Record<string, unknown>>(schemaFile);
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    throw new Error(`${label} schema validation failed: ${ajv.errorsText(validate.errors)}`);
  }
}

function copyRawResponses(scratchDir: string, projectDir: string, runId: string, nodeId: string): void {
  const rawDir = path.join(scratchDir, "raw_responses");
  if (!fs.existsSync(rawDir)) {
    return;
  }
  const dest = path.join(projectDir, ".rwb", "raw_responses", runId, nodeId);
  ensureDir(dest);
  fs.cpSync(rawDir, dest, { recursive: true, force: true });
}

function collectExternalApiCalls(scratchDir: string, networkDomains: string[]): Array<{ file: string; content_hash: string; domains: string[] }> {
  const rawDir = path.join(scratchDir, "raw_responses");
  if (!fs.existsSync(rawDir)) return [];
  const entries = fs.readdirSync(rawDir).filter((f) => f.endsWith(".json")).sort();
  return entries.map((file) => {
    const content = fs.readFileSync(path.join(rawDir, file));
    return { file, content_hash: sha256(content), domains: networkDomains };
  });
}

async function executeNode(
  node: ProtocolNode,
  order: number,
  protocol: Protocol,
  paths: CorePaths,
  projectDir: string,
  runId: string,
  mode: RunMode,
  store: ArtifactStore,
  completed: Map<string, Map<string, StoredArtifact>>,
  audit: AuditLog
): Promise<NodeRuntimeResult> {
  const loaded = loadModule(node.module.id, paths.modulesRoot);
  if (mode === "replay") {
    throw new Error("Replay mode must use bundle replay and must not invoke module subprocesses");
  }

  const startedAt = new Date().toISOString();
  const start = Date.now();
  const scratchDir = path.join(projectDir, ".rwb", "scratch", runId, `${order}-${node.id}`);
  ensureDir(scratchDir);
  const paramsPath = path.join(scratchDir, "params.json");
  const params = node.params ?? {};
  validateValue(schemaPath(loaded, loaded.manifest.params_schema), params, `Params for ${loaded.manifest.id}`);
  writeJsonFile(paramsPath, params);
  const inputArtifacts = inputArtifactsForNode(protocol, node, completed);
  for (const input of inputArtifacts) {
    const inputDecl = loaded.manifest.inputs.find((decl) => decl.name === input.port);
    if (!inputDecl) {
      throw new Error(`Module ${loaded.manifest.id} received undeclared input port: ${input.port}`);
    }
    validateJson(schemaPath(loaded, inputDecl.schema), input.dataPath);
  }
  const cacheKey = cacheKeyForNode({
    moduleId: loaded.manifest.id,
    moduleVersion: loaded.manifest.version,
    manifestHash: loaded.manifestHash,
    inputArtifacts,
    params
  });
  const outputPorts = loaded.manifest.outputs.map((output) => output.name);
  const canUseCache = mode === "execute" && loaded.manifest.determinism.level !== "stochastic";
  if (canUseCache) {
    const cached = store.findByCacheKey(cacheKey, outputPorts);
    if (cached) {
      const now = new Date().toISOString();
      audit.append("module.cache_hit", { run_id: runId, node_id: node.id, module_id: loaded.manifest.id, cache_key: cacheKey });
      return {
        outputs: cached,
        manifestNode: {
          node_id: node.id,
          module: `${loaded.manifest.id}@${loaded.manifest.version}`,
          manifest_hash: loaded.manifestHash,
          execution_order: order,
          status: "completed",
          cache_hit: true,
          started_at: now,
          completed_at: now,
          duration_ms: 0,
          inputs: inputArtifacts.map((input) => ({ port: input.port, artifact_id: input.artifact_id })),
          outputs: [...cached.entries()].map(([port, artifact]) => ({
            port,
            artifact_id: artifact.meta.artifact_id,
            content_hash: artifact.meta.content_hash
          })),
          llm_calls: 0,
          tokens: 0,
          cost_usd: 0
        }
      };
    }
  }
  const outputPaths = new Map<string, string>();
  const proxyUsage: ProxyUsage = { llmCalls: 0, costUsd: 0, tokens: 0 };
  const moduleBudget = loaded.manifest.llm?.budget ?? {};
  const proxyUsagePath = path.join(scratchDir, "proxy-usage.json");
  const proxy = await startProxyProcess({
    projectDir,
    runId,
    nodeId: node.id,
    usagePath: proxyUsagePath,
    budget: {
      max_cost_usd_per_run: Number(moduleBudget.max_cost_usd_per_run ?? 0),
      max_llm_calls_per_run: Number(moduleBudget.max_calls_per_run ?? 0),
      max_tokens_per_run: Number(moduleBudget.max_tokens_per_run ?? 0),
      spent_usd: 0,
      calls: 0,
      tokens: 0
    }
  });
  const env: NodeJS.ProcessEnv = {
    ...filterEnvForModule(process.env),
    RWB_RUN_ID: runId,
    RWB_NODE_ID: node.id,
    RWB_MODE: mode,
    RWB_MODULE_VERSION: loaded.manifest.version,
    RWB_PARAMS: paramsPath,
    RWB_PROXY_SOCKET: proxy.url,
    RWB_LOG_PATH: path.join(scratchDir, "module.log"),
    RWB_ARTIFACT_DIR: scratchDir,
    RWB_FIXTURES_DIR: paths.fixturesRoot
  };
  for (const input of inputArtifacts) {
    env[`RWB_INPUT_${input.port}`] = input.dataPath;
  }
  for (const output of loaded.manifest.outputs) {
    const outputPath = path.join(scratchDir, `${output.name}.json`);
    outputPaths.set(output.name, outputPath);
    env[`RWB_OUTPUT_${output.name}`] = outputPath;
  }

  audit.append("module.start", { run_id: runId, node_id: node.id, module_id: loaded.manifest.id });
  const rawCommand = resolveCommand(loaded.manifest.runtime, loaded.dir);
  const args = loaded.manifest.runtime === "binary" ? [] : [path.join(loaded.dir, loaded.manifest.entry)];
  const sandbox = wrapCommandForSandbox(rawCommand, {
    moduleDir: loaded.dir,
    scratchDir,
    allowNetwork: loaded.manifest.side_effects?.network ?? false,
    allowedDomains: loaded.manifest.side_effects?.network_domains ?? [],
  });
  const finalCommand = sandbox.command;
  const finalArgs = [...sandbox.prefixArgs, ...args];
  if (sandbox.mechanism !== "none") {
    audit.append("module.sandbox", { run_id: runId, node_id: node.id, mechanism: sandbox.mechanism });
  }
  const spawnOptions = buildSpawnOptions(scratchDir, env, DEFAULT_MODULE_TIMEOUT_MS);
  try {
    const child = spawnSync(finalCommand, finalArgs, spawnOptions);
    if (child.status !== 0) {
      const safeStderr = scrubSecrets(child.stderr?.toString() ?? "");
      const safeStdout = scrubSecrets(child.stdout?.toString() ?? "");
      audit.append("module.failed", { run_id: runId, node_id: node.id, stderr: safeStderr, stdout: safeStdout });
      throw new Error(`Module ${loaded.manifest.id} failed: ${safeStderr || safeStdout}`);
    }
  } finally {
    proxy.stop();
    if (sandbox.cleanup) sandbox.cleanup();
  }
  if (fs.existsSync(proxyUsagePath)) {
    const usage = readJsonFile<ProxyUsage>(proxyUsagePath);
    proxyUsage.llmCalls = usage.llmCalls;
    proxyUsage.costUsd = usage.costUsd;
    proxyUsage.tokens = usage.tokens;
  }
  copyRawResponses(scratchDir, projectDir, runId, node.id);

  const outputs = new Map<string, StoredArtifact>();
  const durationMs = Date.now() - start;
  const figureSpecOutputs = loaded.manifest.outputs.filter((o) => o.output_kind === "figure_spec");
  const renderedFigureOutputs = loaded.manifest.outputs.filter((o) => o.output_kind === "rendered_figure");
  const nonRenderedOutputs = loaded.manifest.outputs.filter((o) => o.output_kind !== "rendered_figure");
  for (const output of nonRenderedOutputs) {
    const outputPath = outputPaths.get(output.name) as string;
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Module ${loaded.manifest.id} did not write output ${output.name}`);
    }
    const outputSchemaPath = schemaPath(loaded, output.schema);
    validateJson(outputSchemaPath, outputPath);
    const stored = store.storeJsonArtifact({
      projectDir,
      runId,
      nodeId: node.id,
      module: { id: loaded.manifest.id, version: loaded.manifest.version, manifestHash: loaded.manifestHash },
      determinismLevel: loaded.manifest.determinism.level,
      outputKind: output.output_kind,
      outputPath,
      outputPort: output.name,
      schemaPath: outputSchemaPath,
      inputs: inputArtifacts.map((input) => ({ port: input.port, artifact_id: input.artifact_id })),
      params,
      durationMs,
      cacheKey
    });
    if (output.name === "corpus_lock") {
      fs.copyFileSync(stored.dataPath, path.join(projectDir, "corpus.lock.json"));
    }
    outputs.set(output.name, stored);
  }
  const figureSpecContentHash = figureSpecOutputs.length > 0
    ? outputs.get(figureSpecOutputs[0].name)?.meta.content_hash
    : undefined;
  for (const output of renderedFigureOutputs) {
    const outputPath = outputPaths.get(output.name) as string;
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Module ${loaded.manifest.id} did not write output ${output.name}`);
    }
    const outputSchemaPath = schemaPath(loaded, output.schema);
    validateJson(outputSchemaPath, outputPath);
    const stored = store.storeJsonArtifact({
      projectDir,
      runId,
      nodeId: node.id,
      module: { id: loaded.manifest.id, version: loaded.manifest.version, manifestHash: loaded.manifestHash },
      determinismLevel: loaded.manifest.determinism.level,
      outputKind: output.output_kind,
      outputPath,
      outputPort: output.name,
      schemaPath: outputSchemaPath,
      inputs: inputArtifacts.map((input) => ({ port: input.port, artifact_id: input.artifact_id })),
      params,
      durationMs,
      cacheKey,
      figureSpecContentHash
    });
    outputs.set(output.name, stored);
  }
  const externalApiCalls = collectExternalApiCalls(scratchDir, loaded.manifest.side_effects?.network_domains ?? []);
  const humanDecisions = resolvedDecisionsForNode(projectDir, runId, node.id);
  if (humanDecisions.length > 0 || externalApiCalls.length > 0) {
    for (const [, stored] of outputs) {
      if (humanDecisions.length > 0) stored.meta.human_decisions = humanDecisions;
      if (externalApiCalls.length > 0) stored.meta.external_api_calls = externalApiCalls;
      writeJsonFile(path.join(stored.dir, "meta.json"), stored.meta);
    }
  }

  const completedAt = new Date().toISOString();
  audit.append("module.completed", { run_id: runId, node_id: node.id, module_id: loaded.manifest.id, duration_ms: durationMs });
  return {
    outputs,
    manifestNode: {
      node_id: node.id,
      module: `${loaded.manifest.id}@${loaded.manifest.version}`,
      manifest_hash: loaded.manifestHash,
      execution_order: order,
      status: "completed",
      cache_hit: false,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      inputs: inputArtifacts.map((input) => ({ port: input.port, artifact_id: input.artifact_id })),
      outputs: [...outputs.entries()].map(([port, artifact]) => ({
        port,
        artifact_id: artifact.meta.artifact_id,
        content_hash: artifact.meta.content_hash
      })),
      llm_calls: proxyUsage.llmCalls,
      tokens: proxyUsage.tokens,
      cost_usd: proxyUsage.costUsd
    }
  };
}

function shouldExecuteNode(mode: RunMode, determinismLevel: DeterminismLevel): boolean {
  switch (mode) {
    case "execute":
    case "full-rerun":
      return true;
    case "deterministic-rerun":
      return determinismLevel === "deterministic";
    case "variance-audit":
      return determinismLevel === "replayable" || determinismLevel === "stochastic";
    default:
      return true;
  }
}

function loadExistingOutputs(
  manifestPath: string,
  store: ArtifactStore
): Map<string, Map<string, StoredArtifact>> {
  const existing = new Map<string, Map<string, StoredArtifact>>();
  if (!fs.existsSync(manifestPath)) return existing;
  const manifest = readJsonFile<RunManifest>(manifestPath);
  for (const node of manifest.nodes) {
    const nodeOutputs = new Map<string, StoredArtifact>();
    for (const output of node.outputs) {
      try {
        const meta = store.getMeta(output.artifact_id);
        const dataPath = store.dataPath(output.artifact_id);
        const dir = path.dirname(dataPath);
        nodeOutputs.set(output.port, { meta, dir, dataPath, port: output.port });
      } catch {
        // artifact not in store
      }
    }
    if (nodeOutputs.size > 0) {
      existing.set(node.node_id, nodeOutputs);
    }
  }
  return existing;
}

export async function runProtocol(protocolPath: string, paths: CorePaths, options: RunOptions = {}): Promise<RunManifest> {
  const projectDir = options.projectDir ?? path.dirname(protocolPath);
  const mode = options.mode ?? "execute";
  if (mode !== "execute" && mode !== "deterministic-rerun" && mode !== "full-rerun" && mode !== "variance-audit") {
    throw new Error(`Unsupported run mode: ${mode}`);
  }
  const protocol = validateProtocol(protocolPath, paths);
  if (!protocol.frozen?.is_frozen) {
    throw new Error("Protocol must be frozen before running");
  }
  const declaredMaxCost = Number(protocol.budget?.max_cost_usd_per_run ?? 0);
  const estimatedMaxCost = protocol.nodes.reduce((sum, node) => {
    const mod = loadModule(node.module.id, paths.modulesRoot);
    return sum + Number(mod.manifest.llm?.budget?.max_cost_usd_per_run ?? 0);
  }, 0);
  if (declaredMaxCost < estimatedMaxCost && protocol.budget?.stop_on_budget_exceeded !== false) {
    throw new Error(`Budget would be exceeded: declared max $${declaredMaxCost}, module maximum $${estimatedMaxCost}`);
  }
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const store = new ArtifactStore(projectDir);
  const audit = new AuditLog(projectDir);
  const completed = new Map<string, Map<string, StoredArtifact>>();
  const manifestNodes: RunManifestNode[] = [];
  const varianceResults: VarianceAuditResult[] = [];
  const varianceIterations = options.varianceIterations ?? 3;
  audit.append("run.start", { run_id: runId, mode, protocol_hash: protocolHash(protocol) });
  const onProgress = options.onProgress;
  const totalNodes = protocol.nodes.length;
  const cumulative = { llmCalls: 0, tokens: 0, costUsd: 0 };
  if (onProgress) {
    try { onProgress({ type: "run_started", runId, totalNodes }); } catch { /* ignore */ }
  }

  const existingManifestPath = options.existingManifestPath
    ?? path.join(projectDir, ".rwb", "run.manifest.json");
  const priorOutputs = (mode === "deterministic-rerun" || mode === "variance-audit")
    ? loadExistingOutputs(existingManifestPath, store)
    : new Map<string, Map<string, StoredArtifact>>();

  try {
    let order = 1;
    for (const node of topologicalNodes(protocol)) {
      const loaded = loadModule(node.module.id, paths.modulesRoot);
      const execute = shouldExecuteNode(mode, loaded.manifest.determinism.level);

      if (!execute) {
        const prior = priorOutputs.get(node.id);
        if (prior && prior.size > 0) {
          completed.set(node.id, prior);
          const now = new Date().toISOString();
          manifestNodes.push({
            node_id: node.id,
            module: `${loaded.manifest.id}@${loaded.manifest.version}`,
            manifest_hash: loaded.manifestHash,
            execution_order: order,
            status: "skipped",
            cache_hit: false,
            started_at: now,
            completed_at: now,
            duration_ms: 0,
            inputs: [],
            outputs: [...prior.entries()].map(([port, artifact]) => ({
              port,
              artifact_id: artifact.meta.artifact_id,
              content_hash: artifact.meta.content_hash
            })),
            llm_calls: 0,
            tokens: 0,
            cost_usd: 0
          });
          audit.append("module.skipped", { run_id: runId, node_id: node.id, module_id: loaded.manifest.id, mode });
          if (onProgress) {
            try { onProgress({ type: "node_skipped", runId, nodeId: node.id, moduleId: loaded.manifest.id, order, totalNodes }); } catch { /* ignore */ }
          }
          order += 1;
          continue;
        }
      }

      if (onProgress) {
        try { onProgress({ type: "node_started", runId, nodeId: node.id, moduleId: loaded.manifest.id, order, totalNodes }); } catch { /* ignore */ }
      }
      const result = await executeNode(node, order, protocol, paths, projectDir, runId, mode, store, completed, audit);
      completed.set(node.id, result.outputs);
      manifestNodes.push(result.manifestNode);
      cumulative.llmCalls += result.manifestNode.llm_calls;
      cumulative.tokens += result.manifestNode.tokens;
      cumulative.costUsd += result.manifestNode.cost_usd;
      if (onProgress) {
        try {
          onProgress({
            type: "node_completed",
            runId,
            nodeId: node.id,
            moduleId: loaded.manifest.id,
            order,
            totalNodes,
            durationMs: result.manifestNode.duration_ms,
            cacheHit: result.manifestNode.cache_hit,
            llmCalls: result.manifestNode.llm_calls,
            tokens: result.manifestNode.tokens,
            costUsd: result.manifestNode.cost_usd,
            cumulativeLlmCalls: cumulative.llmCalls,
            cumulativeTokens: cumulative.tokens,
            cumulativeCostUsd: cumulative.costUsd
          });
        } catch { /* ignore */ }
      }

      if (mode === "variance-audit" && execute) {
        const iterationOutputs: Array<Map<string, StoredArtifact>> = [result.outputs];
        for (let i = 1; i < varianceIterations; i++) {
          const iterResult = await executeNode(node, order, protocol, paths, projectDir, runId, mode, store, completed, audit);
          iterationOutputs.push(iterResult.outputs);
        }
        const portNames = [...result.outputs.keys()];
        const auditOutputs = portNames.map((port) => {
          const ids = iterationOutputs.map((o) => o.get(port)?.meta.artifact_id ?? "");
          const hashes = iterationOutputs.map((o) => o.get(port)?.meta.content_hash ?? "");
          const uniqueHashes = [...new Set(hashes)];
          const artifactPaths = iterationOutputs.map((o) => o.get(port)?.dataPath ?? "").filter(Boolean);
          const metrics = artifactPaths.length >= 2 ? computeVarianceMetrics(artifactPaths) : undefined;
          return {
            port,
            artifactIds: ids,
            contentHashes: hashes,
            allIdentical: uniqueHashes.length === 1,
            uniqueCount: uniqueHashes.length,
            metrics
          };
        });
        varianceResults.push({
          nodeId: node.id,
          moduleId: loaded.manifest.id,
          iterations: varianceIterations,
          outputs: auditOutputs
        });
      }

      order += 1;
    }
    const manifest: RunManifest = {
      run_id: runId,
      protocol_hash: protocolHash(protocol),
      mode,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      completed_status: "success",
      workbench_version: "0.0.0-tier0",
      nodes: manifestNodes,
      total_cost_usd: manifestNodes.reduce((sum, node) => sum + node.cost_usd, 0),
      total_llm_calls: manifestNodes.reduce((sum, node) => sum + node.llm_calls, 0),
      total_tokens: manifestNodes.reduce((sum, node) => sum + node.tokens, 0),
      variance_audit: varianceResults.length > 0 ? varianceResults : undefined
    };
    writeJsonFile(path.join(projectDir, ".rwb", "run.manifest.json"), manifest);
    audit.append("run.completed", { run_id: runId, status: "success" });
    if (onProgress) {
      try {
        onProgress({
          type: "run_completed",
          runId,
          totalNodes,
          cumulativeLlmCalls: manifest.total_llm_calls,
          cumulativeTokens: manifest.total_tokens,
          cumulativeCostUsd: manifest.total_cost_usd
        });
      } catch { /* ignore */ }
    }
    return manifest;
  } catch (error) {
    const manifest: RunManifest = {
      run_id: runId,
      protocol_hash: protocolHash(readProtocol(protocolPath)),
      mode,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      completed_status: "failed",
      workbench_version: "0.0.0-tier0",
      nodes: manifestNodes,
      total_cost_usd: 0,
      total_llm_calls: 0,
      total_tokens: 0
    };
    writeJsonFile(path.join(projectDir, ".rwb", "run.manifest.json"), manifest);
    audit.append("run.completed", { run_id: runId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    if (onProgress) {
      try {
        onProgress({
          type: "run_failed",
          runId,
          totalNodes,
          error: error instanceof Error ? error.message : String(error)
        });
      } catch { /* ignore */ }
    }
    throw error;
  } finally {
    store.close();
  }
}
