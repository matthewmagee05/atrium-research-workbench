# Desktop Quickstart

The Atrium desktop app is the primary way to compose, run, and verify research protocols.

## Build and run from source

```bash
npm install
npm run build -w packages/core
npm run build -w apps/desktop
npm run electron -w apps/desktop
```

The first run shows a welcome screen with template choices: **Systematic Review**, **Bibliometric Analysis**, **Hypothesis-Driven Research**, or **Blank Canvas**. Picking a template populates the canvas with that pipeline.

After selecting a template, the credentials wizard lets you store API keys for Anthropic, OpenAI, or Ollama. Each provider has a **Test** button that sends a minimal request to verify the key works without writing data to the project. Keys are stored in the OS keychain via `keytar` — never in plaintext.

## Main workbench layout

- **Left panel** — Module library, organized by stage. Drag modules onto the canvas or double-click to add at a default position.
- **Center** — Drag-to-compose pipeline canvas (ReactFlow). Connections are validated against module input/output schemas; incompatible ports refuse to connect.
- **Right inspector** — Param form for the selected node (auto-rendered from the module's `params_schema` via `@rjsf/core`), the project's protocol path, the budget panel, credentials, and the review queue.
- **Top bar** — Mode selector (Execute / Deterministic re-run / Full re-run / Variance audit), project actions (Open, Freeze, Run, Export/Import/Verify/Diff bundle).

## Running a pipeline

1. Open a project directory (or let one be created from a template).
2. Compose the pipeline by dragging modules and connecting ports.
3. Fill in each node's params using the inspector form.
4. Freeze the protocol (top bar **Freeze** button or `Cmd/Ctrl-S`).
5. Click **Run**. The budget drawer slides out and shows live per-node progress, cumulative token usage, and cost.

Each node emits `node_started` and `node_completed` events through the IPC stream; the renderer updates the budget panel and the canvas in real time.

## Bundle operations

The top bar has four bundle actions:

- **Export bundle** — Writes a self-contained directory with the protocol, run manifest, audit log, modules, fixtures, and artifacts.
- **Import bundle** — Opens a bundle directory and imports it into a new local project.
- **Verify bundle** — Inspects trust (bundled modules vs local) and optionally re-runs deterministic nodes to confirm hashes match `run.manifest.json`.
- **Diff artifacts** — Compares two artifact IDs from the current project's store. Returns same-hash flag, row counts, and structural diff.

The verify dialog has two modes: **Verify (strict)** refuses untrusted bundled modules; **Verify (trust bundled modules)** is required when bundled code differs from local.

## Renderer-only test suite

```bash
npx playwright install chromium
npm run test:desktop
```

This boots the Vite dev server and runs the Playwright tests against the renderer. It does not test the Electron main process; for that you'd need an Electron-aware test runner.

## Packaging installers

Production installers are built with `electron-builder`:

```bash
cd apps/desktop
npm run package           # current platform
npm run package:mac       # mac DMG (x64 + arm64)
npm run package:linux     # AppImage + deb (x64)
npm run package:win       # NSIS installer (x64)
```

Output lands in `apps/desktop/release/`.

Production release builds require signing credentials. The GitHub release workflow runs `npm run release:preflight -- <mac|win|linux>` before packaging and fails macOS/Windows releases if signing secrets are missing. Use local `npm run package:*` commands only for unsigned development builds.

## Troubleshooting

- **"OS keychain access is unavailable"** — `keytar` couldn't load. On Linux you may need `libsecret-1-dev`. On macOS this usually means Keychain access was denied for the app.
- **Module subprocess timed out** — Default is 10 min. If a legitimate long-running module needs more, raise the timeout in the module's manifest or in a future per-protocol override.
- **Verify failed without changes** — Compare your local module versions to the bundle. A common cause is a drift in `requirements.txt` that changed downstream library behavior. Use `inspectBundleTrust` to find which module changed.
- **Live budget panel shows zero during run** — Confirm the IPC `rwb:run:progress` channel is wired (it's set up automatically in `main.tsx`). If you see no progress at all, check that you launched via the Electron shell rather than the Vite dev server.
