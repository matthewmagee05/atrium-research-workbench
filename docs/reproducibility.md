# Reproducibility

## Two reproduction modes

**Replay** is the default. It materializes archived artifacts from a bundle without invoking any module code. The Tier 0 and Tier 1A golden tests run replay under a Node socket/DNS guard that fails the test on outbound network attempts.

**Verify** re-executes deterministic stages from the bundled modules and compares produced artifact IDs against `run.manifest.json`. Verify is the strongest reproducibility guarantee the workbench can offer — if the bundled module produces the same artifact ID on a different machine, the deterministic path is reproduced byte-for-byte.

Verify cannot prove reproduction of replayable / stochastic / volatile stages, because those legitimately vary across runs. For those stages, `variance-audit` mode measures *how* they vary across N iterations.

## What's ground truth

| File | Authoritative? |
| --- | --- |
| `protocol.yaml` (frozen) | Yes — the contract of what the run was supposed to do. |
| `run.manifest.json` | Yes — what each node actually produced (hashes). |
| `artifacts/<id>/meta.json` + `data.json` | Yes — content + envelope hash chain. |
| `audit.log` | Yes — append-only event log, secrets scrubbed. |
| `corpus.lock.json` | Yes — pinned corpus state, deterministic across replay. |
| `environment.lock.json` | Yes — pinned runtime versions. |
| `methods.md` | **No** — convenience writeup, generated from authoritative files. |

`methods.md` is for humans. Always check the structured artifacts when reproducing.

## Canonical JSON

Reproducibility requires byte-identical output across machines and languages. Atrium's canonicalization rules:

- Sorted keys (lexicographic).
- UTF-8, no BOM, `\n` line endings, single trailing newline.
- No trailing whitespace inside lines.
- Floats are formatted via round-half-even to 10 significant digits.
- Integers are emitted without a fractional part.
- Booleans and null lowercased.
- Arrays preserve order.

The JS, Python, and R SDKs all implement the same `round_half_even()` so values computed in any one language hash identically when written through the SDK's `write_json()`.

The cross-language float agreement test (`tests/canonicalize.test.ts`) verifies that `R signif(x, 10)` matches `JS roundHalfEven()` for representative values.

## Cache key

The cache key for a node is `sha256(canonical(envelope))` where the envelope is:

```json
{
  "module_id": "...",
  "module_version": "...",
  "manifest_hash": "...",
  "input_artifact_ids": ["sha256:...", "sha256:..."],
  "params_hash": "sha256(canonical(params))",
  "prompt_hashes": ["sha256:..."],
  "resolved_model_ids": ["claude-sonnet-4-..."]
}
```

A change in any one field — even a whitespace difference in a prompt — produces a different cache key. The deterministic-rerun mode looks up by cache key; cache misses re-execute.

## External API provenance

When a `volatile` module hits an external API, its module code archives every raw response under `RWB_RAW_RESPONSES_DIR/`. The runner picks these up and populates `external_api_calls` on the resulting artifact's meta.json:

```json
{
  "external_api_calls": [
    {
      "url": "https://api.openalex.org/works/...",
      "method": "GET",
      "status": 200,
      "ts": "2026-05-25T12:34:56Z",
      "response_size_bytes": 8721
    }
  ]
}
```

This means the bundle contains both the canonical structured artifact *and* the raw upstream response that produced it. A reviewer can independently verify the transformation.

## Human-decision provenance

Decisions made through the review queue (accept / reject / override / edit / defer / custom) are recorded on the relevant artifact's `human_decisions` array. On replay, these are reapplied; on rerun, the protocol's `reproduction_policy.human_decisions` setting controls whether they're auto-applied or shown as suggestions.

## Air-gap reproduction

A bundle is reproducible on a machine with no network access:

```bash
rwb bundle verify ./received-bundle --trust
```

Verify boots the bundled modules with `network_domains` enforcement off, runs the deterministic stages, and compares hashes. The bundled fixtures and archived raw responses cover everything that would otherwise need the internet.
