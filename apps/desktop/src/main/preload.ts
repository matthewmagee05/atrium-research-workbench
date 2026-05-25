import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rwb", {
  listModules: () => ipcRenderer.invoke("rwb:modules:list"),
  listReviewItems: (projectDir: string) => ipcRenderer.invoke("rwb:review:list", projectDir),
  resolveReviewItem: (projectDir: string, reviewId: string, decision: unknown) => ipcRenderer.invoke("rwb:review:resolve", projectDir, reviewId, decision),
  setCredential: (provider: string, value: string) => ipcRenderer.invoke("rwb:credentials:set", provider, value),
  testCredential: (provider: string, value: string) => ipcRenderer.invoke("rwb:credentials:test", provider, value),
  openProject: () => ipcRenderer.invoke("rwb:project:open"),
  validateProtocol: (protocolPath: string) => ipcRenderer.invoke("rwb:protocol:validate", protocolPath),
  freezeProtocol: (protocolPath: string) => ipcRenderer.invoke("rwb:protocol:freeze", protocolPath),
  run: (protocolPath: string, options?: { mode?: string; varianceIterations?: number }) => ipcRenderer.invoke("rwb:run", protocolPath, options),
  generateMethods: (projectDir: string) => ipcRenderer.invoke("rwb:methods:generate", projectDir),
  lockEnvironment: (projectDir: string) => ipcRenderer.invoke("rwb:env:lock", projectDir),
  exportBundle: (projectDir: string) => ipcRenderer.invoke("rwb:bundle:export", projectDir),
  replayBundle: (bundlePath: string) => ipcRenderer.invoke("rwb:bundle:replay", bundlePath),
  importBundle: () => ipcRenderer.invoke("rwb:bundle:import"),
  verifyBundle: (bundlePath: string, options?: { trusted?: boolean }) => ipcRenderer.invoke("rwb:bundle:verify", bundlePath, options),
  inspectBundleTrust: (bundlePath: string) => ipcRenderer.invoke("rwb:bundle:trust", bundlePath),
  diffArtifacts: (artifactIdA: string, artifactIdB: string, projectDir: string) => ipcRenderer.invoke("rwb:artifacts:diff", artifactIdA, artifactIdB, projectDir),
  onRunProgress: (handler: (event: unknown) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => handler(payload);
    ipcRenderer.on("rwb:run:progress", listener);
    return () => ipcRenderer.removeListener("rwb:run:progress", listener);
  },
});
