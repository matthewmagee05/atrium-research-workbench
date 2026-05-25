import fs from "node:fs";
import path from "node:path";
import { scrubSecrets } from "../credentials/credentials";
import { ensureDir } from "../fs-utils";

export class AuditLog {
  readonly path: string;

  constructor(projectDir: string) {
    this.path = path.join(projectDir, ".rwb", "audit.jsonl");
    ensureDir(path.dirname(this.path));
  }

  append(event: string, payload: Record<string, unknown>): void {
    const raw = JSON.stringify({ ts: new Date().toISOString(), event, ...payload });
    const scrubbed = scrubSecrets(raw);
    fs.appendFileSync(this.path, `${scrubbed}\n`, "utf8");
  }
}
