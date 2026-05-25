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
    "systematic-review",
    "Systematic Review",
    {
      description: "End-to-end PRISMA-style screening pipeline with LLM-assisted inclusion decisions.",
      steps: [
        "Fetch records from OpenAlex",
        "Normalize titles, DOIs, authors",
        "Deduplicate by DOI + title + author overlap",
        "LLM screen each record against inclusion / exclusion criteria",
        "Extract structured fields from included records",
        "Generate a PRISMA flow diagram",
      ],
      llmCalls: "~1 call per record (screening) + 1 call per included record (extraction)",
      goodFor: "Literature reviews where you need an auditable inclusion log.",
    },
    [
      { moduleId: "openalex-source", params: { source_mode: "fixture", fixture_id: "tiny-corpus" }, position: { x: 60, y: 200 } },
      { moduleId: "record-normalizer", params: {}, position: { x: 300, y: 200 }, from: [{ sourceIndex: 0, sourcePort: "records", targetPort: "records" }] },
      { moduleId: "deterministic-dedupe", params: { doi_match: true, title_similarity_threshold: 0.95, author_overlap_threshold: 0.5 }, position: { x: 540, y: 200 }, from: [{ sourceIndex: 1, sourcePort: "normalized", targetPort: "normalized" }] },
      { moduleId: "llm-screener", params: { inclusion_criteria: ["topic relevant"], exclusion_criteria: ["off topic"], confidence_threshold: 0.7 }, position: { x: 780, y: 140 }, from: [{ sourceIndex: 2, sourcePort: "deduped", targetPort: "records" }] },
      { moduleId: "prisma-flow", params: {}, position: { x: 780, y: 360 }, from: [{ sourceIndex: 3, sourcePort: "screening_decisions", targetPort: "screening_decisions" }] },
    ],
  ),
  makeTemplate(
    "bibliometric-analysis",
    "Bibliometric Analysis",
    {
      description: "Quantitative analysis of a paper corpus: yearly trends, top venues, co-authorship, citations.",
      steps: [
        "Fetch records from OpenAlex",
        "Normalize and deduplicate",
        "Run bibliometric statistics in R (annual publications, venues, authors, co-authorship, growth rate)",
        "Output summary statistics, tables, and figure specifications",
      ],
      llmCalls: "Zero LLM calls — purely deterministic statistics.",
      goodFor: "Survey papers, field-mapping studies, and citation-trend analysis.",
    },
    [
      { moduleId: "openalex-source", params: { source_mode: "fixture", fixture_id: "tiny-corpus" }, position: { x: 60, y: 200 } },
      { moduleId: "record-normalizer", params: {}, position: { x: 300, y: 200 }, from: [{ sourceIndex: 0, sourcePort: "records", targetPort: "records" }] },
      { moduleId: "deterministic-dedupe", params: { doi_match: true, title_similarity_threshold: 0.95, author_overlap_threshold: 0.5 }, position: { x: 540, y: 200 }, from: [{ sourceIndex: 1, sourcePort: "normalized", targetPort: "normalized" }] },
      {
        moduleId: "bibliometrix-r",
        params: { analyses: ["annual_publications", "venue_publications", "author_publications"], use_bibliometrix_package: false },
        position: { x: 780, y: 200 },
        from: [
          { sourceIndex: 2, sourcePort: "deduped", targetPort: "deduped" },
          { sourceIndex: 2, sourcePort: "corpus_lock", targetPort: "corpus_lock" },
        ],
      },
    ],
  ),
  makeTemplate(
    "hypothesis-driven",
    "Hypothesis-Driven Research",
    {
      description: "Generate questions, draft hypotheses, and produce a preregistration draft.",
      steps: [
        "Generate candidate research questions for a topic",
        "Draft testable hypotheses with variables and assumptions",
        "Produce an OSF-style preregistration draft for human review",
      ],
      llmCalls: "Roughly 3 LLM calls (one per stage).",
      goodFor: "Project scoping and preregistration. Every output is flagged for human review.",
    },
    [
      { moduleId: "question-development", params: { topic: "" }, position: { x: 60, y: 200 } },
      { moduleId: "hypothesis-drafter", params: { max_hypotheses: 5 }, position: { x: 360, y: 200 }, from: [{ sourceIndex: 0, sourcePort: "questions", targetPort: "questions" }] },
      { moduleId: "preregistration-generator", params: { template: "osf-standard" }, position: { x: 660, y: 200 }, from: [{ sourceIndex: 1, sourcePort: "hypotheses", targetPort: "hypotheses" }] },
    ],
  ),
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Start with an empty canvas. Drag modules from the library or hit Cmd-K (coming soon) to search.",
    steps: ["You decide the steps."],
    llmCalls: "Depends on what you build.",
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
