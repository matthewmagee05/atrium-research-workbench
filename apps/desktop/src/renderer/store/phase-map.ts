// Curates the user-facing translation of module IDs into "phases" for the
// guided flow. Anything not listed here falls into "Other" — typically
// intermediate plumbing that the guided UI hides from result cards.

export interface PhaseMeta {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  order: number;
}

const PHASES: PhaseMeta[] = [
  { id: "question",      label: "Defining research questions",   shortLabel: "Questions",       description: "Generate candidate questions from your topic.", order: 1 },
  { id: "hypothesis",    label: "Drafting hypotheses",           shortLabel: "Hypotheses",      description: "Turn questions into testable hypotheses.",       order: 2 },
  { id: "source",        label: "Finding papers",                shortLabel: "Sources",         description: "Pull bibliographic records from your sources.",  order: 3 },
  { id: "normalize",     label: "Normalizing records",           shortLabel: "Normalize",       description: "Standardize titles, DOIs, authors.",             order: 4 },
  { id: "dedupe",        label: "Deduplicating",                 shortLabel: "Dedupe",          description: "Collapse duplicates and lock the corpus.",       order: 5 },
  { id: "screen",        label: "Screening for relevance",       shortLabel: "Screen",          description: "Include or exclude papers by your criteria.",    order: 6 },
  { id: "extract",       label: "Extracting study details",      shortLabel: "Extract",         description: "Pull structured fields from included papers.",   order: 7 },
  { id: "prisma",        label: "Building PRISMA flow",          shortLabel: "PRISMA",          description: "Count inclusions and exclusions.",               order: 8 },
  { id: "analyze",       label: "Running bibliometric analysis", shortLabel: "Analyze",         description: "Compute corpus statistics and figures.",         order: 9 },
  { id: "narrative",     label: "Writing narrative draft",       shortLabel: "Draft",           description: "Compose a markdown draft of results.",           order: 10 },
  { id: "preregister",   label: "Generating preregistration",    shortLabel: "Preregister",     description: "Draft an OSF-style preregistration.",            order: 11 },
  { id: "fetch",         label: "Fetching full text",            shortLabel: "Full text",       description: "Retrieve open-access PDFs.",                     order: 12 },
  { id: "report",        label: "Packaging report",              shortLabel: "Report",          description: "Assemble manuscript and supplementary outputs.", order: 13 },
  { id: "deposit",       label: "Depositing to archive",         shortLabel: "Deposit",         description: "Push outputs to OSF / Zenodo / Figshare.",       order: 14 },
  { id: "other",         label: "Other steps",                   shortLabel: "Other",           description: "",                                              order: 99 },
];

const PHASE_BY_ID = Object.fromEntries(PHASES.map((p) => [p.id, p])) as Record<string, PhaseMeta>;

const MODULE_TO_PHASE: Record<string, string> = {
  "question-development":      "question",
  "hypothesis-drafter":        "hypothesis",
  "openalex-source":           "source",
  "crossref-source":           "source",
  "semantic-scholar-source":   "source",
  "fixture-source":            "source",
  "arxiv-source":              "source",
  "biorxiv-source":            "source",
  "zotero-source":             "source",
  "endnote-xml-source":        "source",
  "ris-source":                "source",
  "rayyan-import":             "source",
  "prospero-source":           "source",
  "record-normalizer":         "normalize",
  "deterministic-dedupe":      "dedupe",
  "llm-screener":              "screen",
  "llm-extractor":             "extract",
  "prisma-flow":               "prisma",
  "bibliometrix-r":            "analyze",
  "descriptive-summary-py":    "analyze",
  "meta-analysis-r":           "analyze",
  "meta-regression-r":         "analyze",
  "funnel-plot-r":             "analyze",
  "topic-model-py":            "analyze",
  "concept-network-py":        "analyze",
  "narrative-drafter":         "narrative",
  "cover-letter-drafter":      "narrative",
  "preregistration-generator": "preregister",
  "prospero-submit":           "preregister",
  "unpaywall-source":          "fetch",
  "pdf-fetcher":               "fetch",
  "grobid-extractor":          "fetch",
  "pdf-section-router":        "fetch",
  "table-extractor":           "extract",
  "citation-resolver":         "extract",
  "risk-of-bias":              "analyze",
  "grade-assessor":            "analyze",
  "quality-flags":             "analyze",
  "manuscript-formatter":      "report",
  "supplementary-bundle":      "report",
  "prisma-flow-figure":        "prisma",
  "forest-plot-figure":        "analyze",
  "prisma-2020-checklist":     "report",
  "citation-export":           "report",
  "ris-export":                "report",
  "bibtex-export":             "report",
  "zotero-export":             "report",
  "covidence-export":          "report",
  "osf-deposit":               "deposit",
  "zenodo-deposit":            "deposit",
  "figshare-deposit":          "deposit",
  "reproducibility-bundle":    "report",
};

export function phaseForModule(moduleId: string | undefined): PhaseMeta {
  if (!moduleId) return PHASE_BY_ID["other"];
  return PHASE_BY_ID[MODULE_TO_PHASE[moduleId] ?? "other"];
}

export function listPhases(): PhaseMeta[] {
  return PHASES;
}

// Outputs flagged here are surfaced in the post-run review.
// Outputs not listed are still produced and exported, just not promoted in the UI.
export interface ReviewOutputMeta {
  label: string;
  // Human description of what produced this (filled in at render time with model info).
  source: (context: { provider?: string; model?: string }) => string;
  // Optional priority to control card ordering (lower = earlier). Defaults to phase order.
  priority?: number;
}

const REVIEW_OUTPUTS: Record<string, Record<string, ReviewOutputMeta>> = {
  "question-development": {
    questions: {
      label: "Research questions",
      source: ({ provider, model }) => `Generated by ${provider ?? "an LLM"}${model ? ` (${model})` : ""} from your topic.`,
    },
  },
  "hypothesis-drafter": {
    hypotheses: {
      label: "Hypotheses",
      source: ({ provider, model }) => `Drafted by ${provider ?? "an LLM"}${model ? ` (${model})` : ""} from the reviewed questions.`,
    },
  },
  "openalex-source": {
    records: {
      label: "Papers found (OpenAlex)",
      source: () => "Pulled from OpenAlex.",
    },
  },
  "crossref-source": {
    records: {
      label: "Papers found (Crossref)",
      source: () => "Pulled from Crossref.",
    },
  },
  "semantic-scholar-source": {
    records: {
      label: "Papers found (Semantic Scholar)",
      source: () => "Pulled from Semantic Scholar.",
    },
  },
  "deterministic-dedupe": {
    deduped: {
      label: "Deduplicated corpus",
      source: () => "Deterministic dedupe by DOI + title + author overlap.",
    },
  },
  "llm-screener": {
    screening_decisions: {
      label: "Screening decisions",
      source: ({ provider, model }) => `Inclusion / exclusion decisions made by ${provider ?? "an LLM"}${model ? ` (${model})` : ""}.`,
    },
  },
  "llm-extractor": {
    extracted: {
      label: "Extracted study fields",
      source: ({ provider, model }) => `Structured fields pulled by ${provider ?? "an LLM"}${model ? ` (${model})` : ""}.`,
    },
  },
  "prisma-flow": {
    flow_counts: {
      label: "PRISMA flow counts",
      source: () => "Computed deterministically from screening decisions.",
    },
  },
  "bibliometrix-r": {
    tables: {
      label: "Bibliometric tables",
      source: () => "Deterministic R aggregations.",
    },
    figures: {
      label: "Bibliometric figures",
      source: () => "Deterministic figure specs from R.",
    },
  },
  "narrative-drafter": {
    draft: {
      label: "Narrative draft",
      source: ({ provider, model }) => `Drafted by ${provider ?? "an LLM"}${model ? ` (${model})` : ""}. Always requires human review.`,
      priority: 1,
    },
    claims: {
      label: "Grounded claims",
      source: () => "Each claim links back to the artifacts that support it.",
    },
  },
  "preregistration-generator": {
    preregistration: {
      label: "Preregistration document",
      source: ({ provider, model }) => `Drafted by ${provider ?? "an LLM"}${model ? ` (${model})` : ""}.`,
    },
  },
};

export function reviewMetaFor(moduleId: string, port: string): ReviewOutputMeta | null {
  return REVIEW_OUTPUTS[moduleId]?.[port] ?? null;
}

export function isReviewableOutput(moduleId: string, port: string): boolean {
  return reviewMetaFor(moduleId, port) !== null;
}

// Setup cards: user-facing concerns that map (sometimes one-to-many) onto
// module params. The guided setup walks these in order. Each card's `bindings`
// describes which (module, param) pairs it edits. When the user has no node of
// a given module on the canvas, the card is omitted.
export type SetupBindingType = "text" | "textarea" | "string-list" | "number" | "fixed-choice";

export interface SetupCardBinding {
  moduleId: string;
  paramKey: string;
}

export interface SetupCard {
  id: string;
  label: string;
  description: string;
  inputType: SetupBindingType;
  required?: boolean;
  // Multiple choice options for fixed-choice; ignored otherwise.
  choices?: Array<{ value: string; label: string }>;
  bindings: SetupCardBinding[];
  helpText?: string;
}

export const SETUP_CARDS: SetupCard[] = [
  {
    id: "topic",
    label: "Research topic",
    description: "One sentence describing the area you want to investigate. The LLM uses it to draft candidate questions and frame the narrative.",
    inputType: "textarea",
    required: true,
    bindings: [
      { moduleId: "question-development", paramKey: "topic" },
    ],
    helpText: "Be specific. \"Effect of intermittent fasting on cognitive performance in older adults\" beats \"fasting and the brain.\"",
  },
  {
    id: "max-questions",
    label: "Number of candidate questions",
    description: "How many candidate questions the LLM should propose.",
    inputType: "number",
    bindings: [
      { moduleId: "question-development", paramKey: "max_questions" },
    ],
  },
  {
    id: "inclusion",
    label: "What papers should be INCLUDED",
    description: "Criteria that a paper must meet to be screened in. One per line.",
    inputType: "string-list",
    bindings: [
      { moduleId: "llm-screener", paramKey: "inclusion_criteria" },
    ],
    helpText: "Example:\nstudies humans\nreports a quantitative outcome",
  },
  {
    id: "exclusion",
    label: "What papers should be EXCLUDED",
    description: "Criteria that, if matched, exclude a paper. One per line.",
    inputType: "string-list",
    bindings: [
      { moduleId: "llm-screener", paramKey: "exclusion_criteria" },
    ],
    helpText: "Example:\nnon-English\nconference abstract only\noff topic",
  },
  {
    id: "narrative-sections",
    label: "Narrative sections",
    description: "Which sections the final draft should contain. One per line.",
    inputType: "string-list",
    bindings: [
      { moduleId: "narrative-drafter", paramKey: "sections" },
    ],
  },
];
