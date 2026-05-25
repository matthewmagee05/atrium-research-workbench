import type { PipelineEdge, PipelineNode } from "./workspace";

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

let counter = 0;
function uid() {
  return `tpl-${++counter}-${Date.now().toString(36)}`;
}

function makeTemplate(
  id: string,
  name: string,
  description: string,
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
  return { id, name, description, nodes, edges };
}

export const TEMPLATES: PipelineTemplate[] = [
  makeTemplate(
    "systematic-review",
    "Systematic Review",
    "Source → Normalize → Dedupe → Screen → Extract → PRISMA flow",
    [
      { moduleId: "openalex-source", params: { source_mode: "fixture", fixture_id: "tiny-corpus" }, position: { x: 60, y: 200 } },
      { moduleId: "record-normalizer", params: {}, position: { x: 300, y: 200 }, from: [{ sourceIndex: 0, sourcePort: "records", targetPort: "records" }] },
      { moduleId: "deterministic-dedupe", params: {}, position: { x: 540, y: 200 }, from: [{ sourceIndex: 1, sourcePort: "normalized", targetPort: "normalized" }] },
      { moduleId: "llm-screener", params: {}, position: { x: 780, y: 140 }, from: [{ sourceIndex: 2, sourcePort: "deduped", targetPort: "records" }] },
      { moduleId: "llm-extractor", params: { fields: [] }, position: { x: 1020, y: 140 }, from: [{ sourceIndex: 3, sourcePort: "screening_decisions", targetPort: "included_records" }] },
      { moduleId: "prisma-flow", params: {}, position: { x: 780, y: 340 }, from: [{ sourceIndex: 3, sourcePort: "screening_decisions", targetPort: "screening_decisions" }] },
    ],
  ),
  makeTemplate(
    "bibliometric-analysis",
    "Bibliometric Analysis",
    "Source → Normalize → Dedupe → Bibliometrix R analysis with figures",
    [
      { moduleId: "openalex-source", params: { source_mode: "fixture", fixture_id: "tiny-corpus" }, position: { x: 60, y: 200 } },
      { moduleId: "record-normalizer", params: {}, position: { x: 300, y: 200 }, from: [{ sourceIndex: 0, sourcePort: "records", targetPort: "records" }] },
      { moduleId: "deterministic-dedupe", params: {}, position: { x: 540, y: 200 }, from: [{ sourceIndex: 1, sourcePort: "normalized", targetPort: "normalized" }] },
      {
        moduleId: "bibliometrix-r",
        params: { analyses: ["annual_publications", "venue_publications", "author_publications"] },
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
    "Question development → Hypothesis drafting → Preregistration",
    [
      { moduleId: "question-development", params: { topic: "" }, position: { x: 60, y: 200 } },
      { moduleId: "hypothesis-drafter", params: {}, position: { x: 300, y: 200 }, from: [{ sourceIndex: 0, sourcePort: "questions", targetPort: "questions" }] },
      { moduleId: "preregistration-generator", params: { template: "osf-standard" }, position: { x: 540, y: 200 }, from: [{ sourceIndex: 1, sourcePort: "hypotheses", targetPort: "hypotheses" }] },
    ],
  ),
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Start from scratch — drag modules from the library to the canvas",
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
