# Reviewer's Guide: Verifying an Atrium Bundle

You received a research bundle from a colleague (or yourself, six months ago) and want to confirm the results are reproducible. This guide walks you through verifying a bundle on a fresh machine, including air-gapped reproduction.

## What you should receive

A bundle is a directory with this layout:

```
study-bundle/
├── protocol.yaml            # The frozen pipeline DAG
├── run.manifest.json        # Hashes of every artifact produced
├── audit.log                # Append-only event log (secrets scrubbed)
├── methods.md               # Human-readable methods writeup (non-authoritative)
├── corpus.lock.json         # Pinned corpus state (if applicable)
├── environment.lock.json    # Pinned runtime versions
├── modules/                 # Full copy of each module the run used
│   └── <module-id>/...
├── fixtures/                # Any fixtures the modules consumed
│   └── <fixture-id>/...
└── artifacts/               # Content-addressed artifact storage
    └── <hash-prefix>/<artifact-id>/{data.json, meta.json}
```

If anything in this layout is missing the bundle is incomplete. **Refuse to verify** until you receive a complete bundle.

## Setup (one-time)

You need:

1. Node.js ≥ 22.
2. Python ≥ 3.11 (if any module uses Python).
3. R ≥ 4.3 (if any module uses R).
4. The `rwb` CLI or the Atrium desktop app.

Install the CLI from source:

```bash
git clone https://github.com/matthewmagee05/atrium-research-workbench.git
cd atrium-research-workbench
npm ci
npm run build
npm link --workspace=apps/cli
```

You now have `rwb` on your `$PATH`.

## Step 1 — Inspect bundle trust

Before re-running anything, check whether the bundled module code matches what's on your local machine:

```bash
rwb bundle verify ./study-bundle
```

(Or in the desktop app: **Verify bundle** → paste the path → **Inspect trust**.)

There are three possible outcomes:

| Outcome | What it means | What to do |
| --- | --- | --- |
| **All trusted** | Every bundled module matches your local copy. | Proceed with `verify`. |
| **Mismatch** | At least one bundled module differs from local. | Read the bundled module source first. If it looks legitimate, re-run with `--trust`. |
| **Unknown** | Bundled modules aren't installed locally. | Inspect the bundled modules. Run with `--trust` to execute them. |

`--trust` is the verbal equivalent of "I have read and accept this code." Don't pass it casually.

## Step 2 — Run verification

```bash
rwb bundle verify ./study-bundle --trust    # if step 1 said mismatch/unknown
```

This:

1. Loads `run.manifest.json` from the bundle as the reference (the "expected" hashes).
2. Re-executes every **deterministic** node from the bundled modules, in the same topological order, using the bundled fixtures and inputs.
3. For each output port, compares the freshly computed `artifact_id` against the manifest's `artifact_id`.
4. Reports per-node, per-port pass/fail.

**Pass criteria**: every deterministic output's artifact_id matches the manifest. Replayable, stochastic, and volatile outputs are not verified — they have legitimate variance.

## Step 3 — Interpret the report

Verify outputs a table:

```
node_id                                  port            ok
11111111-1111-4111-8111-111111111111     records         ✓
22222222-2222-4222-8222-222222222222     normalized      ✓
33333333-3333-4333-8333-333333333333     deduped         ✓
33333333-3333-4333-8333-333333333333     corpus_lock     ✓
44444444-4444-4444-8444-444444444444     summary         ✓
44444444-4444-4444-8444-444444444444     tables          ✓
44444444-4444-4444-8444-444444444444     figure_specs    ✓
```

If everything is `✓`: the deterministic path of this study is reproducible byte-for-byte on your machine. The hashes verify the math and data wrangling, not the LLM judgments (those legitimately vary).

If anything is `✗`: investigate.

## What to do if a hash doesn't match

A failing hash means the same module, given the same inputs, produced different bytes on your machine versus the original. Common causes, ordered from least to most concerning:

### 1. R or Python library drift

The most common cause. The bundle includes the module's source code but **not** its language-level dependencies. If the original ran on `pandas 2.1.0` and you have `pandas 2.2.0`, a one-line behavior change can shift float formatting.

Check:

```bash
cat ./study-bundle/environment.lock.json
```

Compare the recorded runtime versions to yours. If they differ, set up a matching environment (use `pyenv`, `renv`, or a Docker image with the recorded versions) and re-run verify.

### 2. Workbench version mismatch

The canonicalization rules (key sort, round-half-even precision, float epsilon) are part of the workbench. If the bundle was produced with an older workbench, replay through a newer one may produce different bytes for the same logical content.

Check:

```bash
jq '.workbench_version' ./study-bundle/run.manifest.json
```

If your local workbench is newer, check the release notes for canonicalization changes. Pin to the original version if needed:

```bash
git -C atrium-research-workbench checkout <release-tag>
npm ci && npm run build
```

### 3. Architecture or float-precision drift

Truly rare, but possible: `Math.fma` or AVX-512 path differences across CPU generations can change the last digit of certain operations. The round-half-even-to-10-sigfigs canonicalization is designed to mask this for typical statistics, but not for pathological cases.

If you suspect this, run the verification on the same OS+arch as the original (recorded in `environment.lock.json`).

### 4. Modified module code

If the bundled module hash matches local but the artifact hash doesn't, the canonicalization or framework changed. If the bundled module hash differs from local **and** the artifact hash doesn't match, you're looking at intentionally modified code.

Diff the bundled module against the upstream version:

```bash
diff -r ./study-bundle/modules/<module-id> ./atrium-research-workbench/modules/<module-id>
```

If you see changes you can't explain, **don't pass `--trust`**. Contact the bundle author.

### 5. Fabricated bundle

If `--trust` was needed and the artifact hashes still don't match, the bundle's `run.manifest.json` was edited after the run. This is fraud-level concerning; treat the bundle as untrustworthy.

## Air-gap reproduction

A bundle is designed to be reproducible on a machine with no network access:

1. On a connected machine, install `rwb` and its language runtimes.
2. Copy the bundle directory **and** the installed `rwb` CLI to portable media.
3. On the air-gapped machine, install the language runtimes from the same versions recorded in `environment.lock.json`.
4. Copy `rwb` and the bundle over.
5. Run `rwb bundle verify ./study-bundle --trust`.

The bundle includes everything the modules need: source code, fixtures, archived raw API responses (for volatile modules), and prior LLM responses (for replayable modules). No outbound network calls are needed.

If you want extra assurance, run the verification under a process supervisor or network sandbox that fails on any outbound connection:

**Linux**:

```bash
unshare -rn rwb bundle verify ./study-bundle --trust
```

**macOS** (deny network with sandbox-exec):

```bash
sandbox-exec -p '(version 1)(allow default)(deny network*)' \
  rwb bundle verify ./study-bundle --trust
```

If verification passes under these guards, you have a strong reproduction guarantee.

## Reading artifact metadata

Each artifact comes with a `meta.json`. Useful fields:

```jsonc
{
  "artifact_id": "sha256:...",            // The envelope hash (used for caching)
  "content_hash": "sha256:...",           // Hash of the actual data bytes
  "module": {"id": "...", "version": "...", "manifest_hash": "..."},
  "determinism_level": "deterministic",   // Tells you whether to expect byte equality
  "output_kind": "structured_data",       // structured_data | figure_spec | rendered_figure | report_text
  "inputs": [{"port": "...", "artifact_id": "..."}],
  "params": {...},
  "params_hash": "sha256:...",
  "schema_hash": "sha256:...",            // Hash of the JSON schema this validated against
  "row_count": 42,
  "external_api_calls": [                 // For volatile modules
    {"url": "...", "method": "GET", "status": 200, "ts": "..."}
  ],
  "human_decisions": [                    // Reviewer decisions that affected this output
    {"reviewer": "...", "decision": "accept", "ts": "..."}
  ]
}
```

The `inputs` field plus the artifact's envelope hash forms the provenance chain. Walking from any final artifact back through its inputs gets you to the original source artifacts.

## Diff two artifacts

If you want to compare two specific artifacts (yours vs the bundle's, or two versions in the same project):

```bash
rwb artifact diff <artifact-id-a> <artifact-id-b> --project-dir=./study-bundle
```

You get back:

- `same_artifact_id`: do they have the same envelope hash?
- `same_content_hash`: do they have the same data bytes?
- `row_count_a` / `row_count_b`: tabular row counts.
- `data_equal`: structural JSON equality.

If `same_content_hash: true` but `same_artifact_id: false`, the data is identical but the provenance (module version, params, or inputs) differs. That's often the most interesting case.

## Reporting reproducibility

If the bundle verifies cleanly on your machine, you can publish:

> Verified reproducibility on macOS 14 / arm64 / Node 22.13 / Python 3.12.4 / R 4.4.1, against workbench commit `<sha>`. All N deterministic outputs match the manifest hashes.

If it doesn't, file an issue with:

1. Output of `rwb bundle verify` (full table).
2. Output of `cat ./study-bundle/environment.lock.json`.
3. Your local `node --version`, `python3 --version`, `R --version`.
4. The first node where verification diverged.

The bundle author should be able to reproduce the divergence by replicating your environment versions.
