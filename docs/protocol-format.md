# Protocol Format

A protocol is a YAML document that declares a directed pipeline of modules. It lives at the project root as `protocol.yaml`.

## Top-level structure

```yaml
protocol_version: "1.0"
project:
  id: "<uuid>"
  name: "Study name"
  description: "..."
  created_at: "2026-05-25T00:00:00.000Z"
  created_by: "Researcher Name"
frozen:
  is_frozen: false
  frozen_at: null
  frozen_protocol_hash: null
budget:
  max_llm_calls_per_run: 100
  max_tokens_per_run: 500000
  max_cost_usd_per_run: 25
  require_confirmation_above_usd: 10
  stop_on_budget_exceeded: true
reproduction_policy:
  default_mode: "replay"
  on_volatile_stage:
    rerun_warning: true
  on_replayable_stage:
    enable_variance_audit: true
  human_decisions:
    replay_by_default: true
    rerun_behavior: "treat_as_suggestions"
nodes: [...]
edges: [...]
narrative_journal_ref: "journal.md"
environment:
  workbench_version: "..."
  required_modules: [...]
  required_runtimes:
    python: ">=3.11"
    r: ">=4.3"
    node: ">=20"
```

## Nodes

Each node references a module and its params:

```yaml
nodes:
  - id: "<uuid>"
    name: "Display name"
    module:
      id: "module-id"
      version: "1.0.0"
    params:
      arbitrary: "values"
      conforming_to: "the module's params schema"
```

Params are validated against the referenced module's `params_schema` at freeze time and again before each invocation.

## Edges

Edges connect outputs of one node to inputs of another:

```yaml
edges:
  - from: {node_id: "<source-uuid>", port: "records"}
    to: {node_id: "<target-uuid>", port: "records"}
```

The runner validates that:

- All `from.node_id` and `to.node_id` references resolve to declared nodes.
- The referenced `port` exists on the module's input or output list.
- The producing port's schema and the consuming port's schema are structurally compatible.
- Each input port has at most one incoming edge (no fan-in).
- The graph is acyclic.

## Freezing

The protocol must be frozen before running. Freezing:

1. Validates the entire document against the protocol schema.
2. Resolves each module's manifest hash and stores it on `environment.required_modules`.
3. Computes a `frozen_protocol_hash` over the canonicalized document.
4. Sets `frozen.is_frozen: true` and writes the frozen state.

After freezing, edits invalidate the frozen state and the protocol must be re-frozen. Treat re-freezing as forking a new study; archive the prior frozen protocol if you want to keep its provenance.

## Reproduction policy

The `reproduction_policy` block governs how replay handles non-deterministic nodes:

- `default_mode` — `replay` reuses prior outputs by default; `rerun` always re-executes.
- `on_volatile_stage.rerun_warning` — show a warning before re-executing a volatile node.
- `on_replayable_stage.enable_variance_audit` — when true, the variance-audit run mode targets these nodes.
- `human_decisions.replay_by_default` — when true, human review decisions from prior runs are re-applied automatically.
- `human_decisions.rerun_behavior` — `treat_as_suggestions` shows prior decisions but still asks; `auto_apply` applies them without prompting.

## Budget

Budget caps are enforced before each LLM call. If a call would push the run over `max_cost_usd_per_run`, `max_llm_calls_per_run`, or `max_tokens_per_run`, the proxy raises and the run fails.

`stop_on_budget_exceeded: true` (default) hard-fails. `false` continues — useful only for measurement runs.

`require_confirmation_above_usd` is a UI hint; the desktop app prompts before allowing a run whose declared budget exceeds this threshold.
