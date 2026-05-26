import { create } from "zustand";
import { applyDefaultLlmToParams, isLlmProvider, type DefaultLlm } from "./module-catalog";
import type { PipelineTemplate } from "./templates";

const DEFAULT_LLM_STORAGE_KEY = "rwb.defaultLlm.v1";
const APP_MODE_STORAGE_KEY = "rwb.appMode.v1";
const CUSTOM_TEMPLATES_STORAGE_KEY = "rwb.customTemplates.v1";

function readCustomTemplatesFromStorage(): PipelineTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is PipelineTemplate =>
      !!t && typeof t === "object" && typeof t.id === "string" && Array.isArray(t.nodes) && Array.isArray(t.edges));
  } catch {
    return [];
  }
}

function writeCustomTemplatesToStorage(value: PipelineTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage unavailable / quota exceeded
  }
}

export type AppMode = "guided" | "builder";

function readAppModeFromStorage(): AppMode {
  if (typeof window === "undefined") return "guided";
  try {
    const raw = window.localStorage.getItem(APP_MODE_STORAGE_KEY);
    if (raw === "builder" || raw === "guided") return raw;
  } catch {
    // localStorage unavailable
  }
  return "guided";
}

function writeAppModeToStorage(value: AppMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, value);
  } catch {
    // localStorage unavailable
  }
}

function readDefaultLlmFromStorage(): DefaultLlm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEFAULT_LLM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { provider?: unknown; model?: unknown };
    if (!isLlmProvider(parsed.provider) || typeof parsed.model !== "string" || !parsed.model) {
      return null;
    }
    return { provider: parsed.provider, model: parsed.model };
  } catch {
    return null;
  }
}

function writeDefaultLlmToStorage(value: DefaultLlm | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(DEFAULT_LLM_STORAGE_KEY, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(DEFAULT_LLM_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode, etc.) - safe to ignore
  }
}

export type ModuleManifest = {
  id: string;
  version: string;
  name: string;
  stage: string;
  runtime: string;
  description: string;
  inputs: Array<{ name: string; schema: string; optional?: boolean }>;
  outputs: Array<{ name: string; schema: string; description: string; output_kind: string }>;
  params_schema?: string;
  llm?: { required?: boolean };
  determinism?: { level?: string };
};

export type PipelineNode = {
  id: string;
  moduleId: string;
  params: Record<string, unknown>;
  position: { x: number; y: number };
};

export type PipelineEdge = {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
};

export type RunMode = "execute" | "deterministic-rerun" | "full-rerun" | "variance-audit";
export type WorkspaceView = "setup" | "pipeline" | "run" | "review" | "results" | "publish" | "reviewer";

export type BudgetSnapshot = {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
};

export type NodeProgressState = {
  nodeId: string;
  moduleId?: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  durationMs?: number;
  llmCalls?: number;
  tokens?: number;
  costUsd?: number;
  cacheHit?: boolean;
};

export type RunProgressState = {
  active: boolean;
  runId: string | null;
  totalNodes: number;
  completedNodes: number;
  byNode: Record<string, NodeProgressState>;
  error?: string;
};

interface WorkspaceState {
  modules: ModuleManifest[];
  projectDir: string;
  protocolPath: string;
  status: string;
  mode: RunMode;
  lastRun: Record<string, unknown> | null;
  reviewItems: Array<Record<string, unknown>>;
  credentialProvider: "anthropic" | "ollama" | "openai";
  credentialValue: string;
  pipelineNodes: PipelineNode[];
  pipelineEdges: PipelineEdge[];
  selectedNodeId: string | null;
  budget: BudgetSnapshot;
  budgetDrawerOpen: boolean;
  firstRunComplete: boolean;
  bundleImportPath: string | null;
  runProgress: RunProgressState;
  credentialStatus: { anthropic: boolean; openai: boolean; ollama: boolean };
  settingsOpen: boolean;
  showNextSteps: boolean;
  bundleOnlyMode: boolean;
  activeView: WorkspaceView;
  reviewerNotes: Array<{ artifactId: string; note: string; createdAt: string }>;
  defaultLlm: DefaultLlm | null;
  viewerArtifactId: string | null;
  appMode: AppMode;
  customTemplates: PipelineTemplate[];
  saveTemplateDialogOpen: boolean;

  setModules: (modules: ModuleManifest[]) => void;
  setProjectDir: (dir: string) => void;
  setProtocolPath: (path: string) => void;
  setStatus: (status: string) => void;
  setMode: (mode: RunMode) => void;
  setLastRun: (run: Record<string, unknown> | null) => void;
  setReviewItems: (items: Array<Record<string, unknown>>) => void;
  setCredentialProvider: (provider: "anthropic" | "ollama" | "openai") => void;
  setCredentialValue: (value: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setBudget: (budget: BudgetSnapshot) => void;
  setBudgetDrawerOpen: (open: boolean) => void;
  setFirstRunComplete: (complete: boolean) => void;
  setBundleImportPath: (path: string | null) => void;
  applyRunProgress: (event: import("../vite-env").RunProgressPayload) => void;
  resetRunProgress: () => void;
  setCredentialStatus: (status: { anthropic: boolean; openai: boolean; ollama: boolean }) => void;
  setSettingsOpen: (open: boolean) => void;
  setShowNextSteps: (show: boolean) => void;
  setBundleOnlyMode: (enabled: boolean) => void;
  setActiveView: (view: WorkspaceView) => void;
  addReviewerNote: (artifactId: string, note: string) => void;
  clearReviewerNotes: () => void;
  setDefaultLlm: (value: DefaultLlm | null) => void;
  applyDefaultLlmToAllNodes: () => number;
  setViewerArtifactId: (id: string | null) => void;
  setAppMode: (mode: AppMode) => void;
  saveCustomTemplate: (template: PipelineTemplate) => void;
  deleteCustomTemplate: (id: string) => void;
  setSaveTemplateDialogOpen: (open: boolean) => void;

  addPipelineNode: (node: PipelineNode) => void;
  removePipelineNode: (id: string) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  updateNodeParams: (id: string, params: Record<string, unknown>) => void;
  addPipelineEdge: (edge: PipelineEdge) => void;
  removePipelineEdge: (id: string) => void;
  clearPipeline: () => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  modules: [],
  projectDir: "",
  protocolPath: "",
  status: "Ready",
  mode: "execute",
  lastRun: null,
  reviewItems: [],
  credentialProvider: "anthropic",
  credentialValue: "",
  pipelineNodes: [],
  pipelineEdges: [],
  selectedNodeId: null,
  budget: { totalCalls: 0, totalTokens: 0, totalCostUsd: 0 },
  budgetDrawerOpen: false,
  firstRunComplete: false,
  bundleImportPath: null,
  runProgress: { active: false, runId: null, totalNodes: 0, completedNodes: 0, byNode: {} },
  credentialStatus: { anthropic: false, openai: false, ollama: false },
  settingsOpen: false,
  showNextSteps: false,
  bundleOnlyMode: false,
  activeView: "setup",
  reviewerNotes: [],
  defaultLlm: readDefaultLlmFromStorage(),
  viewerArtifactId: null,
  appMode: readAppModeFromStorage(),
  customTemplates: readCustomTemplatesFromStorage(),
  saveTemplateDialogOpen: false,

  setModules: (modules) => set({ modules }),
  setProjectDir: (projectDir) => set({ projectDir }),
  setProtocolPath: (protocolPath) => set({ protocolPath }),
  setStatus: (status) => set({ status }),
  setMode: (mode) => set({ mode }),
  setLastRun: (lastRun) => set({ lastRun }),
  setReviewItems: (reviewItems) => set({ reviewItems }),
  setCredentialProvider: (credentialProvider) => set({ credentialProvider }),
  setCredentialValue: (credentialValue) => set({ credentialValue }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setBudget: (budget) => set({ budget }),
  setBudgetDrawerOpen: (budgetDrawerOpen) => set({ budgetDrawerOpen }),
  setFirstRunComplete: (firstRunComplete) => set({ firstRunComplete }),
  setBundleImportPath: (bundleImportPath) => set({ bundleImportPath }),
  resetRunProgress: () => set({
    runProgress: { active: false, runId: null, totalNodes: 0, completedNodes: 0, byNode: {} },
    budget: { totalCalls: 0, totalTokens: 0, totalCostUsd: 0 },
  }),
  setCredentialStatus: (credentialStatus) => set({ credentialStatus }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShowNextSteps: (showNextSteps) => set({ showNextSteps }),
  setBundleOnlyMode: (bundleOnlyMode) => set({ bundleOnlyMode, activeView: bundleOnlyMode ? "reviewer" : "setup" }),
  setActiveView: (activeView) => set({ activeView }),
  addReviewerNote: (artifactId, note) => set((state) => ({
    reviewerNotes: [
      ...state.reviewerNotes,
      { artifactId, note, createdAt: new Date().toISOString() },
    ],
  })),
  clearReviewerNotes: () => set({ reviewerNotes: [] }),
  setDefaultLlm: (defaultLlm) => {
    writeDefaultLlmToStorage(defaultLlm);
    set((state) => {
      if (!defaultLlm) return { defaultLlm };
      const nextNodes = state.pipelineNodes.map((node) => {
        const nextParams = applyDefaultLlmToParams(node.params, defaultLlm);
        if (nextParams.provider !== node.params.provider || nextParams.model !== node.params.model) {
          return { ...node, params: nextParams };
        }
        return node;
      });
      return { defaultLlm, pipelineNodes: nextNodes };
    });
  },
  setViewerArtifactId: (viewerArtifactId) => set({ viewerArtifactId }),
  setAppMode: (appMode) => {
    writeAppModeToStorage(appMode);
    set({ appMode });
  },
  saveCustomTemplate: (template) => {
    set((state) => {
      const next = [...state.customTemplates.filter((t) => t.id !== template.id), template];
      writeCustomTemplatesToStorage(next);
      return { customTemplates: next };
    });
  },
  deleteCustomTemplate: (id) => {
    set((state) => {
      const next = state.customTemplates.filter((t) => t.id !== id);
      writeCustomTemplatesToStorage(next);
      return { customTemplates: next };
    });
  },
  setSaveTemplateDialogOpen: (saveTemplateDialogOpen) => set({ saveTemplateDialogOpen }),
  applyDefaultLlmToAllNodes: () => {
    let updated = 0;
    set((state) => {
      if (!state.defaultLlm) return state;
      const nextNodes = state.pipelineNodes.map((node) => {
        const nextParams = applyDefaultLlmToParams(node.params, state.defaultLlm);
        if (nextParams.provider !== node.params.provider || nextParams.model !== node.params.model) {
          updated += 1;
          return { ...node, params: nextParams };
        }
        return node;
      });
      return { pipelineNodes: nextNodes };
    });
    return updated;
  },
  applyRunProgress: (event) => set((state) => {
    const next: RunProgressState = { ...state.runProgress, byNode: { ...state.runProgress.byNode } };
    let nextBudget = state.budget;
    if (event.type === "run_started") {
      next.active = true;
      next.runId = event.runId;
      next.totalNodes = event.totalNodes ?? 0;
      next.completedNodes = 0;
      next.byNode = {};
      next.error = undefined;
      nextBudget = { totalCalls: 0, totalTokens: 0, totalCostUsd: 0 };
    } else if (event.type === "node_started" && event.nodeId) {
      next.byNode[event.nodeId] = { nodeId: event.nodeId, moduleId: event.moduleId, status: "running" };
    } else if (event.type === "node_completed" && event.nodeId) {
      next.byNode[event.nodeId] = {
        nodeId: event.nodeId,
        moduleId: event.moduleId,
        status: "completed",
        durationMs: event.durationMs,
        llmCalls: event.llmCalls,
        tokens: event.tokens,
        costUsd: event.costUsd,
        cacheHit: event.cacheHit,
      };
      next.completedNodes += 1;
      nextBudget = {
        totalCalls: event.cumulativeLlmCalls ?? nextBudget.totalCalls,
        totalTokens: event.cumulativeTokens ?? nextBudget.totalTokens,
        totalCostUsd: event.cumulativeCostUsd ?? nextBudget.totalCostUsd,
      };
    } else if (event.type === "node_skipped" && event.nodeId) {
      next.byNode[event.nodeId] = { nodeId: event.nodeId, moduleId: event.moduleId, status: "skipped" };
      next.completedNodes += 1;
    } else if (event.type === "run_completed") {
      next.active = false;
      if (event.cumulativeLlmCalls !== undefined) {
        nextBudget = {
          totalCalls: event.cumulativeLlmCalls,
          totalTokens: event.cumulativeTokens ?? 0,
          totalCostUsd: event.cumulativeCostUsd ?? 0,
        };
      }
    } else if (event.type === "run_failed") {
      next.active = false;
      next.error = event.error;
    }
    return { runProgress: next, budget: nextBudget };
  }),

  addPipelineNode: (node) => set((state) => ({ pipelineNodes: [...state.pipelineNodes, node] })),
  removePipelineNode: (id) => set((state) => ({
    pipelineNodes: state.pipelineNodes.filter((n) => n.id !== id),
    pipelineEdges: state.pipelineEdges.filter((e) => e.source !== id && e.target !== id),
    selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
  })),
  updateNodePosition: (id, position) => set((state) => ({
    pipelineNodes: state.pipelineNodes.map((n) => n.id === id ? { ...n, position } : n),
  })),
  updateNodeParams: (id, params) => set((state) => ({
    pipelineNodes: state.pipelineNodes.map((n) => n.id === id ? { ...n, params } : n),
  })),
  addPipelineEdge: (edge) => set((state) => ({ pipelineEdges: [...state.pipelineEdges, edge] })),
  removePipelineEdge: (id) => set((state) => ({
    pipelineEdges: state.pipelineEdges.filter((e) => e.id !== id),
  })),
  clearPipeline: () => set({ pipelineNodes: [], pipelineEdges: [], selectedNodeId: null }),
}));
