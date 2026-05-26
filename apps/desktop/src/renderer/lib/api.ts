// This module's side effect promotes a fallback stub onto window.rwb when the
// renderer is running outside Electron (Vite dev server, Playwright renderer
// tests). It MUST be imported before any other module that reads window.rwb at
// its own module scope. main.tsx imports it as its first dependency.

const DEV_MODULES_PREVIEW = [
  { id: "question-development",     version: "0.1.0", name: "Question Development",     stage: "question",    runtime: "python", description: "Generate candidate research questions",   inputs: [],                                                                                                            outputs: [{ name: "questions",            schema: "schemas/questions.json",            description: "", output_kind: "structured_data" }], params_schema: "schemas/params.json" },
  { id: "hypothesis-drafter",       version: "0.1.0", name: "Hypothesis Drafter",       stage: "hypothesis",  runtime: "python", description: "Draft testable hypotheses",              inputs: [{ name: "questions",   schema: "schemas/questions.json"   }],                                              outputs: [{ name: "hypotheses",           schema: "schemas/hypotheses.json",           description: "", output_kind: "structured_data" }], params_schema: "schemas/params.json" },
  { id: "preregistration-generator",version: "0.1.0", name: "Preregistration Generator",stage: "report",      runtime: "python", description: "Draft preregistration",                  inputs: [{ name: "hypotheses",  schema: "schemas/hypotheses.json"  }],                                              outputs: [{ name: "preregistration",      schema: "schemas/preregistration.json",      description: "", output_kind: "report_text" }],     params_schema: "schemas/params.json" },
  { id: "openalex-source",          version: "1.0.0", name: "OpenAlex Source",          stage: "source",      runtime: "python", description: "Fetch records from OpenAlex",            inputs: [],                                                                                                            outputs: [{ name: "records",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }], params_schema: "schemas/params.json" },
  { id: "crossref-source",          version: "1.0.0", name: "Crossref Source",          stage: "source",      runtime: "python", description: "Fetch records from Crossref",            inputs: [],                                                                                                            outputs: [{ name: "records",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "semantic-scholar-source",  version: "1.0.0", name: "Semantic Scholar Source",  stage: "source",      runtime: "python", description: "Fetch records from Semantic Scholar",    inputs: [],                                                                                                            outputs: [{ name: "records",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "fixture-source",           version: "1.0.0", name: "Fixture Source",           stage: "source",      runtime: "python", description: "Read bundled fixture corpus",            inputs: [],                                                                                                            outputs: [{ name: "records",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "record-normalizer",        version: "1.0.0", name: "Record Normalizer",        stage: "normalize",   runtime: "python", description: "Normalize titles/DOIs/authors",          inputs: [{ name: "records",     schema: "schemas/input.json"       }],                                              outputs: [{ name: "normalized",           schema: "schemas/output.json",               description: "", output_kind: "structured_data" }] },
  { id: "deterministic-dedupe",     version: "1.0.0", name: "Deterministic Dedupe",     stage: "dedupe",      runtime: "python", description: "Remove duplicates",                      inputs: [{ name: "normalized",  schema: "schemas/input.json"       }],                                              outputs: [{ name: "deduped",              schema: "schemas/output.json",               description: "", output_kind: "structured_data" }, { name: "corpus_lock", schema: "schemas/corpus_lock.json", description: "", output_kind: "structured_data" }], params_schema: "schemas/params.json" },
  { id: "llm-screener",             version: "0.1.0", name: "LLM Screener",             stage: "screen",      runtime: "python", description: "LLM-assisted inclusion / exclusion",     inputs: [{ name: "records",     schema: "schemas/records.json"     }],                                              outputs: [{ name: "screening_decisions",  schema: "schemas/screening_decisions.json",  description: "", output_kind: "structured_data" }], params_schema: "schemas/params.json", llm: { required: true } },
  { id: "llm-extractor",            version: "0.1.0", name: "LLM Extractor",            stage: "extract",     runtime: "python", description: "Extract structured fields",              inputs: [{ name: "included_records", schema: "schemas/records.json" }],                                              outputs: [{ name: "extractions",          schema: "schemas/extractions.json",          description: "", output_kind: "structured_data" }], params_schema: "schemas/params.json", llm: { required: true } },
  { id: "prisma-flow",              version: "0.1.0", name: "PRISMA Flow",              stage: "report",      runtime: "python", description: "PRISMA flow counts",                     inputs: [{ name: "screening_decisions", schema: "schemas/screening_decisions.json" }],                                outputs: [{ name: "prisma_flow",          schema: "schemas/prisma_flow.json",          description: "", output_kind: "structured_data" }] },
  { id: "bibliometrix-r",           version: "1.0.0", name: "Bibliometrix R",           stage: "analyze",     runtime: "r",      description: "Bibliometric stats",                     inputs: [{ name: "deduped",     schema: "schemas/input.json"       }, { name: "corpus_lock", schema: "schemas/corpus_lock.json" }], outputs: [{ name: "summary",              schema: "schemas/summary.json",              description: "", output_kind: "structured_data" }], params_schema: "schemas/params.json" },
  { id: "descriptive-summary-py",   version: "1.0.0", name: "Descriptive Summary (Py)", stage: "analyze",     runtime: "python", description: "Plain-Python descriptive summary",       inputs: [{ name: "normalized",  schema: "schemas/input.json"       }],                                              outputs: [{ name: "summary",              schema: "schemas/summary.json",              description: "", output_kind: "structured_data" }] },
  { id: "narrative-drafter",        version: "1.0.0", name: "Narrative Drafter",        stage: "report",      runtime: "python", description: "LLM-drafted narrative",                  inputs: [{ name: "summary",     schema: "schemas/summary_input.json" }],                                            outputs: [{ name: "draft",                schema: "schemas/draft.json",                description: "", output_kind: "report_text" }], params_schema: "schemas/params.json", llm: { required: true } },
];

const DEV_SCHEMA_PREVIEW: Record<string, Record<string, unknown>> = {
  "question-development": {
    type: "object",
    required: ["topic"],
    properties: {
      topic: { type: "string", title: "Research topic", description: "One sentence describing the area you want to investigate.", examples: ["The impact of large language models on systematic review screening accuracy"], minLength: 10 },
      max_questions: { type: "integer", title: "Number of candidate questions", description: "3–7 is a good range.", minimum: 1, maximum: 20, default: 5 },
      provider: { type: "string", title: "LLM provider", enum: ["anthropic", "openai", "ollama"], default: "anthropic" },
      model: { type: "string", title: "Model", examples: ["claude-sonnet-4-20250514"], default: "claude-sonnet-4-20250514" },
    },
    additionalProperties: false,
  },
  "hypothesis-drafter": {
    type: "object",
    properties: {
      max_hypotheses: { type: "integer", title: "Number of hypotheses to draft", minimum: 1, maximum: 20, default: 5 },
      provider: { type: "string", title: "LLM provider", enum: ["anthropic", "openai", "ollama"], default: "anthropic" },
      model: { type: "string", title: "Model", examples: ["claude-sonnet-4-20250514"], default: "claude-sonnet-4-20250514" },
    },
    additionalProperties: false,
  },
};

if (!window.rwb) {
  (window as unknown as { rwb: unknown }).rwb = {
    listModules: async () => DEV_MODULES_PREVIEW,
    listReviewItems: async () => [],
    resolveReviewItem: async () => ({}),
    setCredential: async () => undefined,
    testCredential: async () => ({ ok: false, detail: "Preview only" }),
    getCredentialStatus: async () => ({ anthropic: false, openai: false, ollama: false }),
    loadModuleSchema: async (moduleId: string) => DEV_SCHEMA_PREVIEW[moduleId] ?? { type: "object", properties: {} },
    openProject: async () => null,
    validateProtocol: async () => ({}),
    freezeProtocol: async () => ({}),
    writeProtocol: async () => ({ path: "", bytes: 0 }),
    run: async () => ({ completed_status: "preview" }),
    generateMethods: async () => "",
    lockEnvironment: async () => ({}),
    exportBundle: async () => null,
    replayBundle: async () => ({}),
    importBundle: async () => null,
    importBundleFromPath: async () => null,
    verifyBundle: async () => ({ ok: false, checked: [], trustReport: null }),
    inspectBundleTrust: async () => ({ allTrusted: false, modules: [], hashMismatches: [] }),
    diffArtifacts: async () => ({ ok: false, rowsA: 0, rowsB: 0 }),
    exportReviewNotes: async () => "",
    onRunProgress: () => () => undefined,
  };
}

export const api = window.rwb!;
