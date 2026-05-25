import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "../fs-utils";

export function addJournalEntry(projectDir: string, text: string, nodeId?: string, author = "cli"): string {
  const journalPath = path.join(projectDir, "journal.md");
  ensureDir(path.dirname(journalPath));
  if (!fs.existsSync(journalPath)) {
    fs.writeFileSync(journalPath, "# Research Journal\n\n", "utf8");
  }
  const entry = [
    `## ${new Date().toISOString()}`,
    "",
    `Author: ${author}`,
    nodeId ? `Node: ${nodeId}` : undefined,
    "",
    text,
    ""
  ].filter((line) => line !== undefined).join("\n");
  fs.appendFileSync(journalPath, `${entry}\n`, "utf8");
  return journalPath;
}
