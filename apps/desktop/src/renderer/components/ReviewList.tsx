import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Eye, FolderOpen, Loader, AlertCircle, FileArchive,
  RefreshCw, Layers, ChevronDown, ChevronRight, PackageCheck, ArrowLeft,
} from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { phaseForModule, reviewMetaFor } from "../store/phase-map";
import { useWorkflowActions } from "../lib/use-workflow-actions";

const api = window.rwb;

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

function parseModuleAtVersion(value: unknown): { id: string; version: string } {
  const text = String(value ?? "");
  const at = text.lastIndexOf("@");
  if (at === -1) return { id: text, version: "" };
  return { id: text.slice(0, at), version: text.slice(at + 1) };
}

function shortHash(value: string): string {
  if (!value) return "";
  if (value.startsWith("sha256:")) return value.slice(0, 17) + "…";
  return value.length > 12 ? value.slice(0, 12) + "…" : value;
}

function summarizeContent(content: unknown): string {
  if (content === null || content === undefined) return "(empty)";
  if (typeof content === "string") {
    return content.length > 220 ? content.slice(0, 217) + "…" : content;
  }
  if (Array.isArray(content)) {
    return `${content.length} item${content.length === 1 ? "" : "s"}`;
  }
  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.markdown === "string") {
      const text = obj.markdown.replace(/\n+/g, " ").trim();
      return text.length > 220 ? text.slice(0, 217) + "…" : text;
    }
    if (typeof obj.text === "string") {
      return obj.text.length > 220 ? obj.text.slice(0, 217) + "…" : obj.text;
    }
    // Try to find an array under common keys
    for (const key of ["records", "questions", "hypotheses", "decisions", "claims", "tables"]) {
      if (Array.isArray(obj[key])) {
        return `${(obj[key] as unknown[]).length} ${key}`;
      }
    }
    const keys = Object.keys(obj).slice(0, 4);
    return `{ ${keys.join(", ")}${Object.keys(obj).length > 4 ? ", …" : ""} }`;
  }
  return String(content);
}

interface ReviewCard {
  artifactId: string;
  moduleId: string;
  moduleVersion: string;
  port: string;
  phaseLabel: string;
  phaseOrder: number;
  cardLabel: string;
  cardSource: string;
  cardPriority: number;
}

export function ReviewList() {
  const lastRun = useWorkspace((s) => s.lastRun);
  const projectDir = useWorkspace((s) => s.projectDir);
  const setViewerArtifactId = useWorkspace((s) => s.setViewerArtifactId);
  const setAppMode = useWorkspace((s) => s.setAppMode);
  const setStatus = useWorkspace((s) => s.setStatus);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const reviewItems = useWorkspace((s) => s.reviewItems);
  const setReviewItems = useWorkspace((s) => s.setReviewItems);
  const setLastRun = useWorkspace((s) => s.setLastRun);
  const { runProtocol, exportBundle, busy } = useWorkflowActions();

  const [previewById, setPreviewById] = useState<Record<string, { content: unknown; loading: boolean; error?: string }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const cards = useMemo<ReviewCard[]>(() => {
    const runNodes = asArray(lastRun?.nodes);
    const result: ReviewCard[] = [];
    for (const node of runNodes) {
      const moduleInfo = parseModuleAtVersion(node.module);
      const phase = phaseForModule(moduleInfo.id);
      for (const output of asArray(node.outputs)) {
        const port = String(output.port ?? "output");
        const artifactId = String(output.artifact_id ?? "");
        if (!artifactId) continue;
        const reviewMeta = reviewMetaFor(moduleInfo.id, port);
        if (!reviewMeta) continue;
        const matchingPipelineNode = pipelineNodes.find((n) => n.moduleId === moduleInfo.id);
        const provider = typeof matchingPipelineNode?.params.provider === "string" ? matchingPipelineNode.params.provider : undefined;
        const model = typeof matchingPipelineNode?.params.model === "string" ? matchingPipelineNode.params.model : undefined;
        result.push({
          artifactId,
          moduleId: moduleInfo.id,
          moduleVersion: moduleInfo.version,
          port,
          phaseLabel: phase.label,
          phaseOrder: phase.order,
          cardLabel: reviewMeta.label,
          cardSource: reviewMeta.source({ provider, model }),
          cardPriority: reviewMeta.priority ?? phase.order * 10,
        });
      }
    }
    return result.sort((a, b) => a.cardPriority - b.cardPriority);
  }, [lastRun, pipelineNodes]);

  async function refreshReviewQueue() {
    if (!projectDir || !api?.listReviewItems) return;
    try { setReviewItems(await api.listReviewItems(projectDir)); } catch { /* ignore */ }
  }

  useEffect(() => {
    void refreshReviewQueue();
  }, [projectDir, lastRun?.run_id]);

  useEffect(() => {
    if (!projectDir || !api?.getArtifact) return;
    let cancelled = false;
    for (const card of cards) {
      if (previewById[card.artifactId]) continue;
      setPreviewById((prev) => ({ ...prev, [card.artifactId]: { content: null, loading: true } }));
      api.getArtifact(projectDir, card.artifactId)
        .then((payload) => {
          if (cancelled) return;
          setPreviewById((prev) => ({ ...prev, [card.artifactId]: { content: payload.content, loading: false } }));
        })
        .catch((e) => {
          if (cancelled) return;
          const message = e instanceof Error ? e.message : String(e);
          setPreviewById((prev) => ({ ...prev, [card.artifactId]: { content: null, loading: false, error: message } }));
        });
    }
    return () => { cancelled = true; };
  }, [cards, projectDir]);

  async function reveal(artifactId: string) {
    if (!projectDir || !api?.revealArtifact) return;
    try {
      await api.revealArtifact(projectDir, artifactId);
      setStatus("Opened artifact location in Finder.");
    } catch (e) {
      setStatus(`Reveal failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const pendingReviewCount = reviewItems.filter((i) => i.status === "pending").length;
  const runStatus = String(lastRun?.completed_status ?? "");
  const runId = String(lastRun?.run_id ?? "");

  return (
    <div className="reviewListPage">
      <header className="reviewListHeader">
        <div>
          <h1>Review your run</h1>
          <p>
            {runStatus === "success" ? "All phases completed." : `Run status: ${runStatus || "unknown"}.`}{" "}
            {cards.length} reviewable output{cards.length === 1 ? "" : "s"}{pendingReviewCount > 0 ? ` · ${pendingReviewCount} pending LLM decision${pendingReviewCount === 1 ? "" : "s"}` : ""}.
          </p>
        </div>
        <div className="reviewListHeaderActions">
          <button className="iconBtn small" onClick={() => setLastRun(null)} title="Edit setup and re-run">
            <ArrowLeft size={12} /> Back to setup
          </button>
          <button className="iconBtn small" onClick={() => runProtocol()} disabled={busy} title="Re-run the pipeline">
            <RefreshCw size={12} /> Run again
          </button>
          <button className="iconBtn small" onClick={() => exportBundle()} title="Export a reproducibility bundle">
            <FileArchive size={12} /> Export bundle
          </button>
          <button className="iconBtn small" onClick={() => setAppMode("builder")} title="Open the module workbench">
            <Layers size={12} /> Workbench
          </button>
        </div>
      </header>

      <div className="reviewListBudget">
        <span><strong>Run</strong> {shortHash(runId)}</span>
        <span><strong>LLM calls</strong> {String(lastRun?.total_llm_calls ?? 0)}</span>
        <span><strong>Tokens</strong> {Number(lastRun?.total_tokens ?? 0).toLocaleString()}</span>
        <span><strong>Cost</strong> ${Number(lastRun?.total_cost_usd ?? 0).toFixed(4)}</span>
        <span><strong>Status</strong> <span className={`runStatusPill ${runStatus}`}><PackageCheck size={11} /> {runStatus || "—"}</span></span>
      </div>

      {cards.length === 0 && (
        <div className="reviewListEmpty">
          <AlertCircle size={16} /> No reviewable outputs were produced by this run.
        </div>
      )}

      <ol className="reviewCardList">
        {cards.map((card, index) => {
          const preview = previewById[card.artifactId];
          const isExpanded = expanded[card.artifactId] !== false; // default open
          return (
            <li key={card.artifactId} className="reviewCard">
              <header className="reviewCardHeader">
                <span className="reviewCardIndex">{index + 1}</span>
                <div className="reviewCardTitle">
                  <strong>{card.cardLabel}</strong>
                  <span>{card.cardSource}</span>
                </div>
                <button
                  className="iconBtn small"
                  onClick={() => setExpanded((prev) => ({ ...prev, [card.artifactId]: !isExpanded }))}
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              </header>
              {isExpanded && (
                <div className="reviewCardBody">
                  {preview?.loading && (
                    <div className="reviewCardPreview loading"><Loader size={12} className="spin" /> Loading preview…</div>
                  )}
                  {preview?.error && (
                    <div className="reviewCardPreview error"><AlertCircle size={12} /> {preview.error}</div>
                  )}
                  {preview && !preview.loading && !preview.error && (
                    <div className="reviewCardPreview">{summarizeContent(preview.content)}</div>
                  )}
                  <div className="reviewCardMeta">
                    <span>Source: <code>{card.moduleId}@{card.moduleVersion}</code></span>
                    <span>Port: <code>{card.port}</code></span>
                    <span>Phase: {card.phaseLabel}</span>
                    <span>Hash: <code title={card.artifactId}>{shortHash(card.artifactId)}</code></span>
                  </div>
                  <div className="reviewCardActions">
                    <button className="iconBtn small primary" onClick={() => setViewerArtifactId(card.artifactId)}>
                      <Eye size={12} /> View full
                    </button>
                    <button className="iconBtn small" onClick={() => reveal(card.artifactId)}>
                      <FolderOpen size={12} /> Reveal in Finder
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {pendingReviewCount > 0 && (
        <aside className="reviewListPendingReminder">
          <CheckCircle2 size={14} />
          <span>
            {pendingReviewCount} pending LLM decision{pendingReviewCount === 1 ? "" : "s"} need attention.
            Open the review queue in the inspector to accept / reject them.
          </span>
        </aside>
      )}
    </div>
  );
}
