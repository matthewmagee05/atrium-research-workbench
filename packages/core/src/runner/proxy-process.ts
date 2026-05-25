import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import type { BudgetState } from "../budget/budget";
import { filterEnvForModule } from "./sandbox";

export interface StartedProxy {
  url: string;
  stop: () => void;
}

export async function startProxyProcess(config: { projectDir: string; runId: string; nodeId: string; budget: BudgetState; usagePath?: string }): Promise<StartedProxy> {
  const localChildPath = path.join(__dirname, "proxy-child.js");
  const builtChildPath = path.join(process.cwd(), "packages", "core", "dist", "runner", "proxy-child.js");
  const childPath = fs.existsSync(localChildPath) ? localChildPath : builtChildPath;
  const child = spawn(process.execPath, [childPath], {
    env: {
      ...filterEnvForModule(process.env),
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? "",
      RWB_PROXY_CONFIG: JSON.stringify(config)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Proxy process did not start: ${stderr}`)), 5000);
    child.stdout?.once("data", (chunk) => {
      clearTimeout(timer);
      try {
        resolve((JSON.parse(chunk.toString()) as { url: string }).url);
      } catch (error) {
        reject(error);
      }
    });
    child.once("exit", (code) => {
      reject(new Error(`Proxy process exited early with code ${code}: ${stderr}`));
    });
  });
  return {
    url,
    stop: () => {
      child.kill();
    }
  };
}
