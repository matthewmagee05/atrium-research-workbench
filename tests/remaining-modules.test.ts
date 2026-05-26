import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { listModules, resolveCorePaths } from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);
const pythonCmd = process.platform === "win32" ? "python" : "python3";

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runPython(moduleId: string, env: Record<string, string>) {
  const moduleDir = path.join(repoRoot, "modules", moduleId);
  const result = spawnSync(pythonCmd, [path.join(moduleDir, "entry.py")], {
    cwd: moduleDir,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${moduleId} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function runPythonResult(moduleId: string, env: Record<string, string>) {
  const moduleDir = path.join(repoRoot, "modules", moduleId);
  return spawnSync(pythonCmd, [path.join(moduleDir, "entry.py")], {
    cwd: moduleDir,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("remaining PRD module contracts", () => {
  it("registers Tier A full-text, analysis, and publication modules", () => {
    const ids = new Set(listModules(paths.modulesRoot).map((mod) => mod.manifest.id));
    for (const id of [
      "arxiv-source",
      "biorxiv-source",
      "unpaywall-source",
      "pdf-fetcher",
      "grobid-extractor",
      "pdf-section-router",
      "table-extractor",
      "citation-resolver",
      "meta-analysis-r",
      "meta-regression-r",
      "funnel-plot-r",
      "risk-of-bias",
      "grade-assessor",
      "topic-model-py",
      "concept-network-py",
      "prisma-2020-checklist",
      "quality-flags",
      "manuscript-formatter",
      "prisma-flow-figure",
      "forest-plot-figure",
      "supplementary-bundle",
      "citation-export",
      "zotero-source",
      "zotero-export",
      "endnote-xml-source",
      "ris-source",
      "ris-export",
      "bibtex-export",
      "rayyan-import",
      "covidence-export",
      "prospero-source",
      "prospero-submit",
      "osf-deposit",
      "zenodo-deposit",
      "figshare-deposit",
      "cover-letter-drafter",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("declares correct external domains for archive/deposit integrations", () => {
    const modules = new Map(listModules(paths.modulesRoot).map((mod) => [mod.manifest.id, mod.manifest]));
    expect(modules.get("arxiv-source")?.side_effects.network_domains).toContain("export.arxiv.org");
    expect(modules.get("biorxiv-source")?.side_effects.network_domains).toContain("api.biorxiv.org");
    expect(modules.get("zotero-source")?.side_effects.network_domains).toContain("api.zotero.org");
    expect(modules.get("osf-deposit")?.side_effects.network_domains).toContain("api.osf.io");
    expect(modules.get("zenodo-deposit")?.side_effects.network_domains).toContain("zenodo.org");
    expect(modules.get("figshare-deposit")?.side_effects.network_domains).toContain("api.figshare.com");
  });

  it("runs the fixture full-text path through section and table extraction", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-fulltext-"));
    const envBase = { RWB_FIXTURES_DIR: path.join(repoRoot, "fixtures"), RWB_ARTIFACT_DIR: tmp };

    const unpaywallParams = path.join(tmp, "unpaywall.params.json");
    const links = path.join(tmp, "links.json");
    writeJson(unpaywallParams, { source_mode: "fixture", fixture_id: "tiny-corpus", max_records: 3 });
    runPython("unpaywall-source", { ...envBase, RWB_PARAMS: unpaywallParams, RWB_OUTPUT_full_text_links: links });
    expect(readJson(links).links.length).toBeGreaterThanOrEqual(2);

    const pdfParams = path.join(tmp, "pdf.params.json");
    const pdfManifest = path.join(tmp, "pdfs.json");
    writeJson(pdfParams, { source_mode: "fixture" });
    runPython("pdf-fetcher", { ...envBase, RWB_PARAMS: pdfParams, RWB_INPUT_full_text_links: links, RWB_OUTPUT_pdf_manifest: pdfManifest, RWB_PDF_CACHE_DIR: path.join(tmp, "pdf-cache") });
    expect(readJson(pdfManifest).pdfs.every((row: { downloaded: boolean }) => row.downloaded)).toBe(true);

    const grobidParams = path.join(tmp, "grobid.params.json");
    const tei = path.join(tmp, "tei.json");
    writeJson(grobidParams, { source_mode: "fixture" });
    runPython("grobid-extractor", { ...envBase, RWB_PARAMS: grobidParams, RWB_INPUT_pdf_manifest: pdfManifest, RWB_OUTPUT_tei_documents: tei });

    const routerParams = path.join(tmp, "router.params.json");
    const sections = path.join(tmp, "sections.json");
    writeJson(routerParams, { source_mode: "fixture", sections: ["methods", "results", "discussion"] });
    runPython("pdf-section-router", { ...envBase, RWB_PARAMS: routerParams, RWB_INPUT_tei_documents: tei, RWB_OUTPUT_sections: sections });

    const tableParams = path.join(tmp, "table.params.json");
    const tables = path.join(tmp, "tables.json");
    writeJson(tableParams, { source_mode: "fixture" });
    runPython("table-extractor", { ...envBase, RWB_PARAMS: tableParams, RWB_INPUT_sections: sections, RWB_OUTPUT_tables: tables });
    expect(readJson(tables).tables.length).toBeGreaterThan(0);

    fs.rmSync(tmp, { recursive: true });
  });

  it("runs risk-of-bias and GRADE fixture outputs", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-grade-"));
    const extractions = path.join(tmp, "extractions.json");
    writeJson(extractions, {
      rows: [
        { record_id: "r1", fields: { study_design: "randomized trial", blinding: "not reported" }, requires_review: true },
        { record_id: "r2", fields: { study_design: "observational" }, requires_review: true },
      ],
    });

    const robParams = path.join(tmp, "rob.params.json");
    const rob = path.join(tmp, "rob.json");
    writeJson(robParams, { source_mode: "fixture", tool: "rob2" });
    runPython("risk-of-bias", { RWB_PARAMS: robParams, RWB_INPUT_extractions: extractions, RWB_OUTPUT_rob_assessments: rob });
    expect(readJson(rob).assessments).toHaveLength(2);

    const meta = path.join(tmp, "meta.json");
    writeJson(meta, { k: 2, pooled_effect: 0.2, pooled_se: 0.05, ci95: [0.1, 0.3], q: 1, i2: 0, tau2: 0, prediction_interval: [0.1, 0.3] });
    const gradeParams = path.join(tmp, "grade.params.json");
    const grade = path.join(tmp, "grade.json");
    writeJson(gradeParams, { source_mode: "fixture", outcome: "Primary outcome" });
    runPython("grade-assessor", { RWB_PARAMS: gradeParams, RWB_INPUT_meta_summary: meta, RWB_INPUT_rob_assessments: rob, RWB_OUTPUT_grade_table: grade });
    expect(readJson(grade).outcomes[0].requires_review).toBe(true);

    fs.rmSync(tmp, { recursive: true });
  });

  it("deposit modules archive dry-run requests and refuse live submission without explicit tokens", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-deposit-"));
    const raw = path.join(tmp, "raw");
    const bundleManifest = path.join(tmp, "bundle.json");
    writeJson(bundleManifest, { bundle_id: "bundle-1" });

    for (const [moduleId, outputName, tokenName] of [
      ["osf-deposit", "osf_deposit", "RWB_OSF_TOKEN"],
      ["zenodo-deposit", "zenodo_deposit", "RWB_ZENODO_TOKEN"],
      ["figshare-deposit", "figshare_deposit", "RWB_FIGSHARE_TOKEN"],
    ] as const) {
      const params = path.join(tmp, `${moduleId}.params.json`);
      const output = path.join(tmp, `${moduleId}.json`);
      writeJson(params, { source_mode: "live_archived", dry_run: false, submit_live: false, metadata: { title: `${moduleId} test` } });
      runPython(moduleId, {
        RWB_PARAMS: params,
        RWB_ARTIFACT_DIR: tmp,
        RWB_RAW_RESPONSES_DIR: raw,
        RWB_INPUT_bundle_manifest: bundleManifest,
        [`RWB_OUTPUT_${outputName}`]: output,
      });
      expect(readJson(output).status).toBe("request_archived_not_submitted");
      expect(fs.existsSync(path.join(raw, `${moduleId}_request.json`))).toBe(true);

      writeJson(params, { source_mode: "live_archived", dry_run: false, submit_live: true, metadata: { title: `${moduleId} test` } });
      const env = {
        ...process.env,
        RWB_PARAMS: params,
        RWB_ARTIFACT_DIR: tmp,
        RWB_RAW_RESPONSES_DIR: raw,
        RWB_INPUT_bundle_manifest: bundleManifest,
        [`RWB_OUTPUT_${outputName}`]: output,
      };
      delete (env as Record<string, string | undefined>)[tokenName];
      (env as Record<string, string>)[tokenName] = "";
      const result = runPythonResult(moduleId, env as Record<string, string>);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(tokenName);
    }

    fs.rmSync(tmp, { recursive: true });
  });

  it("publication modules produce journal-style manuscript, supplement hashes, and CSL citations", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-publication-"));
    const draft = path.join(tmp, "draft.json");
    const figures = path.join(tmp, "figures.json");
    const tables = path.join(tmp, "tables.json");
    writeJson(draft, { markdown: "## Results\n\nThe intervention improved the primary outcome." });
    writeJson(figures, { forest_plot: { kind: "forest" } });
    writeJson(tables, { included_studies: [{ record_id: "r1" }] });

    const manuscriptParams = path.join(tmp, "manuscript.params.json");
    const manuscript = path.join(tmp, "manuscript.json");
    writeJson(manuscriptParams, {
      target_style: "prisma-systematic-review",
      title: "Atrium Test Manuscript",
      authors: [{ name: "Reviewer, Test" }],
      keywords: ["systematic review"],
    });
    runPython("manuscript-formatter", {
      RWB_PARAMS: manuscriptParams,
      RWB_INPUT_draft: draft,
      RWB_INPUT_figures: figures,
      RWB_INPUT_tables: tables,
      RWB_OUTPUT_manuscript: manuscript,
    });
    const manuscriptOutput = readJson(manuscript);
    expect(manuscriptOutput.style).toBe("prisma-systematic-review");
    expect(manuscriptOutput.markdown).toContain("## PRISMA Checklist");
    expect(manuscriptOutput.submission_checklist.some((item: { item: string }) => item.item === "human_editorial_review")).toBe(true);

    const supplementParams = path.join(tmp, "supp.params.json");
    const supplement = path.join(tmp, "supplement.json");
    writeJson(supplementParams, { label: "Supplement Pack" });
    runPython("supplementary-bundle", {
      RWB_PARAMS: supplementParams,
      RWB_INPUT_manuscript: manuscript,
      RWB_INPUT_tables: tables,
      RWB_OUTPUT_supplementary_manifest: supplement,
    });
    const supplementOutput = readJson(supplement);
    expect(supplementOutput.materials[0].sha256).toMatch(/^sha256:/);
    expect(supplementOutput.index_markdown).toContain("Supplement Pack");

    const records = path.join(tmp, "records.json");
    const citations = path.join(tmp, "citations.json");
    const citationParams = path.join(tmp, "citations.params.json");
    writeJson(records, [{
      title: "A reproducible study",
      publication_year: 2026,
      doi: "10.1234/example",
      venue: "Journal of Tests",
      url: "https://example.test/paper",
      authors: ["Ada Lovelace", "Grace Hopper"],
    }]);
    writeJson(citationParams, { source_mode: "fixture" });
    runPython("citation-export", {
      RWB_PARAMS: citationParams,
      RWB_INPUT_records: records,
      RWB_OUTPUT_citations: citations,
    });
    const citationOutput = readJson(citations);
    expect(citationOutput.bibtex).toContain("journal = {Journal of Tests}");
    expect(citationOutput.ris).toContain("DO  - 10.1234/example");
    expect(citationOutput.csl_json[0].DOI).toBe("10.1234/example");

    fs.rmSync(tmp, { recursive: true });
  });
});
