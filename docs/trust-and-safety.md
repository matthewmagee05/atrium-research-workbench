# Trust and Safety

## Threat model

| Trusted | Untrusted |
| --- | --- |
| The workbench core and CLI. | Imported bundles from third parties. |
| Built-in modules in this repository. | External API responses. |
| User-authored local protocols. | LLM outputs (always treated as data, never instructions). |
| Operator-supplied credentials. | Future third-party modules until reviewed. |

## Bundle import safety

Bundle import copies files only. It never executes module code. Re-execution happens through explicit CLI/UI actions (`verify`, `replay`, manual `run`) and is treated as a trusted-code operation.

`inspectBundleTrust(bundlePath, localModulesRoot)` returns a per-module report:

```ts
{
  allTrusted: boolean,
  modules: [{ moduleId, bundledVersion, localVersion?, status: "match" | "mismatch" | "unknown" }],
  hashMismatches: [{ moduleId, bundledHash, localHash }]
}
```

`verifyBundle()` refuses to run without `{ trusted: true }` when any module is mismatched or unknown — the operator must explicitly opt in to running bundled code.

## Secret scanning at export

Bundle export scans included files for likely secrets before writing the final manifest. The scanner looks for:

- Known key prefixes: `sk-ant-`, `sk-` (OpenAI), `ghp_`, `gho_`, `AKIA`, `xoxb-`, etc.
- Keyword patterns: `api_key=...`, `secret=...`, `password=...`, `token=...`, `credential=...`.
- Binary file scanning: checks for null bytes, then scans the text representation for known prefixes.
- Files up to 5MB.

Export fails closed when a possible secret is found and lists the offending file paths.

## Audit log scrubbing

The audit log is scrubbed of common secret patterns before each line is written:

- `sk-ant-...` → `[REDACTED_ANTHROPIC_KEY]`
- Generic `sk-...` (≥20 chars) → `[REDACTED_API_KEY]`
- `api_key=...`, `secret=...`, `token=...` patterns → `[REDACTED]`

This applies to subprocess stderr/stdout that the runner forwards to the audit log.

## LLM credential isolation

LLM calls are routed through a per-node proxy process. Provider credentials are read from the OS keychain (via `keytar`) or from environment variables when running headless, but **never** from protocols or bundles.

The proxy child process is the only place credentials live. Module subprocesses get a filtered environment via `filterEnvForModule()`:

**Always allowed**: `PATH`, `HOME`, `LANG`, `LC_*`, `TZ`, language runtime vars (`PYTHONPATH`, `R_HOME`, `NODE_PATH`, etc.), every `RWB_*` var the runner sets explicitly.

**Always blocked**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GH_TOKEN`, anything matching `*_SECRET`, `*_PASSWORD`, `*_PRIVATE_KEY`, or any name not on the allowlist.

This means: even if a module's `entry.py` tries to read `os.environ["ANTHROPIC_API_KEY"]`, it gets nothing. It must call the proxy.

## Module subprocess hardening

| Mechanism | Purpose |
| --- | --- |
| Env-var filter | Blocks credential leakage to module subprocesses. |
| Per-module virtualenv detection | Auto-uses `.venv/` for Python and `renv/library/` for R if present. |
| 10-minute timeout | Prevents runaway modules. Configurable per-module in a future tier. |
| 50MB output buffer | Bounds the stderr/stdout the runner will buffer. |
| Cwd isolation | Module runs in its own scratch directory; declared output paths point outside. |

## Opt-in OS-level sandboxing

Atrium can wrap module subprocesses with the OS-native sandbox tool when available. Sandboxing is opt-in via the `RWB_SANDBOX` env var:

| Value | Behavior |
| --- | --- |
| unset / `off` / `0` / `false` | No sandbox wrapping (default). |
| `on` / `1` / `true` / `best-effort` | Wrap with `bwrap` (Linux) or `sandbox-exec` (macOS) if available; fall through to no-op otherwise. |
| `required` / `strict` | Same as best-effort, but throw if no sandbox tool is available. |

### Linux: `bubblewrap`

```bash
RWB_SANDBOX=on rwb run protocol.yaml
```

Each module subprocess is wrapped with:

- `--die-with-parent` (sandbox dies with the runner)
- `--unshare-pid --unshare-uts --unshare-ipc` (PID/UTS/IPC namespaces)
- `--unshare-net` when `manifest.side_effects.network: false`
- Read-only binds for `/usr`, `/bin`, `/lib`, `/lib64`, `/etc`, and the module directory
- Read-write bind for the scratch directory only

### macOS: `sandbox-exec`

```bash
RWB_SANDBOX=on rwb run protocol.yaml
```

A per-spawn sandbox profile is written to `$TMPDIR/rwb-sandbox-<pid>-<ts>.sb` and removed after the module exits. The profile denies all writes except to the scratch directory and `$TMPDIR`, and denies network when the module declares `network: false`.

### Windows: AppContainer (not yet implemented)

Windows hardening lands in a future tier.

### Tradeoffs

Sandboxing is genuinely defensive but adds:

- ~100ms startup per module subprocess.
- Stricter filesystem semantics — modules that try to write outside the scratch directory will hit permission errors.
- Network calls fail even for modules that declare `network: true`, unless the sandbox profile allows them.

For trusted golden-pipeline tests, sandboxing is left off by default. Production deployments should set `RWB_SANDBOX=on` or `RWB_SANDBOX=required`.

## Network egress

A module's manifest must declare `side_effects.network: true` and list `network_domains` for any outbound HTTP. The runner does not currently enforce this at the OS level, but:

- The runner records every declared network domain.
- For `volatile` modules, raw responses are archived for provenance.
- Bundles can be replayed offline if the fixtures and raw responses cover all upstream state.

## Proxy boundary

The proxy is the audit boundary. While module subprocesses are running:

- LLM calls flow through `POST /llm/complete` and are recorded with prompts, model IDs, tokens, and cost.
- Review requests flow through `POST /review/request` and create rows in the review queue.
- Progress events flow through `POST /progress/update` and stream to the desktop renderer.
- Journal notes flow through `POST /journal/note`.

A module that bypasses the proxy and calls an LLM provider directly will fail because the API key isn't in its environment.

## Claim grounding

Reports that make claims must ground each one in an artifact. The runner validates that every `claim.status == "grounded"` references at least one existing artifact ID in the project's artifact store. Ungrounded claims are allowed but flagged. A grounded claim referencing a missing artifact fails the run.
