import { useState } from "react";
import { useWorkspace } from "../store/workspace";
import { serializePipelineToProtocol } from "./serialize-protocol";
import { validatePipeline, type ValidationIssue } from "./validate-pipeline";

const api = window.rwb;

export function useWorkflowActions() {
  const projectDir = useWorkspace((s) => s.projectDir);
  const setProjectDir = useWorkspace((s) => s.setProjectDir);
  const protocolPath = useWorkspace((s) => s.protocolPath);
  const setProtocolPath = useWorkspace((s) => s.setProtocolPath);
  const mode = useWorkspace((s) => s.mode);
  const setStatus = useWorkspace((s) => s.setStatus);
  const setLastRun = useWorkspace((s) => s.setLastRun);
  const setBudget = useWorkspace((s) => s.setBudget);
  const resetRunProgress = useWorkspace((s) => s.resetRunProgress);
  const setShowNextSteps = useWorkspace((s) => s.setShowNextSteps);
  const setActiveView = useWorkspace((s) => s.setActiveView);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const pipelineEdges = useWorkspace((s) => s.pipelineEdges);
  const modules = useWorkspace((s) => s.modules);

  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);

  async function openProject() {
    if (!api) return "";
    const dir = await api.openProject();
    if (dir) {
      setProjectDir(dir);
      setProtocolPath(`${dir}/protocol.yaml`);
      setStatus("Project opened");
    }
    return dir ?? "";
  }

  async function writePipelineToDisk(): Promise<boolean> {
    if (!api || !protocolPath) {
      setLastError("Open a project before saving.");
      setStatus("Open a project before saving.");
      return false;
    }
    if (pipelineNodes.length === 0) {
      setLastError("Pipeline is empty. Choose a template or add modules first.");
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
    if (!api || !protocolPath) {
      setLastError("Open a project before freezing.");
      setStatus("Open a project before freezing.");
      return false;
    }
    setLastError(null);
    try {
      setStatus("Saving pipeline...");
      const wrote = await writePipelineToDisk();
      if (!wrote) return false;
      setStatus("Freezing protocol...");
      await api.freezeProtocol(protocolPath);
      setStatus("Protocol frozen.");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(`Freeze failed: ${msg}`);
      setStatus(`Freeze failed: ${msg}`);
      return false;
    }
  }

  async function runProtocol() {
    if (!protocolPath) {
      setLastError("Choose a project first.");
      setStatus("Choose a project first.");
      setActiveView("setup");
      return null;
    }
    if (pipelineNodes.length === 0) {
      setLastError("Pipeline is empty. Choose a template or add modules first.");
      setStatus("Pipeline is empty.");
      setActiveView("setup");
      return null;
    }
    setLastError(null);
    setValidationIssues([]);
    setBusy(true);
    setShowNextSteps(true);
    setActiveView("run");
    setLastRun(null);
    resetRunProgress();
    try {
      setStatus("Validating pipeline...");
      const loader = api?.loadModuleSchema ?? (async () => ({}));
      const validation = await validatePipeline(pipelineNodes, pipelineEdges, modules, loader);
      if (!validation.valid) {
        setValidationIssues(validation.issues);
        setLastError(`Cannot run yet - ${validation.issues.length} issue(s) found.`);
        setStatus("Pipeline has unresolved issues.");
        return null;
      }
      setStatus("Saving and running pipeline...");
      const serialized = serializePipelineToProtocol(pipelineNodes, pipelineEdges, modules, {
        projectName: projectDir.split(/[/\\]/).filter(Boolean).pop() ?? "Atrium Project",
      });
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
        setActiveView("results");
      } else {
        setStatus(`Run ${status}.`);
        setLastError(`Run ${status}. Check the run monitor or audit log for details.`);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Run failed: ${msg}`);
      setLastError(`Run failed: ${msg}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function exportBundle() {
    if (!api || !projectDir) return "";
    setStatus("Exporting bundle...");
    const output = await api.exportBundle(projectDir);
    setStatus(output ? `Bundle exported to ${output}` : "Export canceled");
    return output ?? "";
  }

  return {
    busy,
    lastError,
    validationIssues,
    openProject,
    freezeProtocol,
    runProtocol,
    exportBundle,
    clearError: () => {
      setLastError(null);
      setValidationIssues([]);
    },
  };
}
