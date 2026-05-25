# Determinism Levels

Every module declares one of four determinism levels in its manifest. The level controls cache behavior, replay semantics, and variance auditing.

## Levels

### `deterministic`

Same inputs + locked environment + same params must produce byte-identical canonical output.

- Cacheable across runs via the artifact cache.
- `deterministic-rerun` mode reuses cached outputs.
- A hash mismatch on replay means the module or its environment drifted — this is an error.
- Example modules: `record-normalizer`, `deterministic-dedupe`, `fixture-source`.

### `replayable`

May involve LLMs or other non-deterministic backends, but is expected to be reproducible from the run manifest: prompts, model IDs, and seeds are recorded so a future operator can in principle replay the exact same request.

- Cacheable when the cache key matches (params + prompts + resolved model IDs + inputs).
- `deterministic-rerun` reuses cached outputs.
- `full-rerun` re-executes and may produce different bytes; the runner records the new artifact alongside the old.
- Example modules: `llm-screener`, `llm-extractor`, `narrative-drafter`, `question-development`, `hypothesis-drafter`, `preregistration-generator`.

### `stochastic`

Bounded variance is expected and acceptable. The cache is never reused.

- `execute` mode runs every time.
- `variance-audit` mode runs the node N times (default 3) and reports per-port agreement metrics: decision agreement, field agreement, distribution distance (Hellinger), schema validity, row count agreement.
- Use this when an LLM is invoked without seeds, or when results depend on sampling.

### `volatile`

Reads external state that may have changed since the prior run.

- Cache is never reused.
- The module must archive its raw upstream responses under `RWB_RAW_RESPONSES_DIR/` so the bundle can replay the exact upstream state.
- After replay, the archived snapshot becomes the canonical input.
- Example modules: `openalex-source`, `crossref-source`, `semantic-scholar-source` (in `live_archived` mode).

## Variance sources

Modules declare honest variance sources in `determinism.variance_sources`:

| Source | Meaning |
| --- | --- |
| `model_version` | Output depends on the resolved model ID (provider may update model). |
| `sampling` | Output depends on LLM sampling (temperature, top-p, seed). |
| `network` | Output depends on external service state. |
| `time` | Output uses wall-clock time. |
| `hardware` | Output depends on CPU/GPU details. |

The variance-audit mode summarizes the actual variance observed across iterations, which can be compared to the declared variance sources.

## Reproduction metrics

Modules also declare which metrics best capture their reproducibility in `determinism.reproduction_metrics`:

- `schema_validity` — every iteration produces output that validates against the declared schema.
- `row_count_agreement` — for tabular outputs, the row count is consistent.
- `decision_agreement_rate` — for decision-output modules (screener, extractor), fraction of records with the same decision across iterations.
- `field_agreement_rate` — for field-extracting modules, fraction of fields with identical values.
- `distribution_distance` — Hellinger distance between categorical distributions across iterations.

The runner enforces honesty: modules must declare every variance source they actually exhibit.

## Replay rules

The runner refuses to invoke the module subprocess during replay verification: replay reads artifacts from the bundle's `artifacts/` directory and recomputes hashes. If the recomputed hash matches the manifest, the artifact is verified.

For deterministic modules, this is enough to prove reproduction. For replayable / stochastic modules, replay tells you the prior run's artifacts are intact, not that the module would produce them again.
