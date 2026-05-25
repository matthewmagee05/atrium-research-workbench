import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { canonicalJson, canonicalJsonBytes } from "../canonicalize/json";
import { sha256 } from "../canonicalize/hash";
import { ensureDir, readJsonFile, writeJsonFile } from "../fs-utils";
import type { ArtifactMeta, DeterminismLevel, OutputKind } from "../types";

export interface StoreArtifactRequest {
  projectDir: string;
  runId: string;
  nodeId: string;
  module: { id: string; version: string; manifestHash: string };
  determinismLevel: DeterminismLevel;
  outputKind: OutputKind;
  outputPath: string;
  outputPort: string;
  schemaPath: string;
  inputs: Array<{ port: string; artifact_id: string }>;
  params: Record<string, unknown>;
  durationMs: number;
  cacheKey?: string;
  figureSpecContentHash?: string;
}

export interface StoredArtifact {
  meta: ArtifactMeta;
  dir: string;
  dataPath: string;
  port: string;
}

export class ArtifactStore {
  readonly root: string;
  private readonly db: Database.Database;

  constructor(readonly projectDir: string) {
    this.root = path.join(projectDir, ".rwb", "artifacts");
    ensureDir(this.root);
    ensureDir(path.join(projectDir, ".rwb"));
    this.db = new Database(path.join(projectDir, ".rwb", "index.sqlite"));
    this.db.exec(`
      create table if not exists artifacts (
        artifact_id text primary key,
        content_hash text not null,
        module_id text not null,
        node_id text not null,
        output_port text not null,
        data_path text not null,
        meta_path text not null,
        cache_key text,
        created_at text not null
      )
    `);
    const columns = this.db.prepare("pragma table_info(artifacts)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "cache_key")) {
      this.db.exec("alter table artifacts add column cache_key text");
    }
    this.db.exec("create index if not exists idx_artifacts_cache on artifacts(cache_key, output_port)");
  }

  close(): void {
    this.db.close();
  }

  storeJsonArtifact(request: StoreArtifactRequest): StoredArtifact {
    const raw = readJsonFile<unknown>(request.outputPath);
    const canonicalBytes = canonicalJsonBytes(raw);
    const contentHash = sha256(canonicalBytes);
    const paramsHash = sha256(canonicalJson(request.params));
    const schemaHash = sha256(fs.readFileSync(request.schemaPath));
    const envelopeContentHash = request.outputKind === "rendered_figure" && request.figureSpecContentHash
      ? request.figureSpecContentHash
      : contentHash;
    const artifactId = sha256(canonicalJson({
      content_hash: envelopeContentHash,
      module_id: request.module.id,
      module_version: request.module.version,
      manifest_hash: request.module.manifestHash,
      input_artifact_ids: request.inputs.map((input) => input.artifact_id).sort(),
      params_hash: paramsHash,
      prompt_hashes: [],
      resolved_model_ids: []
    }));
    const hashBody = artifactId.replace("sha256:", "");
    const artifactDir = path.join(this.root, hashBody.slice(0, 2), artifactId);
    ensureDir(artifactDir);
    const dataPath = path.join(artifactDir, "data.json");
    fs.writeFileSync(dataPath, canonicalBytes);
    const rowCount = Array.isArray(raw) ? raw.length : undefined;
    const meta: ArtifactMeta = {
      artifact_id: artifactId,
      content_hash: contentHash,
      created_at: new Date().toISOString(),
      module: {
        id: request.module.id,
        version: request.module.version,
        manifest_hash: request.module.manifestHash
      },
      determinism_level: request.determinismLevel,
      output_kind: request.outputKind,
      run_id: request.runId,
      node_id: request.nodeId,
      inputs: request.inputs,
      params: request.params,
      params_hash: paramsHash,
      llm_calls: [],
      external_api_calls: [],
      schema: request.schemaPath,
      schema_hash: schemaHash,
      row_count: rowCount,
      size_bytes: canonicalBytes.byteLength,
      canonicalization_applied: request.outputKind === "rendered_figure" ? "informational" : "json_v1",
      duration_ms: request.durationMs,
      human_decisions: []
    };
    writeJsonFile(path.join(artifactDir, "meta.json"), meta);
    this.db.prepare(`
      insert or replace into artifacts
      (artifact_id, content_hash, module_id, node_id, output_port, data_path, meta_path, cache_key, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meta.artifact_id,
      meta.content_hash,
      meta.module.id,
      meta.node_id,
      request.outputPort,
      dataPath,
      path.join(artifactDir, "meta.json"),
      request.cacheKey ?? null,
      meta.created_at
    );
    return { meta, dir: artifactDir, dataPath, port: request.outputPort };
  }

  findByCacheKey(cacheKey: string, outputPorts: string[]): Map<string, StoredArtifact> | null {
    const artifacts = new Map<string, StoredArtifact>();
    for (const port of outputPorts) {
      const row = this.db.prepare("select artifact_id, data_path, meta_path from artifacts where cache_key = ? and output_port = ? order by created_at desc limit 1")
        .get(cacheKey, port) as { artifact_id: string; data_path: string; meta_path: string } | undefined;
      if (!row) {
        return null;
      }
      const meta = readJsonFile<ArtifactMeta>(row.meta_path);
      artifacts.set(port, {
        meta,
        dataPath: row.data_path,
        dir: path.dirname(row.meta_path),
        port
      });
    }
    return artifacts;
  }

  getMeta(artifactId: string): ArtifactMeta {
    const row = this.db.prepare("select meta_path from artifacts where artifact_id = ?").get(artifactId) as { meta_path: string } | undefined;
    if (!row) {
      const hashBody = artifactId.replace("sha256:", "");
      const metaPath = path.join(this.root, hashBody.slice(0, 2), artifactId, "meta.json");
      if (!fs.existsSync(metaPath)) {
        throw new Error(`Artifact not found: ${artifactId}`);
      }
      return readJsonFile<ArtifactMeta>(metaPath);
    }
    return readJsonFile<ArtifactMeta>(row.meta_path);
  }

  dataPath(artifactId: string): string {
    const row = this.db.prepare("select data_path from artifacts where artifact_id = ?").get(artifactId) as { data_path: string } | undefined;
    if (row) {
      return row.data_path;
    }
    const hashBody = artifactId.replace("sha256:", "");
    const dataPath = path.join(this.root, hashBody.slice(0, 2), artifactId, "data.json");
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Artifact data not found: ${artifactId}`);
    }
    return dataPath;
  }

  importExistingArtifact(artifactDir: string): void {
    const meta = readJsonFile<ArtifactMeta>(path.join(artifactDir, "meta.json"));
    const dataPath = path.join(artifactDir, "data.json");
    this.db.prepare(`
      insert or replace into artifacts
      (artifact_id, content_hash, module_id, node_id, output_port, data_path, meta_path, cache_key, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(meta.artifact_id, meta.content_hash, meta.module.id, meta.node_id, "unknown", dataPath, path.join(artifactDir, "meta.json"), null, meta.created_at);
  }
}
