import {
  Database, Layers, Filter, ListChecks, FileSearch, BarChart3,
  HelpCircle, Lightbulb, FileSignature, Package, DownloadCloud, ClipboardCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface StageMeta {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  order: number;
}

export const STAGE_META: Record<string, StageMeta> = {
  question:    { id: "question",    label: "Define question",     description: "Frame the research question before searching.",                 icon: HelpCircle,    color: "#7b67e6", order: 1 },
  hypothesis:  { id: "hypothesis",  label: "Draft hypothesis",    description: "Turn the question into testable hypotheses.",                  icon: Lightbulb,     color: "#a06ce0", order: 2 },
  report:      { id: "report",      label: "Plan & report",       description: "Preregister, draft narratives, build PRISMA flows.",           icon: FileSignature, color: "#ea7a4a", order: 3 },
  source:      { id: "source",      label: "Find papers",         description: "Pull records from OpenAlex, Crossref, Semantic Scholar.",      icon: Database,      color: "#2c8b9a", order: 4 },
  normalize:   { id: "normalize",   label: "Normalize",           description: "Clean and standardize records into a common shape.",           icon: Layers,        color: "#3a9aa0", order: 5 },
  dedupe:      { id: "dedupe",      label: "Deduplicate",         description: "Collapse duplicates by DOI, title, and author overlap.",       icon: Filter,        color: "#3aa0a0", order: 6 },
  screen:      { id: "screen",      label: "Screen (LLM)",        description: "Inclusion / exclusion screening with human adjudication.",     icon: ListChecks,    color: "#5b8c45", order: 7 },
  extract:     { id: "extract",     label: "Extract (LLM)",       description: "Pull structured fields out of included papers.",               icon: FileSearch,    color: "#6b9c45", order: 8 },
  analyze:     { id: "analyze",     label: "Analyze",             description: "Bibliometric statistics, summaries, figure specs.",            icon: BarChart3,     color: "#4a85b0", order: 9 },
  "data-fetch": { id: "data-fetch", label: "Fetch full text",      description: "Retrieve PDFs and supplementary materials.",                   icon: DownloadCloud, color: "#357c8f", order: 8 },
  review:      { id: "review",      label: "Review quality",      description: "Human-reviewed risk-of-bias and evidence-certainty outputs.",  icon: ClipboardCheck,color: "#8a6f2a", order: 10 },
};

export const FALLBACK_STAGE: StageMeta = {
  id: "other", label: "Other", description: "Modules without a categorized stage.",
  icon: Package, color: "#7a7a7a", order: 99,
};

export function stageFor(stageId: string | undefined): StageMeta {
  if (!stageId) return FALLBACK_STAGE;
  return STAGE_META[stageId] ?? FALLBACK_STAGE;
}

// Per-module display extras the manifest doesn't carry: short tagline, when-to-use guidance,
// and recommended default params. These are curated for the built-in modules.
export interface ModuleExtras {
  tagline: string;
  whenToUse: string;
  recommendedParams?: Record<string, unknown>;
  recommendedNote?: string;
}

export type LlmProvider = "anthropic" | "openai" | "ollama";

export const PROVIDER_MODELS: Record<LlmProvider, string[]> = {
  anthropic: ["claude-sonnet-4-20250514", "claude-opus-4-20250514"],
  openai: ["gpt-4o-mini", "gpt-4o"],
  ollama: ["llama3.1:8b", "mistral", "qwen2.5:7b"],
};

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  ollama: "Ollama",
};

export function defaultModelForProvider(provider: string): string {
  const key = isLlmProvider(provider) ? provider : "anthropic";
  return PROVIDER_MODELS[key][0];
}

export function isLlmProvider(value: unknown): value is LlmProvider {
  return value === "anthropic" || value === "openai" || value === "ollama";
}

export interface DefaultLlm {
  provider: LlmProvider;
  model: string;
}

export function paramsUseLlm(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false;
  return typeof params.provider === "string" || typeof params.model === "string";
}

export function applyDefaultLlmToParams(
  params: Record<string, unknown> | undefined,
  defaultLlm: DefaultLlm | null,
): Record<string, unknown> {
  const next = { ...(params ?? {}) };
  if (defaultLlm && paramsUseLlm(next)) {
    next.provider = defaultLlm.provider;
    next.model = defaultLlm.model;
  }
  return next;
}

export const MODULE_EXTRAS: Record<string, ModuleExtras> = {
  "openalex-source": {
    tagline: "Pull records from the free OpenAlex bibliographic API.",
    whenToUse: "Good default source. No API key needed. Best coverage for recent work.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus" },
    recommendedNote: "Start with the bundled fixture; switch to live_archived once your query is dialed in.",
  },
  "crossref-source": {
    tagline: "Pull records from the Crossref Works API.",
    whenToUse: "Best DOI coverage. Authoritative for publication metadata.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus" },
    recommendedNote: "Set RWB_CROSSREF_EMAIL for the polite pool when running live.",
  },
  "semantic-scholar-source": {
    tagline: "Pull records from the Semantic Scholar Paper Search API.",
    whenToUse: "Strong abstract coverage and citation counts. Optional API key raises rate limit.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus" },
    recommendedNote: "For live mode, set RWB_SEMANTIC_SCHOLAR_API_KEY in the process environment if you need higher rate limits.",
  },
  "fixture-source": {
    tagline: "Read a bundled fixture corpus for offline / golden runs.",
    whenToUse: "Use in tests and demos. Fully deterministic.",
    recommendedParams: { fixture_id: "tiny-corpus" },
  },
  "record-normalizer": {
    tagline: "Standardize records: title casing, DOIs, author names, year as int.",
    whenToUse: "Always include after a source module. Deterministic.",
    recommendedParams: {},
    recommendedNote: "No params needed. Drop in after any source.",
  },
  "deterministic-dedupe": {
    tagline: "Remove duplicates by DOI + normalized title + author overlap.",
    whenToUse: "Always include after normalization. Outputs both deduped records and a corpus lock.",
    recommendedParams: { doi_match: true, title_similarity_threshold: 0.95, author_overlap_threshold: 0.5 },
  },
  "llm-screener": {
    tagline: "LLM-assisted title/abstract screening with inclusion/exclusion criteria.",
    whenToUse: "After dedupe, before extraction. Flags low-confidence decisions for human review.",
    recommendedParams: {
      inclusion_criteria: ["studies humans", "reports a quantitative outcome"],
      exclusion_criteria: ["non-English", "conference abstract only", "off topic"],
      confidence_threshold: 0.7,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    },
    recommendedNote: "Edit the criteria to match YOUR review. The defaults are placeholders.",
  },
  "llm-extractor": {
    tagline: "Extract structured fields from included papers (effect sizes, sample sizes, etc.).",
    whenToUse: "After screening. Define exactly which fields you need.",
    recommendedParams: {
      fields: [
        { name: "study_design", description: "e.g. RCT, cohort, case-control" },
        { name: "sample_size", description: "Total participants enrolled" },
      ],
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    },
  },
  "prisma-flow": {
    tagline: "Count screening decisions into a PRISMA flow diagram structure.",
    whenToUse: "After screening. No params — just connect screening_decisions in.",
    recommendedParams: {},
    recommendedNote: "Zero configuration. Reads screening_decisions and emits identified/screened/included/excluded counts.",
  },
  "bibliometrix-r": {
    tagline: "Bibliometric statistics: annual publications, top venues, co-authorship, citations.",
    whenToUse: "After dedupe, when you want quantitative corpus analysis.",
    recommendedParams: {
      analyses: ["annual_publications", "venue_publications", "author_publications"],
      use_bibliometrix_package: false,
    },
    recommendedNote: "Set use_bibliometrix_package: true to call the real bibliometrix CRAN package (must be installed locally).",
  },
  "descriptive-summary-py": {
    tagline: "Plain-Python descriptive summary over normalized records.",
    whenToUse: "Lightweight alternative to bibliometrix-r when R isn't available.",
    recommendedParams: { summary_fields: ["publication_year", "venue"] },
  },
  "narrative-drafter": {
    tagline: "LLM-drafted narrative report grounded in the summary and corpus.",
    whenToUse: "Final reporting step. Always requires human review before publication.",
    recommendedParams: {
      sections: ["Background", "Methods", "Results", "Discussion"],
      style_guide: "Academic tone. Cite using author-year. Avoid passive voice.",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    },
  },
  "question-development": {
    tagline: "Generate candidate research questions for a topic, each flagged for review.",
    whenToUse: "Use to scope a project. Always shape questions with a domain expert before continuing.",
    recommendedParams: { topic: "", max_questions: 5, provider: "anthropic", model: "claude-sonnet-4-20250514" },
    recommendedNote: "Fill the topic param with one sentence describing your area of inquiry.",
  },
  "hypothesis-drafter": {
    tagline: "Draft testable hypotheses with variables and assumptions from reviewed questions.",
    whenToUse: "After question-development. Each hypothesis is flagged for review.",
    recommendedParams: { max_hypotheses: 5, provider: "anthropic", model: "claude-sonnet-4-20250514" },
  },
  "preregistration-generator": {
    tagline: "Draft a preregistration document from reviewed hypotheses.",
    whenToUse: "After hypothesis-drafter. Outputs markdown ready for OSF / AsPredicted.",
    recommendedParams: { template: "osf-standard", provider: "anthropic", model: "claude-sonnet-4-20250514" },
  },
  "reproducibility-bundle": {
    tagline: "Assemble the final reproducibility bundle for sharing.",
    whenToUse: "Final step. Run once everything else is verified.",
    recommendedParams: {},
  },
  "unpaywall-source": {
    tagline: "Find open-access full-text URLs for records with DOIs.",
    whenToUse: "After a source or normalization stage when you need full-text PDFs.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus", max_records: 25 },
    recommendedNote: "Live mode requires params.email or RWB_UNPAYWALL_EMAIL and only emits open-access links.",
  },
  "pdf-fetcher": {
    tagline: "Cache OA PDFs and emit a PDF manifest.",
    whenToUse: "After unpaywall-source. Refuses non-OA downloads in live mode.",
    recommendedParams: { source_mode: "fixture", max_bytes: 52428800 },
  },
  "grobid-extractor": {
    tagline: "Convert cached PDFs into TEI-style structured full text.",
    whenToUse: "After pdf-fetcher. Pin the GROBID image in environment.lock for reproducibility.",
    recommendedParams: { source_mode: "fixture", grobid_image: "lfoppiano/grobid:0.8.0" },
  },
  "pdf-section-router": {
    tagline: "Route TEI into Methods, Results, and Discussion text.",
    whenToUse: "After grobid-extractor, before table extraction or methods checks.",
    recommendedParams: { source_mode: "fixture", sections: ["methods", "results", "discussion"] },
  },
  "table-extractor": {
    tagline: "Extract table-like study characteristics from full text.",
    whenToUse: "After pdf-section-router. Outputs review-marked table candidates.",
    recommendedParams: { source_mode: "fixture" },
  },
  "citation-resolver": {
    tagline: "Resolve in-text DOI citations against corpus records.",
    whenToUse: "After section routing when claim/citation traceability matters.",
    recommendedParams: { source_mode: "fixture" },
  },
  "meta-analysis-r": {
    tagline: "Compute pooled effect, heterogeneity, prediction interval, and forest spec.",
    whenToUse: "After structured effect-size extraction. Pairwise meta-analysis only.",
    recommendedParams: { source_mode: "fixture", effect_field: "effect", se_field: "se", method: "dersimonian_laird" },
  },
  "risk-of-bias": {
    tagline: "Create RoB 2 / ROBINS-I style risk-of-bias review rows.",
    whenToUse: "After extraction. Every judgement is a human-review item.",
    recommendedParams: { source_mode: "fixture", tool: "rob2" },
  },
  "grade-assessor": {
    tagline: "Draft a GRADE certainty table per outcome.",
    whenToUse: "After meta-analysis and risk-of-bias assessment.",
    recommendedParams: { source_mode: "fixture", outcome: "Primary outcome" },
  },
  "prisma-2020-checklist": {
    tagline: "Generate the PRISMA 2020 27-item reporting checklist.",
    whenToUse: "Near the end of a systematic-review pipeline.",
    recommendedParams: { source_mode: "fixture", reporting_standard: "PRISMA 2020" },
  },
  "prisma-flow-figure": {
    tagline: "Render PRISMA flow counts as a deterministic SVG figure spec.",
    whenToUse: "After prisma-flow.",
    recommendedParams: { title: "PRISMA 2020 Flow Diagram" },
  },
  "forest-plot-figure": {
    tagline: "Render meta-analysis forest plot specs as deterministic SVG.",
    whenToUse: "After meta-analysis-r.",
    recommendedParams: { title: "Forest plot" },
  },
  "manuscript-formatter": {
    tagline: "Package draft prose, figures, and tables into journal-style manuscript markdown.",
    whenToUse: "After narrative drafting and figure/table generation.",
    recommendedParams: { target_style: "prisma-systematic-review", title: "Untitled Atrium Study", authors: [], keywords: [] },
  },
  "supplementary-bundle": {
    tagline: "Build a hash-verifiable manifest of supplementary materials.",
    whenToUse: "Final reporting step before bundle export.",
    recommendedParams: { label: "Supplementary materials" },
  },
  "citation-export": {
    tagline: "Export included records as BibTeX, RIS, and CSL JSON.",
    whenToUse: "After screening/dedupe when preparing submission files.",
    recommendedParams: { source_mode: "fixture" },
  },
  "arxiv-source": {
    tagline: "Pull arXiv preprint metadata and PDF links.",
    whenToUse: "Use for physics, math, CS, and related preprint-heavy reviews.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus", query: "all:reproducibility", max_records: 25 },
  },
  "biorxiv-source": {
    tagline: "Pull bioRxiv or medRxiv preprint metadata and PDF links.",
    whenToUse: "Use for life-science and health preprint searches.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus", server: "biorxiv", from_date: "2024-01-01", to_date: "2024-12-31", max_records: 25 },
  },
  "zotero-source": {
    tagline: "Import a Zotero user/group library or collection.",
    whenToUse: "Use when you already curated papers in Zotero.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus", library_type: "users", max_records: 100 },
    recommendedNote: "For live mode, pass a project-scoped API key intentionally or set RWB_ZOTERO_API_KEY before launching Atrium.",
  },
  "zotero-export": {
    tagline: "Prepare Zotero tag/note updates for decisions and extractions.",
    whenToUse: "After screening or extraction when you want decisions reflected in Zotero.",
    recommendedParams: { source_mode: "fixture", dry_run: true },
  },
  "endnote-xml-source": {
    tagline: "Import EndNote XML into Atrium records.",
    whenToUse: "Use for EndNote libraries exported as XML.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus" },
  },
  "ris-source": {
    tagline: "Import RIS files into Atrium records.",
    whenToUse: "Use for exports from databases and reference managers.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus" },
  },
  "ris-export": {
    tagline: "Export included records as RIS.",
    whenToUse: "Use when handing citations back to reference managers.",
    recommendedParams: { source_mode: "fixture" },
  },
  "bibtex-export": {
    tagline: "Export included records as BibTeX.",
    whenToUse: "Use for LaTeX manuscripts and citation managers.",
    recommendedParams: { source_mode: "fixture" },
  },
  "rayyan-import": {
    tagline: "Import Rayyan project exports as starting records.",
    whenToUse: "Use when a screening project already exists outside Atrium.",
    recommendedParams: { source_mode: "fixture", fixture_id: "tiny-corpus" },
  },
  "covidence-export": {
    tagline: "Prepare a Covidence screening queue export package.",
    whenToUse: "Use when team screening continues in Covidence.",
    recommendedParams: { source_mode: "fixture", dry_run: true },
  },
  "prospero-source": {
    tagline: "Import a PROSPERO registration snapshot.",
    whenToUse: "Use to compare pipeline parameters against a registered protocol.",
    recommendedParams: { source_mode: "fixture", registration_id: "CRD000000000" },
  },
  "prospero-submit": {
    tagline: "Generate a manual PROSPERO submission template.",
    whenToUse: "After preregistration-generator.",
    recommendedParams: { template: "prospero" },
  },
  "osf-deposit": {
    tagline: "Create a dry-run, archived, or explicit live OSF draft.",
    whenToUse: "After bundle export when preparing preregistration/archive materials.",
    recommendedParams: { source_mode: "fixture", dry_run: true, submit_live: false, metadata: {} },
  },
  "zenodo-deposit": {
    tagline: "Create a dry-run, archived, or explicit live Zenodo draft.",
    whenToUse: "After final bundle export when you need a citable DOI.",
    recommendedParams: { source_mode: "fixture", dry_run: true, submit_live: false, metadata: {} },
  },
  "figshare-deposit": {
    tagline: "Create a dry-run, archived, or explicit live Figshare draft.",
    whenToUse: "Alternative archive target for final bundles.",
    recommendedParams: { source_mode: "fixture", dry_run: true, submit_live: false, metadata: {} },
  },
  "meta-regression-r": {
    tagline: "Run weighted fixture-safe meta-regression over extracted effects.",
    whenToUse: "After meta-analysis-r when testing moderators.",
    recommendedParams: {},
  },
  "funnel-plot-r": {
    tagline: "Generate funnel plot data and an Egger-style asymmetry signal.",
    whenToUse: "After meta-analysis-r for publication bias assessment.",
    recommendedParams: {},
  },
  "topic-model-py": {
    tagline: "Cluster records into lightweight topic buckets.",
    whenToUse: "For thematic exploration across abstracts or routed full text.",
    recommendedParams: { source_mode: "fixture" },
  },
  "concept-network-py": {
    tagline: "Build deterministic keyword/title co-occurrence networks.",
    whenToUse: "For concept maps and methods-reporting exploration.",
    recommendedParams: {},
  },
  "quality-flags": {
    tagline: "Check registration, data, and code availability signals.",
    whenToUse: "Near the end of the review to catch reporting gaps.",
    recommendedParams: {},
  },
  "cover-letter-drafter": {
    tagline: "Draft a journal cover letter for human review.",
    whenToUse: "After manuscript-formatter.",
    recommendedParams: { journal: "Target journal", provider: "anthropic", model: "claude-sonnet-4-20250514" },
  },
  "proxy-smoke": {
    tagline: "Diagnostic: smoke-test the LLM proxy with a tiny call.",
    whenToUse: "Use to verify your credentials and budget plumbing.",
    recommendedParams: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  },
};

export function moduleExtras(moduleId: string): ModuleExtras {
  return MODULE_EXTRAS[moduleId] ?? {
    tagline: "Built-in module.",
    whenToUse: "See the module's README for usage details.",
  };
}
