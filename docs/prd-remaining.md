# PRD: Atrium remaining features

**Status**: Draft
**Owner**: Matthew Magee
**Last revised**: 2026-05-25

## 1. Executive summary

Atrium today can compose a frozen-DAG research pipeline, run bibliographic source modules, normalize and dedupe, LLM-screen for inclusion, count statistics with bibliometrix, and draft a narrative report. The reproducibility infrastructure (canonical hashing, bundle export/verify, variance audit) is solid.

The product **stops too early**. A real research workflow continues past "narrative report":

1. **Data collection beyond bibliographic metadata** — full-text retrieval, supplementary materials, dataset linkages, structured field extraction from PDFs.
2. **Substantive analysis** — meta-analysis statistics, risk-of-bias scoring, thematic / topic analysis, not just count aggregation.
3. **Integrations with research tools** — reference managers, systematic-review platforms, preregistration registries, data repositories.
4. **Publication-ready outputs** — PRISMA 2020 checklist, GRADE evidence tables, formatted manuscript, archiveable supplements.
5. **Downstream archiving** — Zenodo / OSF deposit, citation export, reviewer response packets.

This PRD scopes those gaps into discrete, deliverable features.

## 2. What's complete today

| Capability | Status |
| --- | --- |
| Frozen-DAG protocol + module subprocess runner | Done |
| Content-addressed artifact store with canonical hashing across JS/Python/R | Done |
| 4 run modes (execute, deterministic-rerun, full-rerun, variance-audit) | Done |
| LLM proxy with per-node budget enforcement | Done |
| Bundle export / import / verify / replay with trust inspection | Done |
| Drag-to-compose desktop UI with port-aware ReactFlow canvas | Done |
| 17 built-in modules: source × 4, normalize, dedupe, screen, prisma, bibliometric, narrative, question, hypothesis, preregistration | Done |
| Settings dialog with credential test-connection (Anthropic / OpenAI / Ollama) | Done |
| Live budget streaming via IPC, Next Steps panel | Done |
| CI matrix on Ubuntu / macOS / Windows with cross-OS golden hashes | Done |
| electron-builder + release workflow scaffold | Done |
| Opt-in OS-level sandboxing (bwrap / sandbox-exec / Windows PowerShell) | Done |
| 134 tests across vitest, Playwright renderer, Playwright Electron, visual smoke | Done |

## 3. Personas

| Persona | What they want |
| --- | --- |
| **Solo researcher** | Run question → screening → meta-analysis → manuscript without leaving the app. Export artifacts a reviewer can verify. |
| **Lab PI** | Audit which student ran what, replay decisions, freeze a study before grant submission, reproduce someone else's bundle. |
| **Reviewer / replicator** | Receive a bundle, verify hashes on an air-gapped machine, dig into individual artifacts and human decisions. |
| **Tool integrator** | Add a new source or analyzer module via a documented SDK, ship it as a verifiable module package. |

The current product serves Reviewer and (partially) Tool integrator well. Solo researcher and Lab PI need the gaps closed.

## 4. Feature areas

### F1. Full-text & PDF processing

**Gap**: Today sources stop at title + abstract + metadata. Extraction modules can't read full text.

**Modules to add**:

| Module | Purpose | Determinism |
| --- | --- | --- |
| `unpaywall-source` | Look up OA full-text URLs by DOI via Unpaywall API | volatile |
| `arxiv-source` | Pull arXiv preprints with full PDFs | volatile |
| `biorxiv-source` | Pull bioRxiv / medRxiv | volatile |
| `pdf-fetcher` | Download PDFs from a list of OA URLs to local cache | volatile |
| `grobid-extractor` | Run GROBID locally to convert PDFs → TEI-XML (sections, references, figures) | deterministic given fixed GROBID model version |
| `pdf-section-router` | Extract Methods / Results / Discussion sections from GROBID TEI | deterministic |
| `table-extractor` | Pull structured tables from PDFs (Camelot or LLM-assisted) | replayable |
| `citation-resolver` | Resolve in-text citations against the corpus DOIs | deterministic |

**Why this matters**: extraction depth is the single biggest limiter today. Methods-level features (sample size, study design, intervention details) live in Tables 1–3, not the abstract.

**Implementation notes**:
- GROBID runs as a Docker sidecar or local JAR. Module ships a docker-compose snippet.
- Cache PDFs under `RWB_PDF_CACHE_DIR/<doi-hash>.pdf` with size cap (e.g. 5GB default).
- License gating: respect `unpaywall.is_oa: true` only; refuse to download paywalled content.

### F2. Substantive analysis (beyond aggregation)

**Gap**: `bibliometrix-r` counts; nothing performs the analysis a researcher actually publishes.

**Modules to add**:

| Module | Purpose | Determinism |
| --- | --- | --- |
| `meta-analysis-r` | Calls `metafor` for forest plot, heterogeneity (Q, I²), pooled effect, prediction interval | deterministic |
| `meta-regression-r` | Subgroup + meta-regression with moderators from extracted fields | deterministic |
| `funnel-plot-r` | Publication-bias funnel + Egger's test + trim-and-fill | deterministic |
| `risk-of-bias` | Cochrane RoB 2 / ROBINS-I scoring as a structured review (human-in-the-loop) | replayable |
| `grade-assessor` | GRADE certainty-of-evidence scoring per outcome | replayable |
| `topic-model-py` | BERTopic over abstracts + extracted sections | stochastic |
| `concept-network-py` | Co-occurrence networks for keywords / MeSH / entities | deterministic |
| `prisma-2020-checklist` | Generate the 27-item PRISMA 2020 checklist from manifest + extractions | deterministic |
| `quality-flags` | Run reproducibility / methods-reporting checks (registered? data available? code available?) | deterministic |

**Why this matters**: a systematic review without RoB or GRADE is not publishable. A meta-analysis without metafor is not a meta-analysis.

### F3. Reference-manager integrations

**Gap**: researchers live in Zotero / Mendeley / EndNote. Atrium currently has no import or export.

**Features**:

- **`zotero-source`** — pull a Zotero library (via web API or local SQLite) as a corpus. Inputs: API key / collection ID. Use case: "I've already curated 200 papers, screen these."
- **`zotero-export`** — write screening decisions and extractions back as Zotero tags + notes.
- **`endnote-xml-source`** — import EndNote XML.
- **`ris-source` / `ris-export`** — RIS format read/write.
- **`bibtex-export`** — `.bib` export of included papers + extracted citation metadata.

### F4. Systematic-review platform integrations

**Gap**: real teams use Covidence, DistillerSR, Rayyan for screening collaboration.

**Features**:

- **`rayyan-import`** — import a Rayyan project state (screening decisions + tags) as a starting corpus.
- **`covidence-export`** — push a screening queue to Covidence for team review; pull decisions back.
- **`prospero-source`** — fetch a registered PROSPERO record by ID; cross-check protocol params against registration.

These are explicit API integrations. Each needs: API key handling in the existing keychain, a fixture mode for testing, and a `live_archived` mode that snapshots responses.

### F5. Preregistration & archiving integrations

**Gap**: `preregistration-generator` writes a Markdown draft but nothing files it.

**Features**:

- **`osf-deposit`** — create a preregistration on osf.io, attach the markdown draft + protocol bundle. Returns the OSF GUID for the run manifest.
- **`zenodo-deposit`** — archive the final bundle as a Zenodo record with proper metadata (authors, ORCID, license, related identifiers). Returns DOI for citation.
- **`figshare-deposit`** — alternative to Zenodo.
- **`prospero-submit`** — generate a PROSPERO submission template (manual submission, but pre-filled).

**Why this matters**: a study without a public preregistration or archived bundle is not reproducibly reviewable. These integrations close that loop.

### F6. Publication-ready outputs

**Gap**: `narrative-drafter` produces freeform markdown. Submission needs more.

**Modules to add**:

| Module | Output |
| --- | --- |
| `manuscript-formatter` | LaTeX or Word doc from narrative + figures + tables, with target-journal style |
| `prisma-flow-figure` | Render the PRISMA 2020 flow diagram (SVG + PDF) |
| `forest-plot-figure` | Standard forest plot from meta-analysis-r output |
| `supplementary-bundle` | Build supplementary materials zip (extraction tables, screening log, code, data) |
| `citation-export` | `.bib` + `.ris` of all cited references |
| `cover-letter-drafter` | LLM-drafted cover letter referencing the study's findings |

### F7. Quality & methods reporting

**Gap**: PRISMA 2020 has 27 items. Atrium doesn't check whether each one is satisfied.

**Features**:

- **PRISMA 2020 checklist** automatic generation from run manifest + extractions, flagging any items missing.
- **Reporting standards profile** — let the protocol declare adherence to PRISMA / CONSORT / STROBE / ARRIVE and run the appropriate checklist module.
- **Code & data availability** — verify that referenced code repos exist (GitHub API), referenced datasets resolve (DataCite), and link statuses are healthy.

### F8. Reviewer experience

**Gap**: bundle verification is CLI-only. Reviewers want a one-click experience.

**Features**:

- **Drop-zone bundle import**: drag a bundle directory onto the welcome screen and Atrium opens, inspects trust, and offers to verify.
- **One-pane verify report**: per-node table with hash match status, links to artifacts, diff against expected.
- **Replay annotations**: reviewer can attach notes to specific artifacts; notes export back as a `review.md` for the original author.
- **Bundle-only mode**: launch the desktop app in a read-only mode where editing is disabled and only verify / inspect / annotate are available.

### F9. Collaboration & multi-user

**Gap**: Atrium is local-only. Real teams need shared screening queues, shared decisions, audit trails.

**Features (Tier 5, not soon)**:

- **Sync layer**: project directory syncs through Git LFS or a custom store; conflicts on `review_queue.json` resolve by ID + timestamp.
- **Author attribution**: every artifact's `human_decisions` records the reviewer by ORCID.
- **Shared screening UI**: assign records to reviewers, capture two-reviewer concordance, surface disagreements for adjudication.

This is genuinely a different product surface and should be tackled only after F1-F6 land.

### F10. Polish gaps from prior sessions

These are real gaps the audit caught:

- **Cache hit/miss test coverage**: add explicit tests for cache invalidation on prompt change and resolved-model-id change.
- **`external_api_calls` for crossref + semantic-scholar**: OpenAlex archives raw responses; the other two should too.
- **Windows AppContainer**: current Windows sandbox is PowerShell + low-integrity; a true AppContainer with restricted token would be stronger.
- **Code-signing certificates**: `release.yml` is wired but signing secrets aren't configured. Production releases need real certs.
- **Workflow modules (`question-development`, `hypothesis-drafter`, `preregistration-generator`)** have working LLM proxy calls but thin prompt templates. Real Tier 4 use needs better prompts + iterative refinement.

## 5. Prioritization

Three tiers, in delivery order. Each tier is shippable on its own.

### Tier A — Make the full project actually full (4–6 weeks)

Goal: someone can take a research question to a publishable manuscript without leaving Atrium.

| Feature area | Why first |
| --- | --- |
| F1 PDF processing (`unpaywall-source`, `pdf-fetcher`, `grobid-extractor`, `pdf-section-router`) | Unblocks all downstream extraction-aware modules. |
| F2 substantive analysis (`meta-analysis-r`, `risk-of-bias`, `grade-assessor`, `prisma-2020-checklist`) | This is what makes a systematic review actually a systematic review. |
| F6 publication outputs (`manuscript-formatter`, `prisma-flow-figure`, `forest-plot-figure`, `supplementary-bundle`) | Closes the loop to a submittable artifact. |
| F10 polish (thicker prompts, missing tests) | These are small but high-quality-of-life. |

### Tier B — Integrations (3–4 weeks)

Goal: Atrium plays nicely with the tools researchers already use.

| Feature area | Why second |
| --- | --- |
| F3 reference managers (Zotero in particular) | Lowest-friction onboarding path: "I have a Zotero library, screen it." |
| F4 SR platforms (Rayyan import, PROSPERO source) | These have public APIs, contained scope. Covidence is harder and can wait. |
| F5 archiving (Zenodo deposit, OSF deposit) | Closes reproducibility loop; gets users DOIs they can cite. |

### Tier C — Reviewer + collaboration (open-ended)

Goal: reviewers and lab teams can use Atrium without first being researchers themselves.

| Feature area | Why last |
| --- | --- |
| F8 reviewer experience | Important but requires Tier A to produce reviewable bundles. |
| F9 collaboration | Substantially different product surface. Don't ship without UX research. |

## 6. Cross-cutting requirements

Apply to every new module:

1. **Three modes** — fixture, snapshot, live_archived. Default to fixture in tests.
2. **Schema-validated I/O** — every output gets a JSON Schema in `schemas/`.
3. **External API provenance** — all `live_archived` HTTP calls archive raw responses under `RWB_RAW_RESPONSES_DIR/`; runner populates `external_api_calls` on artifact meta.
4. **Manifest honesty** — declare `network_domains` for every domain you hit; declare `human_in_the_loop.enabled` if your output needs review.
5. **Recommended params** — add an entry to `apps/desktop/src/renderer/store/module-catalog.ts` with tagline, when-to-use, recommended-defaults.
6. **Docs** — README per module describing inputs / outputs / failure modes / cost.
7. **Tests** — at minimum a fixture-mode contract test plus inclusion in any golden pipeline that uses the module.

## 7. Open questions

- **"Vetratek"** — which platform exactly? Several candidates exist; I'd like a concrete URL or vendor name before designing the integration.
- **Full-text licensing** — should Atrium ever attempt to download paywalled content? Current proposal: no. OA only, fail loud on paywalls.
- **Local GROBID vs SaaS** — running GROBID locally needs a Docker dependency. Acceptable, or do we use a hosted endpoint?
- **Meta-analysis types** — pairwise only (Tier A), or network meta-analysis too (Tier B)? Network MA is significantly more complex.
- **LLM-vs-rule mix in `risk-of-bias`** — pure structured form, LLM-assisted draft + human, or both?
- **Authentication model for OSF / Zenodo** — OAuth in-app, or "paste your personal token" like LLM credentials?
- **Multi-language support** — should source modules return abstracts in original language with translation as an optional downstream module?

## 8. Out of scope

Explicitly **not** in this PRD:

- Becoming an LLM training-data pipeline. Atrium is for research workflows, not data prep.
- Real-time collaboration with multiple cursors. Out-of-band sync only.
- Building our own preprint server.
- Becoming a journal. Submission integrations only; not editorial.

## 9. Success metrics

After Tier A:

- A user can produce a verifiable bundle that includes: protocol, included papers with full-text-derived extractions, RoB scores, GRADE table, forest plot, PRISMA flow figure, PRISMA 2020 checklist, manuscript draft, supplementary zip.
- A reviewer can verify that bundle on an air-gapped machine and get a per-artifact hash match report.

After Tier B:

- A user can drop a Zotero library URL and Atrium creates a corpus, screens, extracts, and deposits the final bundle to Zenodo with a citable DOI.

After Tier C:

- Two reviewers can independently screen the same corpus and Atrium surfaces their disagreements for adjudication, recording who decided what when.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| GROBID model drift makes "deterministic" extraction non-reproducible. | Pin the GROBID Docker image hash in `environment.lock.json`; treat it like any other runtime version. |
| metafor / bibliometrix CRAN updates change numeric output. | Use `renv` lock files per-module; record exact package versions in run manifest. |
| OSF / Zenodo API tokens stored in keychain expose research data if leaked. | Scope tokens to read-only / single-collection where the API supports it. |
| PDF fetcher hits paywall, scrapes content, lands user in legal trouble. | Hard refuse on `unpaywall.is_oa: false`. Add an explicit user-approval dialog before any non-OA download. |
| Atrium becomes too prescriptive about workflow shape, alienates non-systematic-review use cases. | Keep templates as starting points, not requirements. Every node remains removable. |

---

**Next concrete step**: Confirm the "Vetratek" reference and pick the top 3 Tier A modules to start (proposed: `unpaywall-source` + `pdf-fetcher` + `grobid-extractor`, since they unblock everything else).
