import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./fs-utils";

export function initProject(projectDir: string): void {
  ensureDir(projectDir);
  ensureDir(path.join(projectDir, ".rwb", "artifacts"));
  ensureDir(path.join(projectDir, ".rwb", "scratch"));
  const configPath = path.join(projectDir, ".rwb", "config.yaml");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, "bundle_format: plain-directory\n", "utf8");
  }
  const journalPath = path.join(projectDir, "journal.md");
  if (!fs.existsSync(journalPath)) {
    fs.writeFileSync(journalPath, "# Research Journal\n\n", "utf8");
  }
}
