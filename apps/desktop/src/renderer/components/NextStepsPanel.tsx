import { useMemo } from "react";
import { CheckCircle2, Circle, X, FolderOpen, FileCheck, Play, KeyRound } from "lucide-react";
import { useWorkspace } from "../store/workspace";

export function NextStepsPanel() {
  const show = useWorkspace((s) => s.showNextSteps);
  const setShow = useWorkspace((s) => s.setShowNextSteps);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const projectDir = useWorkspace((s) => s.projectDir);
  const protocolPath = useWorkspace((s) => s.protocolPath);
  const credentialStatus = useWorkspace((s) => s.credentialStatus);
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen);
  const modules = useWorkspace((s) => s.modules);
  const lastRun = useWorkspace((s) => s.lastRun);

  const llmRequired = useMemo(
    () => pipelineNodes.some((n) => modules.find((m) => m.id === n.moduleId)?.llm?.required),
    [pipelineNodes, modules],
  );
  const hasCreds = Object.values(credentialStatus).some(Boolean);
  const hasPipeline = pipelineNodes.length > 0;
  const hasProject = !!projectDir;
  const hasProtocol = !!protocolPath;
  const hasRun = !!lastRun;

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

  return (
    <div className="nextStepsPanel">
      <div className="nextStepsHead">
        <strong>Next steps ({completed}/{steps.length})</strong>
        <button className="iconBtn small" onClick={() => setShow(false)} title="Hide"><X size={12} /></button>
      </div>
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
