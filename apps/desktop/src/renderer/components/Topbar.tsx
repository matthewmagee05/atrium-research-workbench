import { useState } from "react";
import { FileArchive, FileCheck, FolderOpen, Play, ShieldCheck, Download, ShieldAlert, GitCompare } from "lucide-react";
import { useWorkspace, type RunMode } from "../store/workspace";
import { BundleDialog } from "./BundleDialog";

const api = window.rwb;

const MODES: { label: string; value: RunMode }[] = [
  { label: "Execute", value: "execute" },
  { label: "Deterministic re-run", value: "deterministic-rerun" },
  { label: "Full re-run", value: "full-rerun" },
  { label: "Variance audit", value: "variance-audit" },
];

export function Topbar() {
  const projectDir = useWorkspace((s) => s.projectDir);
  const setProjectDir = useWorkspace((s) => s.setProjectDir);
  const protocolPath = useWorkspace((s) => s.protocolPath);
  const setProtocolPath = useWorkspace((s) => s.setProtocolPath);
  const mode = useWorkspace((s) => s.mode);
  const setMode = useWorkspace((s) => s.setMode);
  const setStatus = useWorkspace((s) => s.setStatus);
  const setLastRun = useWorkspace((s) => s.setLastRun);
  const setBudget = useWorkspace((s) => s.setBudget);
  const resetRunProgress = useWorkspace((s) => s.resetRunProgress);
  const [dialogMode, setDialogMode] = useState<"import" | "verify" | "diff" | null>(null);

  async function openProject() {
    if (!api) return;
    const dir = await api.openProject();
    if (dir) {
      setProjectDir(dir);
      setProtocolPath(`${dir}/protocol.yaml`);
      setStatus("Project opened");
    }
  }

  async function runProtocol() {
    if (!protocolPath) { setStatus("Choose a project with a protocol.yaml first"); return; }
    setStatus("Running protocol...");
    resetRunProgress();
    try {
      const result = (api ? await api.run(protocolPath, { mode }) : { completed_status: "preview" }) as Record<string, unknown>;
      setLastRun(result);
      setBudget({
        totalCalls: Number(result.total_llm_calls ?? 0),
        totalTokens: Number(result.total_tokens ?? 0),
        totalCostUsd: Number(result.total_cost_usd ?? 0),
      });
      setStatus("Run completed");
    } catch (err) {
      setStatus(`Run failed: ${err}`);
    }
  }

  async function freezeProtocol() {
    if (!api || !protocolPath) return;
    setStatus("Freezing protocol...");
    await api.freezeProtocol(protocolPath);
    setStatus("Protocol frozen");
  }

  async function exportBundle() {
    if (!api || !projectDir) return;
    setStatus("Exporting bundle...");
    const output = await api.exportBundle(projectDir);
    setStatus(output ? `Bundle exported to ${output}` : "Export canceled");
  }

  return (
    <header className="topbar">
      <div className="brand">
        <ShieldCheck size={20} />
        <strong>Atrium</strong>
        <span>{projectDir || "No project open"}</span>
      </div>
      <div className="mode">
        {MODES.map((m) => (
          <button key={m.value} className={mode === m.value ? "selected" : ""} onClick={() => setMode(m.value)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="actions">
        <button title="Open project" onClick={openProject}><FolderOpen size={18} /></button>
        <button title="Freeze protocol" onClick={freezeProtocol} disabled={!protocolPath}><FileCheck size={18} /></button>
        <button title="Run" onClick={runProtocol} disabled={!protocolPath}><Play size={18} /></button>
        <button title="Export bundle" onClick={exportBundle} disabled={!projectDir}><FileArchive size={18} /></button>
        <button title="Import bundle" onClick={() => setDialogMode("import")}><Download size={18} /></button>
        <button title="Verify bundle" onClick={() => setDialogMode("verify")}><ShieldAlert size={18} /></button>
        <button title="Diff artifacts" onClick={() => setDialogMode("diff")} disabled={!projectDir}><GitCompare size={18} /></button>
      </div>
      {dialogMode && <BundleDialog mode={dialogMode} onClose={() => setDialogMode(null)} />}
    </header>
  );
}
