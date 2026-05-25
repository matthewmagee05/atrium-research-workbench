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

const api = window.rwb ?? {
  listModules: async () => [
    { id: "fixture-source", version: "1.0.0", name: "Fixture Source", stage: "source", runtime: "python", description: "Preview module", inputs: [], outputs: [{ name: "records", schema: "schemas/output.json", description: "", output_kind: "structured_data" }] },
    { id: "record-normalizer", version: "1.0.0", name: "Record Normalizer", stage: "normalize", runtime: "python", description: "Preview module", inputs: [{ name: "records", schema: "schemas/input.json" }], outputs: [{ name: "normalized", schema: "schemas/output.json", description: "", output_kind: "structured_data" }] },
    { id: "deterministic-dedupe", version: "1.0.0", name: "Deterministic Dedupe", stage: "dedupe", runtime: "python", description: "Preview module", inputs: [{ name: "normalized", schema: "schemas/input.json" }], outputs: [{ name: "deduped", schema: "schemas/output.json", description: "", output_kind: "structured_data" }, { name: "corpus_lock", schema: "schemas/corpus_lock.json", description: "", output_kind: "structured_data" }] },
    { id: "bibliometrix-r", version: "1.0.0", name: "Bibliometrix R", stage: "analyze", runtime: "r", description: "Preview module", inputs: [{ name: "deduped", schema: "schemas/input.json" }, { name: "corpus_lock", schema: "schemas/corpus_lock.json" }], outputs: [{ name: "summary", schema: "schemas/summary.json", description: "", output_kind: "structured_data" }] },
  ],
  listReviewItems: async () => [],
  resolveReviewItem: async () => ({}),
  setCredential: async () => undefined,
  testCredential: async () => ({ ok: false, detail: "Preview only" }),
  getCredentialStatus: async () => ({ anthropic: false, openai: false, ollama: false }),
  loadModuleSchema: async () => ({ type: "object", properties: {} }),
  openProject: async () => null,
  validateProtocol: async () => ({}),
  freezeProtocol: async () => ({}),
  run: async () => ({ completed_status: "preview" }),
  generateMethods: async () => "",
  lockEnvironment: async () => ({}),
  exportBundle: async () => null,
  replayBundle: async () => ({}),
};

function App() {
  const setModules = useWorkspace((s) => s.setModules);
  const setStatus = useWorkspace((s) => s.setStatus);
  const firstRunComplete = useWorkspace((s) => s.firstRunComplete);
  const applyRunProgress = useWorkspace((s) => s.applyRunProgress);
  const setCredentialStatus = useWorkspace((s) => s.setCredentialStatus);

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
