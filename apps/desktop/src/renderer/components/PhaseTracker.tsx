import { useMemo } from "react";
import { CheckCircle2, Circle, Loader, AlertCircle, Layers } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { phaseForModule } from "../store/phase-map";

interface PhaseRow {
  phaseId: string;
  label: string;
  shortLabel: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  durationMs?: number;
  llmCalls?: number;
  detail?: string;
  order: number;
}

export function PhaseTracker() {
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const runProgress = useWorkspace((s) => s.runProgress);
  const budget = useWorkspace((s) => s.budget);
  const setAppMode = useWorkspace((s) => s.setAppMode);

  const phases = useMemo<PhaseRow[]>(() => {
    // Group expected phases from pipelineNodes
    const byPhase = new Map<string, PhaseRow>();
    for (const node of pipelineNodes) {
      const phase = phaseForModule(node.moduleId);
      const progress = runProgress.byNode[node.id];
      const existing = byPhase.get(phase.id);
      const incomingStatus = progress?.status ?? "pending";
      const merged: PhaseRow = {
        phaseId: phase.id,
        label: phase.label,
        shortLabel: phase.shortLabel,
        order: phase.order,
        // a phase is "running" if any of its modules are running, "completed" if all done,
        // "pending" otherwise. Failure wins.
        status: existing
          ? mergeStatus(existing.status, incomingStatus)
          : incomingStatus,
        durationMs: sumDuration(existing?.durationMs, progress?.durationMs),
        llmCalls: sumCount(existing?.llmCalls, progress?.llmCalls),
      };
      byPhase.set(phase.id, merged);
    }
    return Array.from(byPhase.values()).sort((a, b) => a.order - b.order);
  }, [pipelineNodes, runProgress.byNode]);

  const completedPhases = phases.filter((p) => p.status === "completed" || p.status === "skipped").length;
  const failingPhase = phases.find((p) => p.status === "failed");
  const runningPhase = phases.find((p) => p.status === "running");

  return (
    <div className="phaseTracker">
      <header className="phaseHeader">
        <div>
          <h1>{failingPhase ? "Pipeline failed" : "Running pipeline"}</h1>
          <p>{failingPhase
            ? "One or more phases failed. See the audit log for details."
            : runningPhase
              ? `Currently on: ${runningPhase.label}`
              : `Completed ${completedPhases} of ${phases.length} phase${phases.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button className="iconBtn small" onClick={() => setAppMode("builder")} title="Switch to module workbench">
          <Layers size={12} /> Workbench
        </button>
      </header>

      <div className="phaseBudget">
        <span><strong>LLM calls</strong> {budget.totalCalls}</span>
        <span><strong>Tokens</strong> {budget.totalTokens.toLocaleString()}</span>
        <span><strong>Cost</strong> ${budget.totalCostUsd.toFixed(4)}</span>
        <span><strong>Progress</strong> {runProgress.completedNodes} / {runProgress.totalNodes || pipelineNodes.length} modules</span>
      </div>

      <ol className="phaseList">
        {phases.map((phase) => (
          <li key={phase.phaseId} className={`phaseRow ${phase.status}`}>
            <span className="phaseRowIcon">
              {phase.status === "completed" || phase.status === "skipped" ? <CheckCircle2 size={20} />
                : phase.status === "running" ? <Loader size={20} className="spin" />
                : phase.status === "failed" ? <AlertCircle size={20} />
                : <Circle size={20} />}
            </span>
            <span className="phaseRowBody">
              <strong>{phase.label}</strong>
              <span className="phaseRowDetail">
                {phase.status === "completed" && phase.durationMs !== undefined
                  ? formatDuration(phase.durationMs)
                  : phase.status === "running"
                    ? "Working…"
                    : phase.status === "failed"
                      ? "Failed"
                      : ""}
                {phase.llmCalls ? ` · ${phase.llmCalls} LLM call${phase.llmCalls === 1 ? "" : "s"}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {runProgress.error && (
        <div className="phaseError">
          <AlertCircle size={14} />
          <pre>{runProgress.error}</pre>
        </div>
      )}
    </div>
  );
}

function mergeStatus(a: PhaseRow["status"], b: PhaseRow["status"]): PhaseRow["status"] {
  const order = ["failed", "running", "pending", "skipped", "completed"];
  // pick the "more interesting" status: failed > running > pending > skipped > completed
  return order.find((s) => s === a || s === b) as PhaseRow["status"];
}

function sumDuration(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function sumCount(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
