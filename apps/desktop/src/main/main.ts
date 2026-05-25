import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import {
  diffArtifacts,
  exportBundle,
  freezeProtocol,
  generateEnvironmentLock,
  generateMethods,
  importBundle,
  initProject,
  inspectBundleTrust,
  listModules,
  listReviewItems,
  replayBundle,
  resolveCorePaths,
  resolveReviewItem,
  runProtocol,
  setCredential,
  testCredential,
  validateProtocol,
  verifyBundle
} from "@research-workbench/core";

const repoRoot = path.resolve(__dirname, "../../..", "..");
const corePaths = resolveCorePaths(repoRoot);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Atrium Research Workbench",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("rwb:modules:list", () => listModules(corePaths.modulesRoot).map((mod) => mod.manifest));
ipcMain.handle("rwb:modules:schema", (_event, moduleId: string, schemaRef: string) => {
  const moduleDir = path.join(corePaths.modulesRoot, moduleId);
  const resolved = path.resolve(moduleDir, schemaRef);
  if (!resolved.startsWith(path.resolve(moduleDir))) {
    throw new Error("Schema path escapes module directory");
  }
  return JSON.parse(require("node:fs").readFileSync(resolved, "utf8"));
});
ipcMain.handle("rwb:credentials:set", (_event, provider: "anthropic" | "ollama" | "openai", value: string) => setCredential(provider, value));
ipcMain.handle("rwb:credentials:test", (_event, provider: "anthropic" | "ollama" | "openai", value: string) => testCredential(provider, value));
ipcMain.handle("rwb:review:list", (_event, projectDir: string) => listReviewItems(projectDir));
ipcMain.handle("rwb:review:resolve", (_event, projectDir: string, reviewId: string, decision: unknown) => resolveReviewItem(projectDir, reviewId, decision));

ipcMain.handle("rwb:project:open", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const projectDir = result.filePaths[0];
  initProject(projectDir);
  return projectDir;
});

ipcMain.handle("rwb:protocol:validate", (_event, protocolPath: string) => validateProtocol(protocolPath, corePaths));
ipcMain.handle("rwb:protocol:freeze", (_event, protocolPath: string) => freezeProtocol(protocolPath, corePaths));
ipcMain.handle("rwb:run", (event, protocolPath: string, options?: { mode?: string; varianceIterations?: number }) =>
  runProtocol(protocolPath, corePaths, {
    projectDir: path.dirname(protocolPath),
    mode: (options?.mode as "execute" | "deterministic-rerun" | "full-rerun" | "variance-audit") ?? "execute",
    varianceIterations: options?.varianceIterations,
    onProgress: (progress) => {
      try { event.sender.send("rwb:run:progress", progress); } catch { /* sender may have closed */ }
    },
  })
);
ipcMain.handle("rwb:methods:generate", (_event, projectDir: string) => generateMethods(projectDir));
ipcMain.handle("rwb:env:lock", (_event, projectDir: string) => generateEnvironmentLock(projectDir, corePaths));
ipcMain.handle("rwb:bundle:export", async (_event, projectDir: string) => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const output = path.join(result.filePaths[0], "research-workbench-bundle");
  exportBundle(projectDir, output, corePaths);
  return output;
});
ipcMain.handle("rwb:bundle:replay", (_event, bundlePath: string) => replayBundle(bundlePath));

ipcMain.handle("rwb:bundle:import", async (_event) => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const bundlePath = result.filePaths[0];
  const destResult = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (destResult.canceled || destResult.filePaths.length === 0) return null;
  const destDir = destResult.filePaths[0];
  importBundle(bundlePath, destDir);
  return destDir;
});

ipcMain.handle("rwb:bundle:verify", (_event, bundlePath: string, options?: { trusted?: boolean }) =>
  verifyBundle(bundlePath, { trusted: options?.trusted, localModulesRoot: corePaths.modulesRoot })
);

ipcMain.handle("rwb:bundle:trust", (_event, bundlePath: string) =>
  inspectBundleTrust(bundlePath, corePaths.modulesRoot)
);

ipcMain.handle("rwb:artifacts:diff", (_event, artifactIdA: string, artifactIdB: string, projectDir: string) =>
  diffArtifacts(projectDir, artifactIdA, artifactIdB)
);
