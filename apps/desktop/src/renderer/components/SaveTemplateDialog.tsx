import { useEffect, useMemo, useState } from "react";
import { X, Save, AlertCircle, Layers } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { templateFromPipeline } from "../store/templates";
import { phaseForModule } from "../store/phase-map";

export function SaveTemplateDialog() {
  const open = useWorkspace((s) => s.saveTemplateDialogOpen);
  const setOpen = useWorkspace((s) => s.setSaveTemplateDialogOpen);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const pipelineEdges = useWorkspace((s) => s.pipelineEdges);
  const modules = useWorkspace((s) => s.modules);
  const customTemplates = useWorkspace((s) => s.customTemplates);
  const saveCustomTemplate = useWorkspace((s) => s.saveCustomTemplate);
  const setStatus = useWorkspace((s) => s.setStatus);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goodFor, setGoodFor] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setGoodFor("");
    setError(null);
  }, [open]);

  const phaseSummary = useMemo(() => {
    const seen = new Set<string>();
    const ordered: Array<{ id: string; label: string; order: number }> = [];
    for (const node of pipelineNodes) {
      const phase = phaseForModule(node.moduleId);
      if (seen.has(phase.id)) continue;
      seen.add(phase.id);
      ordered.push({ id: phase.id, label: phase.shortLabel, order: phase.order });
    }
    ordered.sort((a, b) => a.order - b.order);
    return ordered;
  }, [pipelineNodes]);

  if (!open) return null;

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (pipelineNodes.length === 0) {
      setError("Add at least one module before saving a template.");
      return;
    }
    if (customTemplates.some((t) => t.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError(`A custom template named "${trimmedName}" already exists. Pick a different name or delete the old one first.`);
      return;
    }
    const template = templateFromPipeline(pipelineNodes, pipelineEdges, modules, {
      name: trimmedName,
      description: description.trim() || "Custom pipeline saved from the workbench.",
      goodFor: goodFor.trim() || undefined,
    });
    saveCustomTemplate(template);
    setStatus(`Saved custom template: ${trimmedName}`);
    setOpen(false);
  }

  return (
    <div className="wizardOverlay" onClick={() => setOpen(false)}>
      <div className="wizardCard bundleDialog saveTemplateDialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <h2><Save size={18} /> Save as custom template</h2>
          <button onClick={() => setOpen(false)}><X size={14} /></button>
        </div>

        <p className="saveTemplateLead">
          Capture the current canvas as a reusable template. It will appear in the template picker alongside the built-in ones.
        </p>

        <label className="saveTemplateField">
          <span>Name *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My screening-only workflow"
            autoFocus
          />
        </label>

        <label className="saveTemplateField">
          <span>Description</span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this pipeline does and when to use it."
          />
        </label>

        <label className="saveTemplateField">
          <span>Good for (optional)</span>
          <input
            type="text"
            value={goodFor}
            onChange={(e) => setGoodFor(e.target.value)}
            placeholder="e.g. systematic reviews with pre-defined criteria"
          />
        </label>

        <div className="saveTemplateSummary">
          <header><Layers size={13} /> Snapshot</header>
          <div className="saveTemplateSummaryRow">
            <strong>{pipelineNodes.length}</strong> modules · <strong>{pipelineEdges.length}</strong> connections
          </div>
          <div className="saveTemplateSummaryPhases">
            {phaseSummary.length === 0
              ? <span className="muted">No modules on the canvas.</span>
              : phaseSummary.map((p) => <span key={p.id} className="phasePill">{p.label}</span>)}
          </div>
        </div>

        {error && (
          <div className="dialogError">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="wizardActions">
          <button onClick={() => setOpen(false)}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={pipelineNodes.length === 0}>
            <Save size={14} /> Save template
          </button>
        </div>
      </div>
    </div>
  );
}
