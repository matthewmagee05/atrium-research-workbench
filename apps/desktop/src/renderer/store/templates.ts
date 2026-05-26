import type { PipelineEdge, PipelineNode } from "./workspace";

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  steps: string[];
  llmCalls: string;
  goodFor: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  custom?: boolean;
  savedAt?: number;
}

let counter = 0;
function uid() {
  return `tpl-${++counter}-${Date.now().toString(36)}`;
}

interface TemplateMeta {
  description: string;
  steps: string[];
  llmCalls: string;
  goodFor: string;
}

function makeTemplate(
  id: string,
  name: string,
  meta: TemplateMeta,
  spec: Array<{ moduleId: string; params: Record<string, unknown>; position: { x: number; y: number }; from?: Array<{ sourceIndex: number; sourcePort: string; targetPort: string }> }>,
): PipelineTemplate {
  const nodes: PipelineNode[] = spec.map((s) => ({
    id: uid(),
    moduleId: s.moduleId,
    params: s.params,
    position: s.position,
  }));
  const edges: PipelineEdge[] = [];
  spec.forEach((s, idx) => {
    (s.from ?? []).forEach((edge) => {
      edges.push({
        id: uid(),
        source: nodes[edge.sourceIndex].id,
        sourcePort: edge.sourcePort,
        target: nodes[idx].id,
        targetPort: edge.targetPort,
      });
    });
  });
  return { id, name, ...meta, nodes, edges };
}

export const TEMPLATES: PipelineTemplate[] = [
  makeTemplate(
    "full-research-project",
    "Full Research Project (recommended)",
    {
      description: "End-to-end research pipeline: scope the question, draft hypotheses, preregister, find papers, screen with an LLM, then run bibliometric analysis and a narrative report.",
      steps: [
        "Generate candidate research questions for your topic",
        "Draft testable hypotheses with variables and assumptions",
        "Produce an OSF-style preregistration draft for human review",
        "Fetch records from OpenAlex (start in fixture mode, switch to live later)",
        "Normalize titles, DOIs, authors",
        "Deduplicate by DOI + title + author overlap",
        "LLM-screen each record against your inclusion / exclusion criteria",
        "Generate a PRISMA flow diagram",
        "Run bibliometric statistics over the deduplicated corpus",
        "Draft a narrative report grounded in the bibliometric summary",
      ],
      llmCalls: "~1 + 1 + 1 (question / hypothesis / prereg) + 1 per record (screener) + 1 (narrative). Use Ollama locally to avoid cost.",
      goodFor: "Most research projects. Edit out the stages you don't need by selecting a node and clicking the trash icon.",
    },
    [
      // Top row: question → hypothesis → preregistration
      { moduleId: "question-development", params: { topic: "", max_questions: 5, provider: "anthropic", model: "claude-sonnet-4-20250514" }, position: { x: 40, y: 60 } },
      { moduleId: "hypothesis-drafter", params: { max_hypotheses: 5, provider: "anthropic", model: "claude-sonnet-4-20250514" }, position: { x: 280, y: 60 }, from: [{ sourceIndex: 0, sourcePort: "questions", targetPort: "questions" }] },
      { moduleId: "preregistration-generator", params: { template: "osf-standard", provider: "anthropic", model: "claude-sonnet-4-20250514" }, position: { x: 520, y: 60 }, from: [{ sourceIndex: 1, sourcePort: "hypotheses", targetPort: "hypotheses" }] },

      // Middle row: source → normalize → dedupe → screen → prisma
      { moduleId: "openalex-source", params: { source_mode: "fixture", fixture_id: "tiny-corpus" }, position: { x: 40, y: 320 } },
      { moduleId: "record-normalizer", params: {}, position: { x: 280, y: 320 }, from: [{ sourceIndex: 3, sourcePort: "records", targetPort: "records" }] },
      { moduleId: "deterministic-dedupe", params: { doi_match: true, title_similarity_threshold: 0.95, author_overlap_threshold: 0.5 }, position: { x: 520, y: 320 }, from: [{ sourceIndex: 4, sourcePort: "normalized", targetPort: "normalized" }] },
      { moduleId: "llm-screener", params: { inclusion_criteria: ["topic relevant"], exclusion_criteria: ["off topic"], confidence_threshold: 0.7, provider: "anthropic", model: "claude-sonnet-4-20250514" }, position: { x: 760, y: 320 }, from: [{ sourceIndex: 5, sourcePort: "deduped", targetPort: "records" }] },
      { moduleId: "prisma-flow", params: {}, position: { x: 1000, y: 320 }, from: [{ sourceIndex: 6, sourcePort: "screening_decisions", targetPort: "screening_decisions" }] },

      // Bottom row: bibliometric + narrative
      {
        moduleId: "bibliometrix-r",
        params: { analyses: ["annual_publications", "venue_publications", "author_publications"], use_bibliometrix_package: false },
        position: { x: 760, y: 580 },
        from: [
          { sourceIndex: 5, sourcePort: "deduped", targetPort: "deduped" },
          { sourceIndex: 5, sourcePort: "corpus_lock", targetPort: "corpus_lock" },
        ],
      },
      { moduleId: "narrative-drafter", params: { provider: "anthropic", model: "claude-sonnet-4-20250514" }, position: { x: 1000, y: 580 }, from: [{ sourceIndex: 8, sourcePort: "summary", targetPort: "summary" }] },
    ],
  ),
  makeTemplate(
    "systematic-review",
    "Systematic Review (screening only)",
    {
      description: "Inclusion / exclusion screening with PRISMA. Skip the question and hypothesis stages — bring your criteria.",
      steps: [
        "Fetch records from OpenAlex",
        "Normalize and deduplicate",
        "LLM-screen against inclusion / exclusion criteria",
        "Generate a PRISMA flow diagram",
      ],
      llmCalls: "~1 LLM call per record (screener).",
      goodFor: "Lit reviews where the criteria are already nailed down.",
    },
    [
      { moduleId: "openalex-source", params: { source_mode: "fixture", fixture_id: "tiny-corpus" }, position: { x: 40, y: 120 } },
      { moduleId: "record-normalizer", params: {}, position: { x: 280, y: 120 }, from: [{ sourceIndex: 0, sourcePort: "records", targetPort: "records" }] },
      { moduleId: "deterministic-dedupe", params: { doi_match: true, title_similarity_threshold: 0.95, author_overlap_threshold: 0.5 }, position: { x: 520, y: 120 }, from: [{ sourceIndex: 1, sourcePort: "normalized", targetPort: "normalized" }] },
      { moduleId: "llm-screener", params: { inclusion_criteria: ["topic relevant"], exclusion_criteria: ["off topic"], confidence_threshold: 0.7, provider: "anthropic", model: "claude-sonnet-4-20250514" }, position: { x: 760, y: 120 }, from: [{ sourceIndex: 2, sourcePort: "deduped", targetPort: "records" }] },
      { moduleId: "prisma-flow", params: {}, position: { x: 1000, y: 120 }, from: [{ sourceIndex: 3, sourcePort: "screening_decisions", targetPort: "screening_decisions" }] },
    ],
  ),
  makeTemplate(
    "bibliometric-analysis",
    "Bibliometric Analysis (stats only)",
    {
      description: "Quantitative analysis of a paper corpus: yearly trends, top venues, co-authorship, citations. No LLM calls.",
      steps: [
        "Fetch records from OpenAlex",
        "Normalize and deduplicate",
        "Run bibliometric statistics in R",
      ],
      llmCalls: "Zero. Fully deterministic.",
      goodFor: "Field-mapping studies, citation-trend analysis, and when no LLM budget is available.",
    },
    [
      { moduleId: "openalex-source", params: { source_mode: "fixture", fixture_id: "tiny-corpus" }, position: { x: 40, y: 120 } },
      { moduleId: "record-normalizer", params: {}, position: { x: 280, y: 120 }, from: [{ sourceIndex: 0, sourcePort: "records", targetPort: "records" }] },
      { moduleId: "deterministic-dedupe", params: { doi_match: true, title_similarity_threshold: 0.95, author_overlap_threshold: 0.5 }, position: { x: 520, y: 120 }, from: [{ sourceIndex: 1, sourcePort: "normalized", targetPort: "normalized" }] },
      {
        moduleId: "bibliometrix-r",
        params: { analyses: ["annual_publications", "venue_publications", "author_publications"], use_bibliometrix_package: false },
        position: { x: 760, y: 120 },
        from: [
          { sourceIndex: 2, sourcePort: "deduped", targetPort: "deduped" },
          { sourceIndex: 2, sourcePort: "corpus_lock", targetPort: "corpus_lock" },
        ],
      },
    ],
  ),
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Start empty. Drag modules from the library on the left.",
    steps: ["You decide what to build."],
    llmCalls: "Depends on what you add.",
    goodFor: "Custom pipelines that don't match a template.",
    nodes: [],
    edges: [],
  },
];

export function instantiateTemplate(template: PipelineTemplate): { nodes: PipelineNode[]; edges: PipelineEdge[] } {
  const idMap = new Map<string, string>();
  const nodes = template.nodes.map((n) => {
    const newId = uid();
    idMap.set(n.id, newId);
    return { ...n, id: newId };
  });
  const edges = template.edges.map((e) => ({
    ...e,
    id: uid(),
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }));
  return { nodes, edges };
}

/**
 * Build a PipelineTemplate from the current canvas state. Steps + LLM-call
 * estimate are auto-summarized from the modules; callers can override later.
 */
export function templateFromPipeline(
  pipelineNodes: PipelineNode[],
  pipelineEdges: PipelineEdge[],
  modules: Array<{ id: string; name?: string; llm?: { required?: boolean } }>,
  meta: { name: string; description: string; goodFor?: string },
): PipelineTemplate {
  const steps = pipelineNodes.map((n) => {
    const mod = modules.find((m) => m.id === n.moduleId);
    return mod?.name ?? n.moduleId;
  });
  const llmNodes = pipelineNodes.filter((n) => modules.find((m) => m.id === n.moduleId)?.llm?.required).length;
  const llmCalls = llmNodes === 0
    ? "Zero. Fully deterministic."
    : `Approximately ${llmNodes} LLM-using step(s). Cost scales with corpus size for record-level steps.`;
  // Deep-copy so future canvas edits don't mutate the saved template.
  return {
    id: `user-tpl-${Date.now().toString(36)}`,
    name: meta.name,
    description: meta.description,
    goodFor: meta.goodFor ?? "Custom pipeline saved from the workbench.",
    llmCalls,
    steps,
    nodes: JSON.parse(JSON.stringify(pipelineNodes)) as PipelineNode[],
    edges: JSON.parse(JSON.stringify(pipelineEdges)) as PipelineEdge[],
    custom: true,
    savedAt: Date.now(),
  };
}
