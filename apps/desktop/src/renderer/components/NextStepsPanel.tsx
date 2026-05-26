import { useMemo, useState } from "react";
import {
  CheckCircle2, Circle, X, FolderOpen, FileCheck, Play, KeyRound,
  PackageCheck, FileArchive, ListChecks, Eye,
} from "lucide-react";
import { useWorkspace } from "../store/workspace";

function shortHash(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length > 18 ? `${value.slice(0, 15)}...` : value;
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
}

export function NextStepsPanel() {
  const show = useWorkspace((s) => s.showNextSteps);
  const setShow = useWorkspace((s) => s.setShowNextSteps);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const projectDir = useWorkspace((s) => s.projectDir);
  const protocolPath = useWorkspace((s) => s.protocolPath);
  const credentialStatus = useWorkspace((s) => s.credentialStatus);
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen);
  const setViewerArtifactId = useWorkspace((s) => s.setViewerArtifactId);
  const modules = useWorkspace((s) => s.modules);
  const lastRun = useWorkspace((s) => s.lastRun);
  const runProgress = useWorkspace((s) => s.runProgress);
  const [showAllOutputs, setShowAllOutputs] = useState(false);

  const llmRequired = useMemo(
    () => pipelineNodes.some((n) => modules.find((m) => m.id === n.moduleId)?.llm?.required),
    [pipelineNodes, modules],
  );
  const hasCreds = Object.values(credentialStatus).some(Boolean);
  const hasPipeline = pipelineNodes.length > 0;
  const hasProject = !!projectDir;
  const hasProtocol = !!protocolPath;
  const hasRun = !!lastRun;
  const runNodes = useMemo(() => asArray(lastRun?.nodes), [lastRun]);
  const runStatus = String(lastRun?.completed_status ?? (runProgress.active ? "running" : "not run"));
  const runId = String(lastRun?.run_id ?? runProgress.runId ?? "");
  const runOutputs = runNodes
    .flatMap((node) => asArray(node.outputs).map((output) => ({
      node: String(node.module ?? node.node_id ?? "node"),
      port: String(output.port ?? "output"),
      artifactId: String(output.artifact_id ?? ""),
    })))
    .filter((output) => output.artifactId);

  const steps = [
    {
      done: hasPipeline,
      label: "Pick a template or drag modules onto the canvas",
      detail: hasPipeline ? `${pipelineNodes.length} node(s) on the canvas` : "Choose from the library on the left",
      action: null,
    },
    {
      done: !llmRequired || hasCreds,
      label: llmRequired ? "Configure API credentials" : "Configure API credentials (optional — no LLM modules in this pipeline)",
      detail: hasCreds ? "Saved in keychain" : "Click \"Set up credentials\" in the top bar",
      action: { label: "Open credentials", onClick: () => setSettingsOpen(true), icon: KeyRound },
    },
    {
      done: hasProject,
      label: "Open or create a project directory",
      detail: hasProject ? projectDir : "Atrium needs somewhere to store artifacts and the run manifest",
      action: hasProject ? null : { label: "Open project", onClick: () => undefined, icon: FolderOpen, hint: "Use the folder icon in the top bar" },
    },
    {
      done: hasProtocol && hasProject,
      label: "Freeze the protocol",
      detail: hasProtocol ? "protocol.yaml ready" : "Once your pipeline is set, freeze it to lock in module versions and parameters",
      action: { label: "Freeze", onClick: () => undefined, icon: FileCheck, hint: "Use the checkmark icon in the top bar after opening a project" },
    },
    {
      done: hasRun,
      label: "Run the pipeline",
      detail: hasRun ? "Last run completed" : "Watch the budget drawer for live progress",
      action: { label: "Run", onClick: () => undefined, icon: Play, hint: "Use the play icon in the top bar" },
    },
  ];

  if (!show) return null;
  const completed = steps.filter((s) => s.done).length;
  const progressLabel = runProgress.active
    ? `${runProgress.completedNodes}/${runProgress.totalNodes || pipelineNodes.length} nodes completed`
    : null;

  return (
    <div className="nextStepsPanel">
      <div className="nextStepsHead">
        <strong>{hasRun || runProgress.active ? "Run results" : `Next steps (${completed}/${steps.length})`}</strong>
        <button className="iconBtn small" onClick={() => setShow(false)} title="Hide"><X size={12} /></button>
      </div>

      {(hasRun || runProgress.active) && (
        <section className="runResultCard">
          <div className={`runStatusPill ${runStatus}`}>
            <PackageCheck size={14} />
            <span>{runStatus}</span>
          </div>
          <div className="runResultGrid">
            <span><strong>Run</strong>{runId ? shortHash(runId) : "Starting..."}</span>
            <span><strong>Progress</strong>{progressLabel ?? `${runNodes.length || pipelineNodes.length} node(s)`}</span>
            <span><strong>LLM calls</strong>{String(lastRun?.total_llm_calls ?? 0)}</span>
            <span><strong>Tokens</strong>{String(lastRun?.total_tokens ?? 0)}</span>
            <span><strong>Cost</strong>${Number(lastRun?.total_cost_usd ?? 0).toFixed(4)}</span>
          </div>
          {runOutputs.length > 0 && (
            <div className="runArtifacts">
              <span className="runArtifactsTitle"><ListChecks size={13} /> Outputs <em className="runArtifactsHint">Click to view</em></span>
              {(showAllOutputs ? runOutputs : runOutputs.slice(0, 6)).map((output, index) => (
                <button
                  key={`${output.artifactId}-${index}`}
                  className="runArtifactRow"
                  onClick={() => setViewerArtifactId(output.artifactId)}
                  title={`View ${output.node}:${output.port}\n${output.artifactId}`}
                >
                  <Eye size={11} />
                  <code>{output.node}:{output.port} {shortHash(output.artifactId)}</code>
                </button>
              ))}
              {runOutputs.length > 6 && (
                <button
                  className="runArtifactsMore link"
                  onClick={() => setShowAllOutputs((v) => !v)}
                >
                  {showAllOutputs ? "Show fewer" : `+${runOutputs.length - 6} more`}
                </button>
              )}
            </div>
          )}
          {runStatus === "success" && (
            <div className="runNextActions">
              <span><FileArchive size={13} /> Export the bundle when you are ready to share or verify it.</span>
              <span><FileCheck size={13} /> Use Verify Bundle for a reviewer-style hash report.</span>
            </div>
          )}
        </section>
      )}

      <ol className="nextStepsList">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? "done" : "pending"}>
            {s.done ? <CheckCircle2 size={16} className="stepIconDone" /> : <Circle size={16} className="stepIconPending" />}
            <div className="stepBody">
              <strong>{s.label}</strong>
              <span>{s.detail}</span>
              {!s.done && s.action && (
                <span className="stepHint">{(s.action as { hint?: string }).hint ?? ""}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
