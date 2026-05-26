// IMPORTANT: api side-effect import must precede any component that reads
// window.rwb at its module scope (e.g. ParamForm, SettingsDialog, Topbar).
import { api } from "./lib/api";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useWorkspace, type ModuleManifest } from "./store/workspace";
import { Topbar } from "./components/Topbar";
import { ModuleLibrary } from "./components/ModuleLibrary";
import { PipelineCanvas } from "./components/PipelineCanvas";
import { Inspector } from "./components/Inspector";
import { BudgetDrawer } from "./components/BudgetDrawer";
import { FirstRunFlow } from "./components/FirstRunFlow";
import { SettingsDialog } from "./components/SettingsDialog";
import { NextStepsPanel } from "./components/NextStepsPanel";
import "reactflow/dist/style.css";
import "./styles.css";


function App() {
  const setModules = useWorkspace((s) => s.setModules);
  const setStatus = useWorkspace((s) => s.setStatus);
  const firstRunComplete = useWorkspace((s) => s.firstRunComplete);
  const applyRunProgress = useWorkspace((s) => s.applyRunProgress);
  const setCredentialStatus = useWorkspace((s) => s.setCredentialStatus);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const pipelineEdges = useWorkspace((s) => s.pipelineEdges);
  const selectedNodeId = useWorkspace((s) => s.selectedNodeId);
  const setSelectedNodeId = useWorkspace((s) => s.setSelectedNodeId);
  const modules = useWorkspace((s) => s.modules);

  useEffect(() => {
    api
      .listModules()
      .then((items) => setModules(items as ModuleManifest[]))
      .catch((error) => setStatus(String(error)));
  }, []);

  useEffect(() => {
    if (!window.rwb?.onRunProgress) return;
    const unsubscribe = window.rwb.onRunProgress((event) => applyRunProgress(event));
    return unsubscribe;
  }, [applyRunProgress]);

  useEffect(() => {
    if (!window.rwb?.getCredentialStatus) return;
    window.rwb.getCredentialStatus().then(setCredentialStatus).catch(() => undefined);
  }, [setCredentialStatus]);

  // Auto-select the first node that needs attention so the inspector
  // is never blank after a template loads.
  useEffect(() => {
    if (!firstRunComplete) return;
    if (selectedNodeId) return;
    if (pipelineNodes.length === 0) return;
    if (modules.length === 0) return;
    // Find a node with unconnected required inputs or empty required params.
    const firstIncomplete = pipelineNodes.find((n) => {
      const mod = modules.find((m) => m.id === n.moduleId);
      if (!mod) return false;
      const unconnected = (mod.inputs ?? []).some(
        (i) => !i.optional && !pipelineEdges.some((e) => e.target === n.id && e.targetPort === i.name),
      );
      if (unconnected) return true;
      // Param check: if any string param is empty, surface it.
      for (const [, value] of Object.entries(n.params ?? {})) {
        if (typeof value === "string" && value.trim() === "") return true;
      }
      return false;
    });
    setSelectedNodeId(firstIncomplete?.id ?? pipelineNodes[0].id);
  }, [firstRunComplete, selectedNodeId, pipelineNodes, pipelineEdges, modules, setSelectedNodeId]);

  if (!firstRunComplete) {
    return (
      <>
        <FirstRunFlow />
        <SettingsDialog />
      </>
    );
  }

  return (
    <div className="app">
      <Topbar />
      <main className="workbench">
        <ModuleLibrary />
        <div className="canvasColumn">
          <PipelineCanvas />
          <NextStepsPanel />
        </div>
        <Inspector />
      </main>
      <BudgetDrawer />
      <SettingsDialog />
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
