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

const DEV_MODULES_PREVIEW: ModuleManifest[] = [
  { id: "question-development",     version: "0.1.0", name: "Question Development",     stage: "question",    runtime: "python", description: "Generate candidate research questions",                       inputs: [],                                                                                                            outputs: [{ name: "questions",            schema: "schemas/questions.json",            description: "", output_kind: "structured_data" }] },
  { id: "hypothesis-drafter",       version: "0.1.0", name: "Hypothesis Drafter",       stage: "hypothesis",  runtime: "python", description: "Draft testable hypotheses",                                  inputs: [{ name: "questions",   schema: "schemas/questions.json"   }],                                              outputs: [{ name: "hypotheses",           schema: "schemas/hypotheses.json",           description: "", output_kind: "structured_data" }] },
  { id: "preregistration-generator",version: "0.1.0", name: "Preregistration Generator",stage: "report",      runtime: "python", description: "Draft preregistration",                                      inputs: [{ name: "hypotheses",  schema: "schemas/hypotheses.json"  }],                                              outputs: [{ name: "preregistration",      schema: "schemas/preregistration.json",      description: "", output_kind: "report_text" }] },
  { id: "openalex-source",          version: "1.0.0", name: "OpenAlex Source",          stage: "source",      runtime: "python", description: "Fetch records from OpenAlex",                                 inputs: [],                                                                                                            outputs: [{ name: "records",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "crossref-source",          version: "1.0.0", name: "Crossref Source",          stage: "source",      runtime: "python", description: "Fetch records from Crossref",                                 inputs: [],                                                                                                            outputs: [{ name: "records",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "semantic-scholar-source",  version: "1.0.0", name: "Semantic Scholar Source",  stage: "source",      runtime: "python", description: "Fetch records from Semantic Scholar",                         inputs: [],                                                                                                            outputs: [{ name: "records",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "fixture-source",           version: "1.0.0", name: "Fixture Source",           stage: "source",      runtime: "python", description: "Read bundled fixture corpus",                                 inputs: [],                                                                                                            outputs: [{ name: "records",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "record-normalizer",        version: "1.0.0", name: "Record Normalizer",        stage: "normalize",   runtime: "python", description: "Normalize titles/DOIs/authors",                               inputs: [{ name: "records",     schema: "schemas/input.json"       }],                                              outputs: [{ name: "normalized",           schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "deterministic-dedupe",     version: "1.0.0", name: "Deterministic Dedupe",     stage: "dedupe",      runtime: "python", description: "Remove duplicates",                                           inputs: [{ name: "normalized",  schema: "schemas/input.json"       }],                                              outputs: [{ name: "deduped",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }, { name: "corpus_lock", schema: "schemas/corpus_lock.json", description: "", output_kind: "structured_data" }] },
  { id: "llm-screener",             version: "0.1.0", name: "LLM Screener",             stage: "screen",      runtime: "python", description: "LLM-assisted inclusion / exclusion",                          inputs: [{ name: "records",     schema: "schemas/records.json"     }],                                              outputs: [{ name: "screening_decisions",  schema: "schemas/screening_decisions.json",  description: "", output_kind: "structured_data" }], llm: { required: true } },
  { id: "llm-extractor",            version: "0.1.0", name: "LLM Extractor",            stage: "extract",     runtime: "python", description: "Extract structured fields",                                   inputs: [{ name: "included_records", schema: "schemas/records.json" }],                                              outputs: [{ name: "extractions",          schema: "schemas/extractions.json",          description: "", output_kind: "structured_data" }], llm: { required: true } },
  { id: "prisma-flow",              version: "0.1.0", name: "PRISMA Flow",              stage: "report",      runtime: "python", description: "PRISMA flow counts",                                          inputs: [{ name: "screening_decisions", schema: "schemas/screening_decisions.json" }],                                outputs: [{ name: "prisma_flow",          schema: "schemas/prisma_flow.json",          description: "", output_kind: "structured_data" }] },
  { id: "bibliometrix-r",           version: "1.0.0", name: "Bibliometrix R",           stage: "analyze",     runtime: "r",      description: "Bibliometric stats",                                          inputs: [{ name: "deduped",     schema: "schemas/input.json"       }, { name: "corpus_lock", schema: "schemas/corpus_lock.json" }], outputs: [{ name: "summary",              schema: "schemas/summary.json",              description: "", output_kind: "structured_data" }] },
  { id: "descriptive-summary-py",   version: "1.0.0", name: "Descriptive Summary (Py)", stage: "analyze",     runtime: "python", description: "Plain-Python descriptive summary",                            inputs: [{ name: "normalized",  schema: "schemas/input.json"       }],                                              outputs: [{ name: "summary",              schema: "schemas/summary.json",              description: "", output_kind: "structured_data" }] },
  { id: "narrative-drafter",        version: "1.0.0", name: "Narrative Drafter",        stage: "report",      runtime: "python", description: "LLM-drafted narrative",                                       inputs: [{ name: "summary",     schema: "schemas/summary_input.json" }],                                            outputs: [{ name: "draft",                schema: "schemas/draft.json",                description: "", output_kind: "report_text" }], llm: { required: true } },
];

const api = window.rwb ?? {
  listModules: async () => DEV_MODULES_PREVIEW,
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
