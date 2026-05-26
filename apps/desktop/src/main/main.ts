import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  ArtifactStore,
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
  testCredential,
  validateProtocol,
  verifyBundle
} from "@research-workbench/core";
import {
  desktopGetCredentialStatus,
  desktopSetCredential,
  isCredentialStoreAvailable,
  loadCredentialsIntoEnv,
  type Provider,
} from "./credentials-store";

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

app.whenReady().then(() => {
  loadCredentialsIntoEnv();
  createWindow();
});

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
ipcMain.handle("rwb:credentials:set", (_event, provider: Provider, value: string) => {
  desktopSetCredential(provider, value);
});
ipcMain.handle("rwb:credentials:test", (_event, provider: "anthropic" | "ollama" | "openai", value: string) => testCredential(provider, value));
ipcMain.handle("rwb:credentials:status", () => desktopGetCredentialStatus());
ipcMain.handle("rwb:credentials:available", () => isCredentialStoreAvailable());
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
ipcMain.handle("rwb:protocol:write", (_event, protocolPath: string, protocol: unknown) => {
  fs.mkdirSync(path.dirname(protocolPath), { recursive: true });
  fs.writeFileSync(protocolPath, YAML.stringify(protocol), "utf8");
  return { path: protocolPath, bytes: fs.statSync(protocolPath).size };
});
ipcMain.handle("rwb:run", async (event, protocolPath: string, options?: {
  mode?: string;
  varianceIterations?: number;
  protocol?: unknown;
  freezeBeforeRun?: boolean;
}) => {
  // Defense in depth: if the renderer passes the live pipeline, persist it to disk
  // before running. This guarantees the on-disk protocol matches the canvas even if
  // the renderer skipped its own pre-write step (stale build, race, etc.).
  if (options?.protocol) {
    fs.mkdirSync(path.dirname(protocolPath), { recursive: true });
    fs.writeFileSync(protocolPath, YAML.stringify(options.protocol), "utf8");
  }
  if (!fs.existsSync(protocolPath)) {
    throw new Error(
      `protocol.yaml not found at ${protocolPath}. ` +
      `Click "Freeze" before running, or open a project that already has one.`
    );
  }
  if (options?.freezeBeforeRun) {
    freezeProtocol(protocolPath, corePaths);
  }
  return runProtocol(protocolPath, corePaths, {
    projectDir: path.dirname(protocolPath),
    mode: (options?.mode as "execute" | "deterministic-rerun" | "full-rerun" | "variance-audit") ?? "execute",
    varianceIterations: options?.varianceIterations,
    onProgress: (progress) => {
      try { event.sender.send("rwb:run:progress", progress); } catch { /* sender may have closed */ }
    },
  });
});
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

ipcMain.handle("rwb:bundle:importPath", async (_event, bundlePath: string) => {
  if (!bundlePath || !fs.existsSync(bundlePath)) {
    throw new Error(`Bundle path not found: ${bundlePath}`);
  }
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

ipcMain.handle("rwb:artifacts:get", (_event, projectDir: string, artifactId: string) => {
  if (!projectDir) throw new Error("Open a project before viewing artifacts");
  const store = new ArtifactStore(projectDir);
  try {
    const meta = store.getMeta(artifactId);
    const dataPath = store.dataPath(artifactId);
    const raw = fs.readFileSync(dataPath, "utf8");
    let content: unknown;
    try {
      content = JSON.parse(raw);
    } catch {
      content = raw;
    }
    return {
      meta,
      content,
      dataPath,
      dir: path.dirname(dataPath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
    };
  } finally {
    store.close();
  }
});

ipcMain.handle("rwb:artifacts:reveal", (_event, projectDir: string, artifactId: string) => {
  if (!projectDir) throw new Error("Open a project before revealing artifacts");
  const store = new ArtifactStore(projectDir);
  try {
    const dataPath = store.dataPath(artifactId);
    shell.showItemInFolder(dataPath);
    return dataPath;
  } finally {
    store.close();
  }
});

ipcMain.handle("rwb:review:exportNotes", async (_event, projectDir: string, notes: unknown[]) => {
  if (!projectDir) throw new Error("Open or import a project before exporting reviewer notes");
  const output = path.join(projectDir, "review.md");
  const body = [
    "# Reviewer Notes",
    "",
    ...(Array.isArray(notes) ? notes : []).map((note) => {
      const row = note as { artifactId?: string; note?: string; createdAt?: string };
      return `## ${row.artifactId || "General"}\n\n- Created: ${row.createdAt || new Date().toISOString()}\n- Note: ${row.note || ""}\n`;
    }),
  ].join("\n");
  fs.writeFileSync(output, body, "utf8");
  return output;
});
