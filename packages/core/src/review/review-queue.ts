import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { ensureDir, readJsonFile, writeJsonFile } from "../fs-utils";

export type ReviewStatus = "pending" | "resolved";

export type ReviewDecisionType =
  | "accept"
  | "reject"
  | "override"
  | "edit"
  | "defer"
  | "custom";

export interface ReviewDecision {
  accepted: boolean;
  decision_type: ReviewDecisionType;
  override_value?: unknown;
  reviewer_rationale?: string;
  decided_at: string;
  decided_by?: string;
  reviewer_orcid?: string;
  [key: string]: unknown;
}

export interface ReviewItem {
  id: string;
  project_dir: string;
  run_id: string | null;
  node_id: string | null;
  status: ReviewStatus;
  payload: unknown;
  schema: unknown;
  decision: ReviewDecision | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ReviewQueueSnapshot {
  schema_version: "review-queue.v1";
  exported_at: string;
  items: ReviewItem[];
}

export interface ReviewQueueImportResult {
  imported: number;
  updated: number;
  skipped: number;
  output_path?: string;
}

function dbFor(projectDir: string): Database.Database {
  ensureDir(path.join(projectDir, ".rwb"));
  const db = new Database(path.join(projectDir, ".rwb", "review.sqlite"));
  db.exec(`
    create table if not exists review_items (
      id text primary key,
      project_dir text not null,
      run_id text,
      node_id text,
      status text not null,
      payload_json text not null,
      schema_json text not null,
      decision_json text,
      created_at text not null,
      resolved_at text
    )
  `);
  return db;
}

function rowToItem(row: Record<string, unknown>): ReviewItem {
  return {
    id: row.id as string,
    project_dir: row.project_dir as string,
    run_id: row.run_id as string | null,
    node_id: row.node_id as string | null,
    status: row.status as ReviewStatus,
    payload: JSON.parse(row.payload_json as string),
    schema: JSON.parse(row.schema_json as string),
    decision: row.decision_json ? JSON.parse(row.decision_json as string) : null,
    created_at: row.created_at as string,
    resolved_at: row.resolved_at as string | null
  };
}

function normalizeOrcid(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(value) ? value.toUpperCase() : undefined;
}

function writeItem(db: Database.Database, item: ReviewItem): void {
  db.prepare(`
    insert or replace into review_items
    (id, project_dir, run_id, node_id, status, payload_json, schema_json, decision_json, created_at, resolved_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id,
    item.project_dir,
    item.run_id,
    item.node_id,
    item.status,
    JSON.stringify(item.payload),
    JSON.stringify(item.schema),
    item.decision ? JSON.stringify(item.decision) : null,
    item.created_at,
    item.resolved_at
  );
}

export function createReviewItem(projectDir: string, payload: unknown, schema: unknown, options: { runId?: string; nodeId?: string } = {}): ReviewItem {
  const db = dbFor(projectDir);
  try {
    const item = {
      id: randomUUID(),
      project_dir: projectDir,
      run_id: options.runId ?? null,
      node_id: options.nodeId ?? null,
      status: "pending" as ReviewStatus,
      payload,
      schema,
      decision: null,
      created_at: new Date().toISOString(),
      resolved_at: null
    };
    db.prepare(`
      insert into review_items
      (id, project_dir, run_id, node_id, status, payload_json, schema_json, decision_json, created_at, resolved_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.project_dir,
      item.run_id,
      item.node_id,
      item.status,
      JSON.stringify(payload),
      JSON.stringify(schema),
      null,
      item.created_at,
      null
    );
    return item;
  } finally {
    db.close();
  }
}

export function listReviewItems(projectDir: string, status?: ReviewStatus): ReviewItem[] {
  const db = dbFor(projectDir);
  try {
    const rows = status
      ? db.prepare("select * from review_items where status = ? order by created_at asc").all(status)
      : db.prepare("select * from review_items order by created_at asc").all();
    return (rows as Array<Record<string, unknown>>).map(rowToItem);
  } finally {
    db.close();
  }
}

function normalizeDecision(raw: unknown): ReviewDecision {
  if (raw && typeof raw === "object" && "decision_type" in (raw as Record<string, unknown>)) {
    const explicit = raw as ReviewDecision;
    const reviewerOrcid = normalizeOrcid(explicit.reviewer_orcid ?? explicit.orcid);
    return reviewerOrcid ? { ...explicit, reviewer_orcid: reviewerOrcid } : explicit;
  }
  const obj = (raw ?? {}) as Record<string, unknown>;
  const accepted = Boolean(obj.accepted ?? false);
  let decisionType: ReviewDecisionType = accepted ? "accept" : "reject";
  if (obj.override_value !== undefined || obj.override_recommendation !== undefined || obj.corrected_fields !== undefined) {
    decisionType = "override";
  }
  return {
    accepted,
    decision_type: decisionType,
    override_value: obj.override_value ?? obj.override_recommendation ?? obj.corrected_fields,
    reviewer_rationale: typeof obj.reviewer_rationale === "string" ? obj.reviewer_rationale : undefined,
    decided_at: typeof obj.decided_at === "string" ? obj.decided_at : new Date().toISOString(),
    decided_by: typeof obj.decided_by === "string" ? obj.decided_by : undefined,
    ...obj,
    reviewer_orcid: normalizeOrcid(obj.reviewer_orcid ?? obj.orcid),
  };
}

export function resolveReviewItem(projectDir: string, id: string, decision: unknown): ReviewItem {
  const db = dbFor(projectDir);
  try {
    const normalized = normalizeDecision(decision);
    const resolvedAt = normalized.decided_at;
    db.prepare("update review_items set status = ?, decision_json = ?, resolved_at = ? where id = ?")
      .run("resolved", JSON.stringify(normalized), resolvedAt, id);
    const row = db.prepare("select * from review_items where id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`Review item not found: ${id}`);
    }
    return rowToItem(row);
  } finally {
    db.close();
  }
}

export function resolvedDecisionsForNode(projectDir: string, runId: string, nodeId: string): ReviewDecision[] {
  const db = dbFor(projectDir);
  try {
    const rows = db.prepare(
      "select decision_json from review_items where run_id = ? and node_id = ? and status = 'resolved' order by created_at asc"
    ).all(runId, nodeId) as Array<Record<string, unknown>>;
    return rows
      .map((row) => row.decision_json ? JSON.parse(row.decision_json as string) as ReviewDecision : null)
      .filter((d): d is ReviewDecision => d !== null);
  } finally {
    db.close();
  }
}

function reviewTimestamp(item: ReviewItem): number {
  const raw = item.resolved_at ?? item.decision?.decided_at ?? item.created_at;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

export function exportReviewQueue(projectDir: string, outputPath = path.join(projectDir, ".rwb", "review_queue.json")): ReviewQueueSnapshot {
  const snapshot: ReviewQueueSnapshot = {
    schema_version: "review-queue.v1",
    exported_at: new Date().toISOString(),
    items: listReviewItems(projectDir).sort((a, b) => a.id.localeCompare(b.id))
  };
  writeJsonFile(outputPath, snapshot);
  return snapshot;
}

export function importReviewQueue(projectDir: string, snapshotPath: string): ReviewQueueImportResult {
  const snapshot = readJsonFile<ReviewQueueSnapshot>(snapshotPath);
  if (snapshot.schema_version !== "review-queue.v1" || !Array.isArray(snapshot.items)) {
    throw new Error(`Unsupported review queue snapshot: ${snapshotPath}`);
  }

  const db = dbFor(projectDir);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  try {
    for (const incomingRaw of snapshot.items) {
      const incoming: ReviewItem = {
        ...incomingRaw,
        project_dir: projectDir,
        decision: incomingRaw.decision ? normalizeDecision(incomingRaw.decision) : null
      };
      const existingRow = db.prepare("select * from review_items where id = ?").get(incoming.id) as Record<string, unknown> | undefined;
      if (!existingRow) {
        writeItem(db, incoming);
        imported += 1;
        continue;
      }
      const existing = rowToItem(existingRow);
      if (reviewTimestamp(incoming) > reviewTimestamp(existing)) {
        writeItem(db, incoming);
        updated += 1;
      } else {
        skipped += 1;
      }
    }
  } finally {
    db.close();
  }
  return { imported, updated, skipped };
}
