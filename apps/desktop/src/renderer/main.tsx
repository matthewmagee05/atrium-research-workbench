import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useWorkspace, type ModuleManifest } from "./store/workspace";
import { Topbar } from "./components/Topbar";
import { ModuleLibrary } from "./components/ModuleLibrary";
import { PipelineCanvas } from "./components/PipelineCanvas";
import { Inspector } from "./components/Inspector";
import { BudgetDrawer } from "./components/BudgetDrawer";
import { FirstRunFlow } from "./components/FirstRunFlow";
import "reactflow/dist/style.css";
import "./styles.css";

const api = window.rwb ?? {
  listModules: async () => [
    { id: "fixture-source", version: "1.0.0", name: "Fixture Source", stage: "source", runtime: "python", description: "Preview module" },
    { id: "record-normalizer", version: "1.0.0", name: "Record Normalizer", stage: "normalize", runtime: "python", description: "Preview module" },
    { id: "deterministic-dedupe", version: "1.0.0", name: "Deterministic Dedupe", stage: "dedupe", runtime: "python", description: "Preview module" },
    { id: "bibliometrix-r", version: "1.0.0", name: "Bibliometrix R", stage: "analyze", runtime: "r", description: "Preview module" },
  ],
  listReviewItems: async () => [],
  resolveReviewItem: async () => ({}),
  setCredential: async () => undefined,
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

  if (!firstRunComplete) {
    return <FirstRunFlow />;
  }

  return (
    <div className="app">
      <Topbar />
      <main className="workbench">
        <ModuleLibrary />
        <PipelineCanvas />
        <Inspector />
      </main>
      <BudgetDrawer />
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
