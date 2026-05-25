import { useEffect, useState } from "react";
import {
  FileArchive, FileCheck, FolderOpen, Play, ShieldCheck, Download, ShieldAlert,
  GitCompare, Settings as SettingsIcon, KeyRound, AlertTriangle, Loader,
} from "lucide-react";
import { useWorkspace, type RunMode } from "../store/workspace";
import { BundleDialog } from "./BundleDialog";
import { serializePipelineToProtocol } from "../lib/serialize-protocol";
import { validatePipeline, type ValidationIssue } from "../lib/validate-pipeline";

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
  const credentialStatus = useWorkspace((s) => s.credentialStatus);
  const setCredentialStatus = useWorkspace((s) => s.setCredentialStatus);
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const pipelineEdges = useWorkspace((s) => s.pipelineEdges);
  const modules = useWorkspace((s) => s.modules);
  const setSelectedNodeId = useWorkspace((s) => s.setSelectedNodeId);
  const [dialogMode, setDialogMode] = useState<"import" | "verify" | "diff" | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);

  useEffect(() => {
    if (!api?.getCredentialStatus) return;
    api.getCredentialStatus().then(setCredentialStatus).catch(() => undefined);
  }, [setCredentialStatus]);

  const configuredProviders = (Object.entries(credentialStatus) as Array<["anthropic" | "openai" | "ollama", boolean]>)
    .filter(([, v]) => v)
    .map(([k]) => k);

  async function openProject() {
    if (!api) return;
    const dir = await api.openProject();
    if (dir) {
      setProjectDir(dir);
      setProtocolPath(`${dir}/protocol.yaml`);
      setStatus("Project opened");
    }
  }

  async function writePipelineToDisk(): Promise<boolean> {
    if (!api || !protocolPath) {
      setLastError("Open a project before saving.");
      setStatus("Open a project before saving.");
      return false;
    }
    if (pipelineNodes.length === 0) {
      setLastError("Pipeline is empty. Drag modules onto the canvas first.");
      setStatus("Pipeline is empty.");
      return false;
    }
    const serialized = serializePipelineToProtocol(pipelineNodes, pipelineEdges, modules, {
      projectName: projectDir.split(/[/\\]/).filter(Boolean).pop() ?? "Atrium Project",
    });
    await api.writeProtocol(protocolPath, serialized);
    return true;
  }

  async function freezeProtocol() {
    if (!api || !protocolPath) { setLastError("Open a project before freezing."); return; }
    setLastError(null);
    setStatus("Saving pipeline to protocol.yaml…");
    try {
      const wrote = await writePipelineToDisk();
      if (!wrote) return;
      setStatus("Freezing protocol…");
      await api.freezeProtocol(protocolPath);
      setStatus("Protocol frozen.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(`Freeze failed: ${msg}`);
      setStatus(`Freeze failed: ${msg}`);
    }
  }

  async function runProtocol() {
    if (!protocolPath) {
      setLastError("Choose a project first (folder icon in the top bar).");
      setStatus("Choose a project first.");
      return;
    }
    if (pipelineNodes.length === 0) {
      setLastError("Pipeline is empty. Drag modules onto the canvas first.");
      setStatus("Pipeline is empty.");
      return;
    }
    setLastError(null);
    setValidationIssues([]);
    setRunBusy(true);
    resetRunProgress();
    try {
      setStatus("Validating pipeline…");
      const loader = api?.loadModuleSchema ?? (async () => ({}));
      const validation = await validatePipeline(pipelineNodes, pipelineEdges, modules, loader);
      if (!validation.valid) {
        setValidationIssues(validation.issues);
        setLastError(`Cannot run yet — ${validation.issues.length} issue(s) found. See list below.`);
        setStatus("Pipeline has unresolved issues.");
        setRunBusy(false);
        return;
      }
      setStatus("Saving + running pipeline…");
      const serialized = serializePipelineToProtocol(pipelineNodes, pipelineEdges, modules, {
        projectName: projectDir.split(/[/\\]/).filter(Boolean).pop() ?? "Atrium Project",
      });
      // Pass the live pipeline through the run IPC so main always writes the
      // canonical YAML before invoking the runner. Defense in depth: even on a
      // stale renderer build, the run cannot reference a missing protocol.yaml.
      const result = (api
        ? await api.run(protocolPath, { mode, protocol: serialized, freezeBeforeRun: true })
        : { completed_status: "preview" }) as Record<string, unknown>;
      setLastRun(result);
      setBudget({
        totalCalls: Number(result.total_llm_calls ?? 0),
        totalTokens: Number(result.total_tokens ?? 0),
        totalCostUsd: Number(result.total_cost_usd ?? 0),
      });
      const status = String(result.completed_status ?? "unknown");
      if (status === "success") {
        setStatus(`Run completed: ${result.total_llm_calls ?? 0} LLM calls, $${Number(result.total_cost_usd ?? 0).toFixed(4)}`);
      } else {
        setStatus(`Run ${status}.`);
        setLastError(`Run ${status}. Check the budget drawer or audit log for details.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Run failed: ${msg}`);
      setLastError(`Run failed: ${msg}`);
    } finally {
      setRunBusy(false);
    }
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
        <span className="brandProject">{projectDir || "No project open"}</span>
      </div>
      <div className="mode">
        {MODES.map((m) => (
          <button key={m.value} className={mode === m.value ? "selected" : ""} onClick={() => setMode(m.value)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="actions">
        <button
          className={`credentialsIndicator ${configuredProviders.length === 0 ? "warn" : ""}`}
          onClick={() => setSettingsOpen(true)}
          title={configuredProviders.length === 0
            ? "No API credentials configured — click to set up"
            : `Configured: ${configuredProviders.join(", ")}`}
        >
          {configuredProviders.length === 0
            ? <><AlertTriangle size={14} /> Set up credentials</>
            : <><KeyRound size={14} /> {configuredProviders.length} configured</>}
        </button>
        <button title="Settings" onClick={() => setSettingsOpen(true)}><SettingsIcon size={18} /></button>
        <span className="actionDivider" />
        <button title="Open project" onClick={openProject}><FolderOpen size={18} /></button>
        <button title="Freeze protocol" onClick={freezeProtocol} disabled={!protocolPath}><FileCheck size={18} /></button>
        <button
          title={runBusy ? "Running…" : "Run"}
          onClick={runProtocol}
          disabled={!protocolPath || runBusy || pipelineNodes.length === 0}
          className="runBtn"
        >
          {runBusy ? <Loader size={18} className="spin" /> : <Play size={18} />}
        </button>
        <span className="actionDivider" />
        <button title="Export bundle" onClick={exportBundle} disabled={!projectDir}><FileArchive size={18} /></button>
        <button title="Import bundle" onClick={() => setDialogMode("import")}><Download size={18} /></button>
        <button title="Verify bundle" onClick={() => setDialogMode("verify")}><ShieldAlert size={18} /></button>
        <button title="Diff artifacts" onClick={() => setDialogMode("diff")} disabled={!projectDir}><GitCompare size={18} /></button>
      </div>
      {dialogMode && <BundleDialog mode={dialogMode} onClose={() => setDialogMode(null)} />}
      {(lastError || validationIssues.length > 0) && (
        <div className="topbarError">
          <div className="topbarErrorHeader">
            <AlertTriangle size={14} />
            <span>{lastError ?? "Pipeline has issues"}</span>
            <button
              className="topbarErrorDismiss"
              onClick={() => { setLastError(null); setValidationIssues([]); }}
              title="Dismiss"
            >×</button>
          </div>
          {validationIssues.length > 0 && (
            <ul className="topbarErrorList">
              {validationIssues.map((issue, i) => (
                <li key={i}>
                  <button
                    className="topbarErrorIssue"
                    onClick={() => {
                      if (issue.nodeId) setSelectedNodeId(issue.nodeId);
                    }}
                    title="Click to select this node"
                  >
                    <strong>{issue.nodeName}</strong>
                    {issue.field && <code>{issue.field}</code>}
                    <span>{issue.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </header>
  );
}
