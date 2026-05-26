import { useEffect, useState } from "react";
import {
  FileArchive, FolderOpen, Play, ShieldCheck, Download, ShieldAlert,
  GitCompare, Settings as SettingsIcon, KeyRound, AlertTriangle, Loader, Save, Sparkles,
} from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { BundleDialog } from "./BundleDialog";
import { useWorkflowActions } from "../lib/use-workflow-actions";

export function Topbar() {
  const projectDir = useWorkspace((s) => s.projectDir);
  const status = useWorkspace((s) => s.status);
  const credentialStatus = useWorkspace((s) => s.credentialStatus);
  const setCredentialStatus = useWorkspace((s) => s.setCredentialStatus);
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const bundleOnlyMode = useWorkspace((s) => s.bundleOnlyMode);
  const appMode = useWorkspace((s) => s.appMode);
  const setAppMode = useWorkspace((s) => s.setAppMode);
  const setSaveTemplateDialogOpen = useWorkspace((s) => s.setSaveTemplateDialogOpen);
  const [dialogMode, setDialogMode] = useState<"import" | "verify" | "diff" | null>(null);
  const { busy, lastError, validationIssues, openProject, runProtocol, exportBundle, clearError } = useWorkflowActions();
  const guided = appMode === "guided";

  useEffect(() => {
    if (!window.rwb?.getCredentialStatus) return;
    window.rwb.getCredentialStatus().then(setCredentialStatus).catch(() => undefined);
  }, [setCredentialStatus]);

  const configuredProviders = (Object.entries(credentialStatus) as Array<["anthropic" | "openai" | "ollama", boolean]>)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <header className="topbar">
      <div className="brand">
        <ShieldCheck size={20} />
        <strong>Atrium</strong>
        {bundleOnlyMode && <span className="readonlyBadge">Reviewer mode</span>}
        <span className="brandProject">{projectDir || "No project open"}</span>
      </div>
      <div className="actions">
        <span className="topbarStatus" title={status}>{status}</span>
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
        {!guided && (
          <button
            title={!projectDir ? "Choose a project before running" : busy ? "Running..." : "Run"}
            onClick={runProtocol}
            disabled={busy || pipelineNodes.length === 0 || bundleOnlyMode}
            className="runBtn"
          >
            {busy ? <Loader size={18} className="spin" /> : <Play size={18} />}
            <span>Run</span>
          </button>
        )}
        {!guided && (
          <button
            title="Save current canvas as a custom template"
            onClick={() => setSaveTemplateDialogOpen(true)}
            disabled={pipelineNodes.length === 0 || bundleOnlyMode}
          >
            <Save size={18} />
          </button>
        )}
        {!guided && (
          <button
            title="Return to the guided flow"
            onClick={() => setAppMode("guided")}
          >
            <Sparkles size={18} />
          </button>
        )}
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
              onClick={clearError}
              title="Dismiss"
            >×</button>
          </div>
          {validationIssues.length > 0 && (
            <ul className="topbarErrorList">
              {validationIssues.map((issue, i) => (
                <li key={i}>
                  <button
                    className="topbarErrorIssue"
                    onClick={() => undefined}
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
