import {
  Database, Layers, Filter, ListChecks, FileSearch, BarChart3,
  HelpCircle, Lightbulb, FileSignature, Package,
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
      inclusion_criteria: ["topic relevant"],
      exclusion_criteria: ["off topic", "not English"],
      confidence_threshold: 0.7,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    },
    recommendedNote: "Set criteria as concise phrases the LLM can match against title + abstract.",
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
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      style: "academic",
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

