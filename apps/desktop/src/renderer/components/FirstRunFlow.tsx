import { useMemo, useState, type DragEvent } from "react";
import { Rocket, ArrowRight, Sparkles, CheckCircle2, Zap, Trash2 } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { applyDefaultLlmToParams } from "../store/module-catalog";
import { TEMPLATES, instantiateTemplate, type PipelineTemplate } from "../store/templates";

type Step = "intro" | "template";

export function FirstRunFlow() {
  const [step, setStep] = useState<Step>("intro");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("full-research-project");
  const addPipelineNode = useWorkspace((s) => s.addPipelineNode);
  const addPipelineEdge = useWorkspace((s) => s.addPipelineEdge);
  const defaultLlm = useWorkspace((s) => s.defaultLlm);
  const setFirstRunComplete = useWorkspace((s) => s.setFirstRunComplete);
  const setShowNextSteps = useWorkspace((s) => s.setShowNextSteps);
  const setStatus = useWorkspace((s) => s.setStatus);
  const setProjectDir = useWorkspace((s) => s.setProjectDir);
  const setProtocolPath = useWorkspace((s) => s.setProtocolPath);
  const setBundleOnlyMode = useWorkspace((s) => s.setBundleOnlyMode);
  const setBundleImportPath = useWorkspace((s) => s.setBundleImportPath);
  const customTemplates = useWorkspace((s) => s.customTemplates);
  const deleteCustomTemplate = useWorkspace((s) => s.deleteCustomTemplate);

  const allTemplates = useMemo<PipelineTemplate[]>(() => [...customTemplates, ...TEMPLATES], [customTemplates]);

  function applyTemplate(templateId: string) {
    const template = allTemplates.find((t) => t.id === templateId);
    if (!template) return;
    const { nodes, edges } = instantiateTemplate(template);
    for (const node of nodes) {
      addPipelineNode({ ...node, params: applyDefaultLlmToParams(node.params, defaultLlm) });
    }
    for (const edge of edges) addPipelineEdge(edge);
    setStatus(`Loaded template: ${template.name}`);
  }

  function finishWithTemplate(templateId: string) {
    applyTemplate(templateId);
    setShowNextSteps(true);
    setFirstRunComplete(true);
  }

  function finishBlank() {
    setShowNextSteps(true);
    setFirstRunComplete(true);
  }

  async function importDroppedBundle(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] as File & { path?: string };
    const bundlePath = file?.path;
    if (!bundlePath || !window.rwb?.importBundleFromPath) {
      setStatus("Drop-zone import is available in the desktop app.");
      return;
    }
    const dest = await window.rwb.importBundleFromPath(bundlePath);
    if (!dest) {
      setStatus("Bundle import canceled.");
      return;
    }
    setProjectDir(dest);
    setProtocolPath(`${dest}/protocol.yaml`);
    setBundleImportPath(bundlePath);
    setBundleOnlyMode(true);
    setShowNextSteps(true);
    setFirstRunComplete(true);
    setStatus(`Bundle-only reviewer mode opened: ${dest}`);
  }

  if (step === "intro") {
    return (
      <div className="wizardOverlay">
        <div className="wizardCard intro">
          <div className="introHeader">
            <Rocket size={28} />
            <h1>Welcome to Atrium</h1>
          </div>
          <p className="introLead">
            Atrium is a desktop workbench for reproducible AI-assisted research pipelines.
            Compose a pipeline of modules, run it, and share a bundle that anyone can verify.
          </p>
          <div className="introGrid">
            <div className="introCard">
              <Zap size={20} />
              <strong>1. Compose</strong>
              <span>Pick a template or drag modules onto the canvas. Connect outputs to inputs.</span>
            </div>
            <div className="introCard">
              <Sparkles size={20} />
              <strong>2. Run</strong>
              <span>LLM calls go through a budgeted proxy. Every artifact is content-hashed.</span>
            </div>
            <div className="introCard">
              <CheckCircle2 size={20} />
              <strong>3. Verify</strong>
              <span>Bundle and share. Reviewers re-run the deterministic path and compare hashes.</span>
            </div>
          </div>
          <div className="wizardActions">
            <button className="primary" onClick={() => setStep("template")}>
              Pick a starting template <ArrowRight size={14} />
            </button>
            <button className="ghost" onClick={finishBlank}>Start with a blank canvas</button>
          </div>
          <div
            className="bundleDropZone"
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDrop={importDroppedBundle}
          >
            Drop a reproducibility bundle here to open reviewer mode
          </div>
        </div>
      </div>
    );
  }

  const selected = allTemplates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="wizardOverlay">
      <div className="wizardCard wide templatePicker">
        <h2><Rocket size={20} /> Pick a starting template</h2>
        <p>Each template populates the canvas with a working pipeline. You can edit anything afterward — including deleting modules you don't need.</p>

        <div className="templateLayout">
          <div className="templateList">
            {customTemplates.length > 0 && (
              <div className="templateGroupLabel">Your saved templates</div>
            )}
            {customTemplates.map((t) => (
              <div key={t.id} className={`templateChoiceRow ${selectedTemplateId === t.id ? "active" : ""}`}>
                <button
                  className={`templateChoice custom ${selectedTemplateId === t.id ? "active" : ""}`}
                  onClick={() => setSelectedTemplateId(t.id)}
                >
                  <strong>{t.name}</strong>
                  <span>{t.description}</span>
                </button>
                <button
                  className="templateDeleteBtn"
                  title="Delete this saved template"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete saved template "${t.name}"?`)) return;
                    deleteCustomTemplate(t.id);
                    if (selectedTemplateId === t.id) setSelectedTemplateId("full-research-project");
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {customTemplates.length > 0 && (
              <div className="templateGroupLabel">Built-in templates</div>
            )}
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className={`templateChoice ${selectedTemplateId === t.id ? "active" : ""}`}
                onClick={() => setSelectedTemplateId(t.id)}
              >
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
          <div className="templateDetail">
            {selected ? (
              <>
                <h3>{selected.name}</h3>
                <p className="templateDescription">{selected.description}</p>
                <div className="templateMeta">
                  <div><strong>Good for:</strong> {selected.goodFor}</div>
                  <div><strong>LLM usage:</strong> {selected.llmCalls}</div>
                </div>
                <strong className="templateStepsLabel">Pipeline steps</strong>
                <ol className="templateSteps">
                  {selected.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
                <button
                  className="primary"
                  onClick={() => finishWithTemplate(selected.id)}
                >
                  Use this template <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <div className="templateDetailEmpty">
                <p>Select a template on the left to see what it does.</p>
              </div>
            )}
          </div>
        </div>

        <div className="wizardActions">
          <button onClick={() => setStep("intro")}>Back</button>
          <button onClick={finishBlank} className="ghost">Skip — start blank</button>
        </div>
      </div>
    </div>
  );
}
