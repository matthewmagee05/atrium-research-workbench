# CLI

The `rwb` CLI exposes the same orchestration core as the desktop app, intended for headless use and CI.

## Commands

| Command | Purpose |
| --- | --- |
| `rwb init <project-dir>` | Create `.rwb/`, `artifacts/`, and the scratch tree in an empty directory. |
| `rwb modules list` | Print every built-in module's id, version, stage, runtime, and brief description. |
| `rwb protocol validate <protocol.yaml>` | Run full schema + edge + module-resolution validation. Non-zero exit on failure. |
| `rwb protocol freeze <protocol.yaml>` | Validate and freeze; writes `frozen_protocol_hash` and module manifest hashes back to the file. |
| `rwb run <protocol.yaml> [--mode=execute\|deterministic-rerun\|full-rerun\|variance-audit] [--variance-iterations=N]` | Execute the frozen protocol; writes `.rwb/run.manifest.json`. |
| `rwb artifact show <artifact-id> [--project-dir=<dir>]` | Print the artifact's meta.json. |
| `rwb artifact diff <a> <b> [--project-dir=<dir>]` | Compare two artifact IDs in the same project: same artifact_id, same content_hash, row counts, structural diff. |
| `rwb journal add <text> [--node=<node-id>] [--project-dir=<dir>]` | Append an entry to the run journal. |
| `rwb review list [--status=pending\|resolved] [--project-dir=<dir>]` | Print the review queue. |
| `rwb review resolve <review-id> --decision='<json>' [--project-dir=<dir>]` | Resolve a review with a structured decision (accept/reject/override/edit/defer/custom). |
| `rwb collaboration export-review-queue --project-dir=<dir> --output=<path>` | Export a deterministic review queue snapshot for out-of-band team sync. |
| `rwb collaboration import-review-queue <snapshot-path> --project-dir=<dir>` | Merge a review queue snapshot by review id and latest timestamp. |
| `rwb methods generate <project-dir>` | Generate `methods.md` from the run manifest and module metadata. |
| `rwb env lock <project-dir>` | Capture runtime versions to `environment.lock.json`. |
| `rwb bundle export <project-dir> --output=<path>` | Produce a self-contained bundle. |
| `rwb bundle import <bundle-path> [--into=<project-dir>]` | Copy a bundle into a fresh project directory. |
| `rwb bundle replay <bundle-path>` | Materialize bundled artifacts without re-executing modules. |
| `rwb bundle verify <bundle-path> [--trust]` | Re-run deterministic nodes from bundled modules and compare hashes. Without `--trust`, refuses bundles whose modules differ from local. |

## Run modes

- `execute` (default) — Walk the DAG; use the artifact cache where the cache key matches.
- `deterministic-rerun` — Re-execute deterministic nodes; reuse cached artifacts for replayable/stochastic.
- `full-rerun` — Re-execute every node, ignoring the cache.
- `variance-audit` — Re-execute replayable and stochastic nodes N times (default 3 via `--variance-iterations`); record per-port agreement metrics under `variance_audit` on the run manifest.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | General failure (validation, runtime, missing input) |
| 2 | Budget exceeded |
| 3 | Bundle verification failed |

## Example: full flow

```bash
rwb init study/
cp golden-pipelines/minimal-bibliometric/protocol.yaml study/protocol.yaml
rwb protocol freeze study/protocol.yaml
rwb run study/protocol.yaml --mode=execute
rwb methods generate study/
rwb env lock study/
rwb bundle export study/ --output=study-bundle/
rwb bundle verify study-bundle/
```
