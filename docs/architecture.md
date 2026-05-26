# Architecture

Atrium is a desktop application for reproducible AI-assisted research pipelines. The system is built on a strict separation between **the orchestrator** (which is deterministic and trusted) and **the modules** (which may be non-deterministic and are sandboxed).

## Anti-agent rule

The runner never lets an LLM decide what to do next. The protocol is a **frozen DAG**: it must be valid YAML conforming to the protocol schema, with module IDs, params, edges, and budgets all declared up front. Once frozen, the runner walks the DAG in topological order and invokes each module as a subprocess. No LLM, no agent, and no module can mutate the DAG during execution.

This guarantees:

- A static, auditable record of *what was supposed to happen*.
- A `run.manifest.json` recording *what actually happened*.
- Hashes that prove the two match for deterministic stages.

## Layers

| Layer | Purpose |
| --- | --- |
| **Desktop app** | Electron renderer + main. Drag-to-compose canvas, parameter forms, credentials vault, run controls, review queue, bundle import/export/verify UI. |
| **Core orchestrator** (`packages/core`) | Pure TypeScript. Protocol validation, module registry, runner, artifact store, audit log, bundle export, claim grounding, variance metrics. No UI. |
| **CLI** (`apps/cli`) | Thin wrapper over core for headless use and CI. |
| **LLM proxy** | A short-lived HTTP server spawned per node when `llm.required: true`. Modules POST through it; the proxy enforces budget and records LLM calls. |
| **Module subprocesses** | Python, R, or Node. Read declared inputs and params from env-var paths, write declared outputs to env-var paths. Sandboxed environment (env filter, optional virtualenv, timeout). |

## Data flow

```
protocol.yaml
   |
   v
Freeze --> .rwb/protocol.frozen.json + module manifest hashes
   |
   v
Run --> for each node in topological order:
            spawn proxy (if llm.required)
            spawn module subprocess with filtered env + RWB_INPUT_*, RWB_OUTPUT_*
            module writes outputs
            runner validates JSON, computes hashes, stores artifact + meta
            runner records llm_calls/tokens/cost from proxy usage
            runner emits onProgress event
   |
   v
.rwb/run.manifest.json + .rwb/artifacts/ + audit.log
   |
   v
Bundle export --> bundle/{protocol.yaml, run.manifest.json, audit.log, artifacts/, modules/, fixtures/}
   |
   v
Bundle replay --> reads artifacts directly, never invokes modules
Bundle verify --> re-runs deterministic nodes from bundled modules, compares hashes
```

## Artifact store

Artifacts are content-addressed. Each artifact has two hashes:

- **`content_hash`** — `sha256` over the canonical JSON bytes of the artifact data.
- **`artifact_id`** — `sha256` over the envelope: content_hash + module ID/version/manifest_hash + sorted input artifact IDs + params hash + prompt hashes + resolved model IDs.

The envelope hash means *the same bytes produced by different modules or with different params get distinct artifact IDs*. This is what enables proper provenance.

For `rendered_figure` outputs, the envelope uses the upstream `figure_spec` content hash so figure images are tracked by their *spec*, not by raster bytes (which would defeat reproducibility on different graphics stacks).

SQLite indexes the store by `cache_key` and `(node_id, output_port)`. The cache key is the envelope hash, minus the actual content hash.

## Canonicalization

All cross-language float formatting is round-half-even to 10 significant digits. JSON keys are sorted lexicographically. UTF-8, no BOM, `\n` line endings, single trailing newline.

The JS, Python, and R SDKs implement matching `round_half_even()` so that a Python module and an R module computing the same logical value produce byte-identical output.

## Bundle format

A bundle is a directory with everything needed to reproduce a run on an air-gapped machine:

```
bundle/
  protocol.yaml             # The frozen protocol
  run.manifest.json         # What the original run produced (hashes for verify)
  audit.log                 # Append-only event log with secrets scrubbed
  modules/<id>/             # Full copy of each module used by the run
  fixtures/<id>/            # Any fixtures the run consumed
  artifacts/<hash[:2]>/<hash>/{data.json, meta.json}    # hash = artifact_id without "sha256:" prefix
  methods.md                # Human-readable methods writeup
  corpus.lock.json          # Pinned corpus state, if produced by the pipeline
  environment.lock.json     # Pinned runtime versions
```

## Trust model

The bundle's modules directory is hashed and compared to the local modules. The desktop UI shows:

- **All trusted** — bundled modules match local modules; verify can run without `--trust`.
- **Mismatch** — at least one bundled module differs from local; verify requires `--trust` (which trusts the bundle code).
- **Unknown** — bundled module not present locally; verify requires `--trust`.

`inspectBundleTrust()` reports the per-module status. `verifyBundle({ trusted: true })` runs the bundled module code; without it, replay reads stored artifacts only.

## Security

See [trust-and-safety.md](trust-and-safety.md) for the full security model:

- Env vars are filtered before module subprocess spawn (no API keys leak to modules — they go through the proxy).
- Bundle export refuses if project files contain likely API keys.
- The audit log is scrubbed of common secret patterns on write.
- Module subprocesses have a 10-minute default timeout and a 50MB output buffer.
- Per-language virtualenv isolation is detected automatically (`.venv/` for Python, `renv/library/` for R).

The default sandbox remains advisory (env filter + timeout), and opt-in OS wrapping is available through `RWB_SANDBOX`. Linux uses `bwrap` when present, macOS uses `sandbox-exec`, and Windows uses Low-integrity `psexec` or a restricted PowerShell fallback. A true Windows AppContainer remains a future hardening item.
