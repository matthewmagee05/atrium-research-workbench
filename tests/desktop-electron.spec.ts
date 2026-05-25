import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

const desktopDir = path.resolve(__dirname, "..", "apps", "desktop");
const electronMain = path.join(desktopDir, "dist", "main", "main.js");

let app: ElectronApplication;
let window: Page;

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
});
