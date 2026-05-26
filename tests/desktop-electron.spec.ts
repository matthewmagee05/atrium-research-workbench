import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { createReviewItem, initProject } from "../packages/core/src";

const desktopDir = path.resolve(__dirname, "..", "apps", "desktop");
const electronMain = path.join(desktopDir, "dist", "main", "main.js");

let app: ElectronApplication;
let window: Page;
let electronArch = process.arch;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [electronMain],
    cwd: desktopDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });
  window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  electronArch = await app.evaluate(() => process.arch);
});

test.afterAll(async () => {
  await app?.close();
});

test.describe("Atrium Electron main-process E2E", () => {
  test("launches a window with the React app mounted", async () => {
    await window.waitForFunction(() => {
      const root = document.getElementById("root");
      return root !== null && root.children.length > 0;
    }, { timeout: 20000 });
    const rootChildren = await window.evaluate(() => document.getElementById("root")?.children.length ?? 0);
    expect(rootChildren).toBeGreaterThan(0);
  });

  test("IPC: rwb:modules:list returns the registered built-in modules", async () => {
    const modules = await app.evaluate(async ({ ipcMain }) => {
      const handler = (ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown) => unknown> })._invokeHandlers?.get("rwb:modules:list");
      return handler ? await handler({} as unknown) : null;
    });
    expect(Array.isArray(modules)).toBe(true);
    expect((modules as Array<{ id: string }>).length).toBeGreaterThan(0);
    const ids = (modules as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain("fixture-source");
    expect(ids).toContain("record-normalizer");
    expect(ids).toContain("openalex-source");
    expect(ids).toContain("bibliometrix-r");
  });

  test("renderer can call window.rwb.listModules", async () => {
    const modules = await window.evaluate(async () => {
      // @ts-expect-error window.rwb is injected by preload
      const result = await window.rwb.listModules();
      return result.length;
    });
    expect(modules).toBeGreaterThan(0);
  });

  test("preload exposes onRunProgress subscription helper", async () => {
    const hasHelper = await window.evaluate(() => {
      // @ts-expect-error window.rwb is injected by preload
      return typeof window.rwb?.onRunProgress === "function";
    });
    expect(hasHelper).toBe(true);
  });

  test("credentials store: safeStorage round-trip via IPC (set, status, clear)", async () => {
    // rwb:credentials:set → rwb:credentials:status sequence must work without keytar.
    const result = await window.evaluate(async () => {
      // @ts-expect-error window.rwb is injected by preload
      const api = window.rwb;
      const before = await api.getCredentialStatus();
      await api.setCredential("openai", "sk-test-roundtrip-12345");
      const after = await api.getCredentialStatus();
      await api.setCredential("openai", "");
      const cleared = await api.getCredentialStatus();
      return { before, after, cleared };
    });
    expect(result.before.openai).toBe(false);
    expect(result.after.openai).toBe(true);
    expect(result.cleared.openai).toBe(false);
  });

  test("writeProtocol IPC serializes a pipeline to disk", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-e2e-write-"));
    const protocolPath = path.join(dir, "protocol.yaml");
    const protocol = {
      protocol_version: "1.0",
      project: {
        id: "deadbeef-dead-4bee-8eef-deadbeefdead",
        name: "E2E Write Test",
        description: "Verifies writeProtocol IPC",
        created_at: "2026-05-25T00:00:00.000Z",
        created_by: "e2e",
      },
      frozen: { is_frozen: false },
      budget: {
        max_llm_calls_per_run: 0, max_tokens_per_run: 0, max_cost_usd_per_run: 0,
        require_confirmation_above_usd: 0, stop_on_budget_exceeded: true,
      },
      reproduction_policy: {
        default_mode: "replay",
        on_volatile_stage: { rerun_warning: true },
        on_replayable_stage: { enable_variance_audit: false },
        human_decisions: { replay_by_default: true, rerun_behavior: "treat_as_suggestions" },
      },
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Fixture",
          module: { id: "fixture-source", version: "1.0.0" },
          params: { fixture_id: "tiny-corpus" },
        },
      ],
      edges: [],
    };

    const writeResult = await app.evaluate(async ({ ipcMain }, args) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (e: unknown, ...a: unknown[]) => unknown> })._invokeHandlers;
      const writeHandler = handlers.get("rwb:protocol:write");
      if (!writeHandler) throw new Error("rwb:protocol:write not registered");
      return await writeHandler({}, args.protocolPath, args.protocol);
    }, { protocolPath, protocol });

    expect(fs.existsSync(protocolPath)).toBe(true);
    const content = fs.readFileSync(protocolPath, "utf8");
    expect(content).toContain("protocol_version");
    expect(content).toContain("fixture-source");
    expect((writeResult as { bytes: number }).bytes).toBeGreaterThan(0);
    fs.rmSync(dir, { recursive: true });
  });

  test("rwb:run accepts a live pipeline payload, writes protocol.yaml, freezes, and runs", async () => {
    test.skip(process.arch !== electronArch, `better-sqlite3 was built for ${process.arch}, Electron is ${electronArch}`);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-e2e-run-"));
    const protocolPath = path.join(dir, "protocol.yaml");
    const sourceParams = { fixture_id: "tiny-corpus" };

    const liveProtocol = {
      protocol_version: "1.0",
      project: {
        id: "deadbeef-dead-4bee-8eef-deadbeefdead",
        name: "E2E Run Test",
        description: "Verifies the run IPC self-write path",
        created_at: "2026-05-25T00:00:00.000Z",
        created_by: "e2e",
      },
      frozen: { is_frozen: false },
      budget: {
        max_llm_calls_per_run: 0, max_tokens_per_run: 0, max_cost_usd_per_run: 0,
        require_confirmation_above_usd: 0, stop_on_budget_exceeded: true,
      },
      reproduction_policy: {
        default_mode: "replay",
        on_volatile_stage: { rerun_warning: true },
        on_replayable_stage: { enable_variance_audit: false },
        human_decisions: { replay_by_default: true, rerun_behavior: "treat_as_suggestions" },
      },
      nodes: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Fixture Source",
          module: { id: "fixture-source", version: "1.0.0" },
          params: sourceParams,
        },
      ],
      edges: [],
    };

    // initProject would normally be called by openProject; mimic by ensuring .rwb exists.
    fs.mkdirSync(path.join(dir, ".rwb", "scratch"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".rwb", "artifacts"), { recursive: true });

    const result = await app.evaluate(async ({ ipcMain }, args) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (e: unknown, ...a: unknown[]) => unknown> })._invokeHandlers;
      const runHandler = handlers.get("rwb:run");
      if (!runHandler) throw new Error("rwb:run not registered");
      const fakeEvent = { sender: { send: () => undefined } };
      return await runHandler(fakeEvent, args.protocolPath, {
        mode: "execute",
        protocol: args.protocol,
        freezeBeforeRun: true,
      });
    }, { protocolPath, protocol: liveProtocol });

    expect(fs.existsSync(protocolPath)).toBe(true);
    const manifest = result as { completed_status: string; nodes: Array<{ status: string }> };
    expect(manifest.completed_status).toBe("success");
    expect(manifest.nodes).toHaveLength(1);
    expect(manifest.nodes[0].status).toBe("completed");

    fs.rmSync(dir, { recursive: true });
  });

  test("rwb:run rejects with a clear error when protocol.yaml is missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-e2e-missing-"));
    const protocolPath = path.join(dir, "protocol.yaml");

    const err = await app.evaluate(async ({ ipcMain }, args) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (e: unknown, ...a: unknown[]) => unknown> })._invokeHandlers;
      const runHandler = handlers.get("rwb:run");
      if (!runHandler) throw new Error("rwb:run not registered");
      try {
        await runHandler({ sender: { send: () => undefined } }, args.protocolPath, { mode: "execute" });
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    }, { protocolPath });

    expect(err).toContain("protocol.yaml not found");
    expect(err).toContain("Freeze");
    fs.rmSync(dir, { recursive: true });
  });

  test("preload exposes bundle import/verify/diff helpers", async () => {
    const exposed = await window.evaluate(() => ({
      // @ts-expect-error window.rwb is injected by preload
      importBundle: typeof window.rwb?.importBundle === "function",
      // @ts-expect-error window.rwb is injected by preload
      verifyBundle: typeof window.rwb?.verifyBundle === "function",
      // @ts-expect-error window.rwb is injected by preload
      inspectBundleTrust: typeof window.rwb?.inspectBundleTrust === "function",
      // @ts-expect-error window.rwb is injected by preload
      diffArtifacts: typeof window.rwb?.diffArtifacts === "function",
      // @ts-expect-error window.rwb is injected by preload
      testCredential: typeof window.rwb?.testCredential === "function",
    }));
    expect(exposed.importBundle).toBe(true);
    expect(exposed.verifyBundle).toBe(true);
    expect(exposed.inspectBundleTrust).toBe(true);
    expect(exposed.diffArtifacts).toBe(true);
    expect(exposed.testCredential).toBe(true);
  });

  test("actual renderer template flow exposes editable LLM controls and review queue panel", async () => {
    if (await window.getByRole("button", { name: /Pick a starting template/ }).isVisible().catch(() => false)) {
      await window.getByRole("button", { name: /Pick a starting template/ }).click();
      await window.getByRole("button", { name: /Use this template/ }).click();
    }
    await expect(window.getByText(/LLM provider and model/)).toBeVisible();
    await window.getByRole("combobox", { name: /^Provider/ }).selectOption("openai");
    await expect(window.getByRole("combobox", { name: /^Model/ })).toHaveValue("gpt-4o-mini");
    await expect(window.getByText("Review queue")).toBeVisible();
    await window.getByPlaceholder("name or email").fill("electron-reviewer@example.com");
    await window.getByPlaceholder("0000-0000-0000-0000").fill("0000-0002-1825-0097");
    await expect(window.getByPlaceholder("0000-0000-0000-0000")).toHaveValue("0000-0002-1825-0097");
  });

  test("review queue IPC lists and resolves decisions with ORCID attribution", async () => {
    test.skip(process.arch !== electronArch, `better-sqlite3 was built for ${process.arch}, Electron is ${electronArch}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-e2e-review-"));
    initProject(dir);
    const item = createReviewItem(dir, { claim: "Needs adjudication" }, { type: "object" }, { nodeId: "node-1", runId: "run-1" });

    const result = await app.evaluate(async ({ ipcMain }, args) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (e: unknown, ...a: unknown[]) => unknown> })._invokeHandlers;
      const listHandler = handlers.get("rwb:review:list");
      const resolveHandler = handlers.get("rwb:review:resolve");
      if (!listHandler || !resolveHandler) throw new Error("review IPC handlers not registered");
      const before = await listHandler({}, args.dir);
      const resolved = await resolveHandler({}, args.dir, args.id, {
        accepted: true,
        decision_type: "accept",
        decided_by: "electron-reviewer@example.com",
        reviewer_orcid: "0000-0002-1825-0097",
      });
      const after = await listHandler({}, args.dir);
      return { before, resolved, after };
    }, { dir, id: item.id });

    expect((result.before as Array<unknown>)).toHaveLength(1);
    expect((result.resolved as { status: string }).status).toBe("resolved");
    expect((result.resolved as { decision: { reviewer_orcid: string } }).decision.reviewer_orcid).toBe("0000-0002-1825-0097");
    expect((result.after as Array<{ status: string }>)[0].status).toBe("resolved");
    fs.rmSync(dir, { recursive: true });
  });
});
