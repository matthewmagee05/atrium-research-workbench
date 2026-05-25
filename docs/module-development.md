# Module Development

Modules are directories with a `manifest.yaml`, JSON schemas, documentation, and a single entry point. The runner invokes modules as subprocesses with explicit input and output paths passed via environment variables.

## Directory layout

```
modules/<module-id>/
  manifest.yaml          # Module contract
  entry.py | entry.R | entry.js
  schemas/
    params.json          # JSON Schema for the params object
    <input>.json         # Schema per declared input
    <output>.json        # Schema per declared output
  prompts/               # Optional, for LLM-driven modules
    <prompt-id>.md
  fixtures/              # Optional, fixture data per fixture_id
  README.md              # Human-readable description
```

## Manifest fields

A `manifest.yaml` declares the module contract:

```yaml
id: my-module
version: 1.0.0
name: My Module
stage: source | normalize | dedupe | screen | extract | analyze | report | question | hypothesis
runtime: python | r | node
entry: entry.py
runtime_version: ">=3.11"
inputs:
  - {name: records, schema: schemas/records.json, optional: false}
outputs:
  - {name: normalized, schema: schemas/normalized.json, description: "...", output_kind: structured_data}
params_schema: schemas/params.json
llm:
  required: false
  budget: {max_tokens_per_run: 0, max_calls_per_run: 0, max_cost_usd_per_run: 0}
  prompts: []
determinism:
  level: deterministic | replayable | stochastic | volatile
  guarantee: "Free-text description of guarantee"
  variance_sources: [model_version, sampling]
  reproduction_metrics: [schema_validity, row_count_agreement]
human_in_the_loop:
  enabled: false
  triggers: []
side_effects:
  network: false
  network_domains: []
  filesystem_write: true
  external_processes: false
author: Your Name
license: MIT
documentation_url: "https://..."
```

## Output kinds

| Kind | Hashing rule |
| --- | --- |
| `structured_data` | Full canonical-JSON content hash |
| `figure_spec` | Full canonical-JSON content hash |
| `rendered_figure` | Envelope hash uses the upstream `figure_spec` hash (informational hashing) |
| `report_text` | Full canonical-JSON content hash |

## Determinism levels

- **deterministic** — Same inputs always yield the exact same bytes. Cacheable across runs.
- **replayable** — May involve LLMs but is intended to be reproducible from `run.manifest.json` via stored prompts/responses.
- **stochastic** — Bounded variance. Cache is bypassed; `variance-audit` mode runs the node N times to measure spread.
- **volatile** — Reads external state that may change (network APIs, real-time data). Snapshots are archived for replay.

## Runtime contract

The runner sets these environment variables when invoking the module subprocess:

| Variable | Purpose |
| --- | --- |
| `RWB_RUN_ID` | UUID of the current run |
| `RWB_NODE_ID` | UUID of this protocol node |
| `RWB_MODE` | One of `execute`, `deterministic-rerun`, `full-rerun`, `variance-audit` |
| `RWB_PARAMS` | Path to a JSON file with the validated params |
| `RWB_INPUT_<port>` | Path to a JSON file containing the input for each declared input |
| `RWB_OUTPUT_<port>` | Path the module must write to for each declared output |
| `RWB_FIXTURES_DIR` | Absolute path to the workspace `fixtures/` directory |
| `RWB_PROXY_SOCKET` | HTTP base URL of the proxy (only for modules with `llm.required: true`) |
| `RWB_RAW_RESPONSES_DIR` | Scratch dir where modules can archive raw external responses for provenance |

The module exits 0 on success and a non-zero status otherwise. Stderr is captured and written to the audit log (with secret scrubbing).

## Rules

- Read only declared inputs and params.
- Write only declared outputs (the runner will throw if an output file is missing).
- Never call LLM providers directly. Use the proxy via the SDK.
- Never make network calls unless `side_effects.network` is `true` and `network_domains` lists the host.
- Emit canonical JSON: sorted keys, UTF-8, newline-terminated, floats rounded half-even to 10 significant digits.
- All output JSON is validated against its declared schema before storage. Validation failures fail the run.

## Proxy operations

Available through HTTP on `RWB_PROXY_SOCKET`:

| Endpoint | Purpose |
| --- | --- |
| `POST /llm/complete` | Run an LLM completion against the configured provider |
| `POST /journal/note` | Append a structured entry to the run journal |
| `POST /review/request` | Enqueue an item for human review |
| `POST /progress/update` | Stream progress info to the desktop runner |
| `GET /artifact/metadata?artifact_id=...` | Read metadata for an artifact this run produced |

The proxy enforces the budget declared in the manifest and protocol. Calls that would exceed the budget throw before reaching the provider.

## SDKs

Three module SDKs are provided:

- **Python**: `packages/module-sdk-py/rwb_sdk/` — `llm_complete()`, `journal_note()`, `review_request()`, `progress_update()`, `write_json()`, `read_json()`, `round_half_even()`.
- **Node**: `packages/module-sdk-node/src/` — async-equivalent helpers.
- **R**: `packages/module-sdk-r/rwb_sdk.R` — sourceable file with `rwb_*` functions using `httr2` or falling back to `curl`.

All three SDKs implement matching round-half-even float formatting so cross-language output is byte-identical given the same logical values.

## Fixture mode

Modules that talk to external services should support three modes in their params:

- `fixture` — read from `RWB_FIXTURES_DIR/<fixture_id>/...`
- `snapshot` — read from a path on disk pointed to by `snapshot_path`
- `live_archived` — call the external service AND archive the raw response under `RWB_RAW_RESPONSES_DIR/`

`fixture` mode is what golden-pipeline tests use. `live_archived` is the only mode that should ever make network calls.

## External API provenance

When a module makes external API calls in `live_archived` mode, write each raw response as a JSON file under `RWB_RAW_RESPONSES_DIR/` with this shape:

```json
{
  "url": "https://api.example.com/...",
  "method": "GET",
  "status": 200,
  "ts": "2026-05-25T12:34:56Z",
  "response": { /* the raw provider payload */ }
}
```

The runner picks these up after the module exits and populates `external_api_calls` on the resulting artifact metadata.

## Trust model

Tier 0 / Tier 1A modules are built-in and trusted by default. Third-party modules go through a verified-trust review when their hashes don't match a known-good registry. See [trust-and-safety.md](trust-and-safety.md).
