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
- Canonicalization library: local canonical JSON helper for Tier 0; exact cross-language round-half-even float formatting remains marked with `TODO(PRD-ambiguous)`.
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
- Raw response collation from module scratch space into `.rwb/raw_responses`.

Tier 1A caveats:

- The `bibliometrix-r` module currently implements deterministic R bibliometric summaries under the required module contract; deep CRAN `bibliometrix` analyses are not yet wired.
- LLM proxy plumbing has budget/model/credential boundaries, but provider transports and the subprocess proxy socket are not production-complete.
- OpenAI Responses, Anthropic Messages, and Ollama chat transports are implemented and covered by mocked unit tests.
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
- Browser-preview Playwright test for the renderer.
- Review queue read surface in the desktop inspector.
- Desktop review items can be accepted/rejected from the inspector.

Tier 1B caveats:

- The canvas visualizes available modules; drag-to-compose and schema-aware edge creation are not complete.
- Full Electron automation is not yet added; current Playwright coverage tests the renderer preview.

## Tier 2+

Built:

- Contract manifests, prompts, schemas, and safe execution stubs for `crossref-source`, `semantic-scholar-source`, `llm-screener`, `llm-extractor`, `prisma-flow`, `question-development`, `hypothesis-drafter`, and `preregistration-generator`.

Deferred:

- Rich human review workflows beyond accept/reject, Windows support, OS sandboxing, third-party module trust prompts, and full preregistration workflows.

## Verification

Passing locally:

- `npm run typecheck`
- `npm test`
- `npm run test:desktop`
- `npm audit --omit=dev --audit-level=high`
