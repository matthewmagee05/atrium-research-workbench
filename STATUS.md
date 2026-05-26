# STATUS

## Tier 0

Built:

- npm workspace scaffold with `apps/cli` and `packages/core`.
- SQLite-indexed artifact store with canonical JSON hashing.
- Frozen protocol validation and hashing.
- Python subprocess runner for trusted built-in deterministic modules.
- Audit log and `run.manifest.json`.
- Tier 0 modules: `fixture-source`, `record-normalizer`, `descriptive-summary-py`, and a bundle-stage manifest.
- Plain-directory bundle export, import, replay, and deterministic verify.
- Tier 0 fixture corpus and golden protocol.

Skipped by Tier 0 scope:

- R and `bibliometrix-r`.
- LLM proxy, model registry, credentials, and real budget enforcement.
- Electron/React UI.
- METHODS.md, `environment.lock`, and `corpus.lock.json`.
- Human-in-the-loop review.

Open-question decisions:

- Bundle format: plain directory for inspectability and simple replay.
- Fixture corpus: hand-curated fictional OpenAlex-shaped records to avoid licensing and network dependencies.
- Canonicalization library: local canonical JSON helper with sorted keys, newline-terminated UTF-8, and round-half-even float normalization covered by cross-language tests.
- CLI/core sharing: monorepo with shared `@research-workbench/core`.
- Network guard: socket-level guard in Vitest replay test.

## Tier 1A

Built:

- R subprocess support in the shared runner.
- `openalex-source` with `fixture`, `snapshot`, and `live_archived` modes.
- `deterministic-dedupe` with `corpus.lock.json` output.
- `bibliometrix-r` module boundary with deterministic R aggregations, structured tables, figure specs, and informational SVG payloads.
- `narrative-drafter` manifest and claim-grounding schema boundary.
- `artifact diff`, `journal add`, `methods generate`, and `env lock` CLI commands.
- Automatic `METHODS.md` and `environment.lock` generation on bundle export.
- Tier 1A golden fixture pipeline and replay/verify test.
- Manifest, params, input, and output schema validation before/after module execution.
- Bundle export secret scanning with regex and entropy-adjacent checks.
- Raw response collation from module scratch space into `.rwb/raw_responses`, with artifact metadata provenance for JSON, XML, and other archived response files.
- OpenAI Responses, Anthropic Messages, and Ollama chat transports through the runner proxy.
- Per-node LLM budget enforcement across repeated proxy calls, including call count, token count, and provider/model cost estimates.
- Explicit `RWB_*` external integration credential convention for non-LLM source APIs without exposing generic secret environment variables to modules.

Tier 1A caveats:

- The `bibliometrix-r` module has deterministic built-in summaries and can optionally call CRAN `bibliometrix::biblioAnalysis()` when the package is installed; richer bibliometrix visualizations still belong in future module iterations.
- Runner proxy process is implemented; modules receive `RWB_PROXY_SOCKET` and can call `llm.complete`, `journal.note`, `review.request`, `progress.update`, and `artifact.read_metadata`.
- Determinism cache keys are stored per output port; ordinary execute runs reuse deterministic/replayable/volatile artifacts, while deterministic/full reruns bypass cache.
- `narrative-drafter` can execute through the runner proxy when provider/model params are supplied, with offline fallback for credential-free fixture runs.
- Run manifests record LLM calls and token counts reported by the proxy process.
- Claim-grounding validator checks that grounded claims reference existing artifacts.

## Tier 1B

Built:

- Electron package scaffold with secure preload bridge.
- React workbench shell with module library, canvas, inspector, reproduction mode selector, run/freeze/export controls, and budget status panel.
- Shared-core IPC handlers for module listing, project open/init, protocol validate/freeze, run, methods/env generation, bundle export, and replay.
- Credential wizard surface for Anthropic, Ollama, and OpenAI backed by the core keychain service.
- Browser-preview Playwright tests for the renderer.
- Review queue read surface in the desktop inspector.
- Desktop review items can be accepted/rejected from the inspector.
- LLM provider/model controls are now first-class inspector controls with provider-specific defaults and custom model entry.
- The top bar shows live status, and the Next Steps drawer becomes a compact run-results drawer with run id, cost, token, and output artifact summaries.
- Tier A modules are exposed in the desktop module catalog with recommended parameters and when-to-use guidance.
- Reviewer mode: welcome-screen bundle drop-zone import, read-only canvas/library/inspector controls, reviewer-mode badge, one-pane trust/verify actions, reviewer annotations, and `review.md` export.
- Inspector review queue panel with reviewer identity, ORCID attribution, refresh, and accept/reject/defer actions.
- Publication modules now produce journal-style manuscript scaffolds, title-page metadata, editorial submission checklists, hash-verifiable supplement manifests, and BibTeX/RIS/CSL citation exports.
- `bibliometrix-r` now emits deterministic citation percentiles, most-cited records, author/source impact with h-index, keyword co-occurrence, Bradford-style zones, and corresponding figure specs.
- Electron E2E coverage now includes a real renderer template flow through editable provider/model controls and the desktop review queue panel, plus ORCID review IPC coverage when the native SQLite module matches Electron's architecture.

Tier 1B caveats:

- DB-backed Electron IPC tests are skipped in mixed-architecture local environments where `better-sqlite3` is built for a different architecture than the Electron binary; they run when the native module and Electron architecture match.

## Tier 2+

Built:

- Contract manifests, schemas, reviewed prompt templates, and safe fixture/live-archived implementations for `crossref-source`, `semantic-scholar-source`, `llm-screener`, `llm-extractor`, `prisma-flow`, `question-development`, `hypothesis-drafter`, and `preregistration-generator`.
- Tier A full-text and publication path modules: `unpaywall-source`, `pdf-fetcher`, `grobid-extractor`, `pdf-section-router`, `table-extractor`, `citation-resolver`, `meta-analysis-r`, `risk-of-bias`, `grade-assessor`, `prisma-2020-checklist`, `manuscript-formatter`, `prisma-flow-figure`, `forest-plot-figure`, `supplementary-bundle`, and `citation-export`.
- Tier B/Tier C module contracts and fixture-safe implementations: `arxiv-source`, `biorxiv-source`, `zotero-source`, `zotero-export`, `endnote-xml-source`, `ris-source`, `ris-export`, `bibtex-export`, `rayyan-import`, `covidence-export`, `prospero-source`, `prospero-submit`, `osf-deposit`, `zenodo-deposit`, `figshare-deposit`, `meta-regression-r`, `funnel-plot-r`, `topic-model-py`, `concept-network-py`, `quality-flags`, and `cover-letter-drafter`.
- Fixture-mode contract tests for the full-text path and RoB/GRADE outputs.
- Registry/domain tests for every new integration module, including corrected OSF, Zenodo, Figshare, arXiv, bioRxiv, and Zotero network-domain declarations.
- Production-hardening tests for non-JSON raw-response provenance and cumulative LLM proxy budget enforcement.
- Release preflight check that fails production macOS/Windows packaging when signing secrets are not configured.
- Collaboration sync primitives: deterministic review queue snapshot export/import, timestamp conflict resolution by review id, and ORCID preservation on reviewer decisions.
- OSF, Zenodo, and Figshare deposit modules now distinguish dry-run, archived-not-submitted, and explicit live draft creation; live paths require `RWB_OSF_TOKEN`, `RWB_ZENODO_TOKEN`, or `RWB_FIGSHARE_TOKEN` and archive request/response provenance.

Deferred:

- Real-time multi-device sync, true Windows AppContainer hardening, production code-signing certificate provisioning in repository secrets, and vendor certification/account-level acceptance testing for live repository/platform integrations.

## Verification

Passing locally:

- `npm run typecheck`
- `npm test`
- `npm run test:desktop`
- `npm audit --omit=dev --audit-level=high`
