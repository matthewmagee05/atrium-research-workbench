import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const modulesRoot = path.join(root, "modules");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart() + "\n", "utf8");
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function pyHelpers() {
  return `
import json
import os
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\\n")


def raw_dir():
    target = Path(os.environ.get("RWB_RAW_RESPONSES_DIR") or Path(os.environ["RWB_ARTIFACT_DIR"]) / "raw_responses")
    target.mkdir(parents=True, exist_ok=True)
    return target


def read_optional_input(name, fallback):
    path = os.environ.get(name)
    if path and Path(path).exists():
        return read_json(path)
    return fallback

`;
}

function commonSchemas(dir) {
  write(path.join(dir, "schemas", "anything.json"), json({ type: ["object", "array", "string", "number", "boolean", "null"] }));
  write(path.join(dir, "schemas", "records.json"), json({ type: "array", items: { type: "object" } }));
}

function manifest(fields) {
  const {
    id, name, description, stage, runtime = "python", entry = runtime === "r" ? "entry.R" : "entry.py",
    inputs = [], outputs, determinism = "deterministic", network = false, domains = [], hitl = false,
    llm = false, documentation_url = "",
  } = fields;
  return `id: ${id}
version: 0.1.0
name: ${name}
description: ${description}
stage: ${stage}
runtime: ${runtime}
entry: ${entry}
runtime_version: "${runtime === "r" ? ">=4.3" : ">=3.11"}"
dependencies:
  ${runtime}: ${runtime === "r" ? "DESCRIPTION" : "requirements.txt"}
${inputs.length ? `inputs:
${inputs.map((input) => `  - name: ${input.name}
    schema: ${input.schema}
${input.optional ? "    optional: true\n" : ""}`).join("")}` : "inputs: []\n"}outputs:
${outputs.map((output) => `  - name: ${output.name}
    schema: ${output.schema}
    description: ${output.description}
    output_kind: ${output.kind}
`).join("")}params_schema: schemas/params.json
llm:
  required: ${llm ? "true" : "false"}
  budget: {max_tokens_per_run: ${llm ? 12000 : 0}, max_calls_per_run: ${llm ? 3 : 0}, max_cost_usd_per_run: ${llm ? 2 : 0}}
  prompts: []
determinism:
  level: ${determinism}
  guarantee: Fixture and snapshot modes are deterministic; live modes archive raw requests and responses when applicable.
  variance_sources: ${network ? "[external_api_state]" : "[]"}
  reproduction_metrics: [schema_validity, row_count_agreement]
human_in_the_loop:
  enabled: ${hitl ? "true" : "false"}
  triggers: ${hitl ? "[explicit_review_flag]" : "[]"}
side_effects:
  network: ${network ? "true" : "false"}
  network_domains: [${domains.join(", ")}]
  filesystem_write: true
  external_processes: false
author: Research Workbench
license: MIT
documentation_url: ${documentation_url}
`;
}

function addPythonModule(spec, entry) {
  const dir = path.join(modulesRoot, spec.id);
  commonSchemas(dir);
  write(path.join(dir, "manifest.yaml"), manifest(spec));
  write(path.join(dir, "requirements.txt"), "");
  write(path.join(dir, "README.md"), `# ${spec.name}\n\n${spec.description}\n\nSupports fixture and snapshot modes for offline tests. Live modes archive raw responses where external APIs are called.\n`);
  write(path.join(dir, "schemas", "params.json"), json(spec.params ?? {
    type: "object",
    properties: {
      source_mode: { type: "string", enum: ["fixture", "snapshot", "live_archived"], default: "fixture" },
      snapshot_path: { type: "string" },
    },
    additionalProperties: true,
  }));
  for (const output of spec.outputs) {
    write(path.join(dir, output.schema), json(output.schemaJson ?? { type: "object", additionalProperties: true }));
  }
  write(path.join(dir, "entry.py"), pyHelpers() + entry);
}

function addRModule(spec, entry) {
  const dir = path.join(modulesRoot, spec.id);
  commonSchemas(dir);
  write(path.join(dir, "manifest.yaml"), manifest({ ...spec, runtime: "r" }));
  write(path.join(dir, "DESCRIPTION"), `Package: ${spec.id}-module\nType: Package\nTitle: ${spec.name}\nVersion: 0.1.0\nImports:\n    jsonlite\n`);
  write(path.join(dir, "README.md"), `# ${spec.name}\n\n${spec.description}\n`);
  write(path.join(dir, "schemas", "params.json"), json(spec.params ?? { type: "object", properties: {}, additionalProperties: true }));
  for (const output of spec.outputs) {
    write(path.join(dir, output.schema), json(output.schemaJson ?? { type: "object", additionalProperties: true }));
  }
  write(path.join(dir, "entry.R"), entry);
}

const recordsOutput = { name: "records", schema: "schemas/records.json", description: "Bibliographic records.", kind: "structured_data", schemaJson: { type: "array", items: { type: "object" } } };

addPythonModule({
  id: "arxiv-source",
  name: "arXiv Source",
  description: "Pulls arXiv preprint metadata and PDF URLs.",
  stage: "source",
  network: true,
  domains: ["export.arxiv.org"],
  determinism: "volatile",
  documentation_url: "https://info.arxiv.org/help/api/index.html",
  outputs: [recordsOutput],
  params: { type: "object", properties: { source_mode: { type: "string", enum: ["fixture", "snapshot", "live_archived"], default: "fixture" }, fixture_id: { type: "string", default: "tiny-corpus" }, snapshot_path: { type: "string" }, query: { type: "string" }, max_records: { type: "integer", default: 25 } }, additionalProperties: false },
}, `
def main():
    params = read_json(os.environ["RWB_PARAMS"])
    mode = params.get("source_mode", "fixture")
    if mode == "fixture":
        records = read_json(Path(os.environ["RWB_FIXTURES_DIR"]) / params.get("fixture_id", "tiny-corpus") / "records.json")
    elif mode == "snapshot":
        records = read_json(params["snapshot_path"])
    elif mode == "live_archived":
        query = params.get("query", "all:reproducibility")
        max_records = int(params.get("max_records", 25))
        url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"search_query": query, "start": "0", "max_results": str(max_records)})
        text = urllib.request.urlopen(url, timeout=30).read().decode("utf-8")
        (raw_dir() / "arxiv_query_1.xml").write_text(text, encoding="utf-8")
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(text)
        records = []
        for entry in root.findall("atom:entry", ns):
            arxiv_id = entry.findtext("atom:id", default="", namespaces=ns)
            title = " ".join(entry.findtext("atom:title", default="", namespaces=ns).split())
            authors = [a.findtext("atom:name", default="", namespaces=ns) for a in entry.findall("atom:author", ns)]
            pdf_url = None
            for link in entry.findall("atom:link", ns):
                if link.attrib.get("title") == "pdf":
                    pdf_url = link.attrib.get("href")
            records.append({"id": arxiv_id, "title": title, "authors": authors, "pdf_url": pdf_url, "source": "arxiv"})
    else:
        raise ValueError(f"Unsupported source_mode: {mode}")
    write_json(os.environ["RWB_OUTPUT_records"], records)

if __name__ == "__main__":
    main()
`);

addPythonModule({
  id: "biorxiv-source",
  name: "bioRxiv / medRxiv Source",
  description: "Pulls bioRxiv or medRxiv preprint metadata with DOI and PDF links.",
  stage: "source",
  network: true,
  domains: ["api.biorxiv.org"],
  determinism: "volatile",
  documentation_url: "https://api.biorxiv.org/",
  outputs: [recordsOutput],
  params: { type: "object", properties: { source_mode: { type: "string", enum: ["fixture", "snapshot", "live_archived"], default: "fixture" }, fixture_id: { type: "string", default: "tiny-corpus" }, snapshot_path: { type: "string" }, server: { type: "string", enum: ["biorxiv", "medrxiv"], default: "biorxiv" }, from_date: { type: "string", default: "2024-01-01" }, to_date: { type: "string", default: "2024-12-31" }, max_records: { type: "integer", default: 25 } }, additionalProperties: false },
}, `
def main():
    params = read_json(os.environ["RWB_PARAMS"])
    mode = params.get("source_mode", "fixture")
    if mode == "fixture":
        records = read_json(Path(os.environ["RWB_FIXTURES_DIR"]) / params.get("fixture_id", "tiny-corpus") / "records.json")
    elif mode == "snapshot":
        records = read_json(params["snapshot_path"])
    elif mode == "live_archived":
        server = params.get("server", "biorxiv")
        url = f"https://api.biorxiv.org/details/{server}/{params.get('from_date', '2024-01-01')}/{params.get('to_date', '2024-12-31')}/0"
        payload = json.loads(urllib.request.urlopen(url, timeout=30).read().decode("utf-8"))
        write_json(raw_dir() / f"{server}_details_1.json", payload)
        records = []
        for row in payload.get("collection", [])[: int(params.get("max_records", 25))]:
            doi = row.get("doi", "")
            records.append({**row, "id": doi, "pdf_url": f"https://www.{server}.org/content/{doi}.full.pdf" if doi else None, "source": server})
    else:
        raise ValueError(f"Unsupported source_mode: {mode}")
    write_json(os.environ["RWB_OUTPUT_records"], records)

if __name__ == "__main__":
    main()
`);

addPythonModule({
  id: "zotero-source",
  name: "Zotero Source",
  description: "Imports a Zotero user or group library collection through Web API v3 or fixture snapshots.",
  stage: "source",
  network: true,
  domains: ["api.zotero.org"],
  determinism: "volatile",
  documentation_url: "https://www.zotero.org/support/dev/web_api/v3/start",
  outputs: [recordsOutput],
}, `
def main():
    params = read_json(os.environ["RWB_PARAMS"])
    mode = params.get("source_mode", "fixture")
    if mode == "fixture":
        records = read_json(Path(os.environ["RWB_FIXTURES_DIR"]) / params.get("fixture_id", "tiny-corpus") / "records.json")
    elif mode == "snapshot":
        records = read_json(params["snapshot_path"])
    elif mode == "live_archived":
        library_type = params.get("library_type", "users")
        library_id = params["library_id"]
        collection = params.get("collection_id")
        path_part = f"/collections/{collection}/items/top" if collection else "/items/top"
        url = f"https://api.zotero.org/{library_type}/{library_id}{path_part}?" + urllib.parse.urlencode({"limit": str(params.get("max_records", 100)), "format": "json"})
        headers = {"Zotero-API-Version": "3"}
        token = params.get("api_key") or os.environ.get("ZOTERO_API_KEY")
        if token:
            headers["Zotero-API-Key"] = token
        payload = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30).read().decode("utf-8"))
        write_json(raw_dir() / "zotero_items_1.json", payload)
        records = [item.get("data", item) for item in payload]
    else:
        raise ValueError(f"Unsupported source_mode: {mode}")
    write_json(os.environ["RWB_OUTPUT_records"], records)

if __name__ == "__main__":
    main()
`);

for (const id of ["endnote-xml-source", "ris-source", "rayyan-import"]) {
  addPythonModule({
    id,
    name: id.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join(" "),
    description: `Imports ${id.replace("-source", "").replace("-import", "")} files into Atrium record objects.`,
    stage: "source",
    outputs: [recordsOutput],
    params: { type: "object", properties: { source_mode: { type: "string", enum: ["fixture", "snapshot", "live_archived"], default: "fixture" }, fixture_id: { type: "string", default: "tiny-corpus" }, snapshot_path: { type: "string" }, input_path: { type: "string" } }, additionalProperties: false },
  }, `
def parse_ris(text):
    records = []
    current = {}
    authors = []
    for line in text.splitlines():
        if len(line) < 6 or "  - " not in line:
            continue
        tag, value = line[:2], line[6:].strip()
        if tag == "TY":
            current = {"source": "${id}"}
            authors = []
        elif tag == "AU":
            authors.append(value)
        elif tag in ("TI", "T1"):
            current["title"] = value
        elif tag == "PY":
            current["publication_year"] = int(value[:4]) if value[:4].isdigit() else None
        elif tag == "DO":
            current["doi"] = value
        elif tag == "ER":
            current["authors"] = authors
            current["id"] = current.get("doi") or current.get("title", "")
            records.append(current)
    return records

def main():
    params = read_json(os.environ["RWB_PARAMS"])
    mode = params.get("source_mode", "fixture")
    if mode == "fixture":
        records = read_json(Path(os.environ["RWB_FIXTURES_DIR"]) / params.get("fixture_id", "tiny-corpus") / "records.json")
    elif mode == "snapshot":
        records = read_json(params["snapshot_path"])
    elif params.get("input_path"):
        text = Path(params["input_path"]).read_text(encoding="utf-8")
        if "${id}" == "endnote-xml-source":
            root = ET.fromstring(text)
            records = []
            for idx, rec in enumerate(root.findall(".//record")):
                title = "".join(rec.findtext(".//title", default="").split())
                records.append({"id": f"endnote_{idx}", "title": title, "source": "endnote"})
        else:
            records = parse_ris(text)
    else:
        raise ValueError("Provide snapshot_path or input_path for non-fixture import")
    write_json(os.environ["RWB_OUTPUT_records"], records)

if __name__ == "__main__":
    main()
`);
}

for (const [id, outputName] of [["ris-export", "ris"], ["bibtex-export", "bibtex"], ["zotero-export", "zotero_update_plan"], ["covidence-export", "covidence_package"]]) {
  addPythonModule({
    id,
    name: id.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join(" "),
    description: `Exports Atrium records or decisions for ${id.replace("-export", "")}.`,
    stage: "report",
    network: id === "zotero-export" || id === "covidence-export",
    domains: id === "zotero-export" ? ["api.zotero.org"] : id === "covidence-export" ? ["api.covidence.org"] : [],
    outputs: [{ name: outputName, schema: "schemas/output.json", description: "Export payload.", kind: "structured_data" }],
    inputs: [{ name: "records", schema: "schemas/records.json", optional: true }, { name: "decisions", schema: "schemas/anything.json", optional: true }],
  }, `
def main():
    params = read_json(os.environ["RWB_PARAMS"])
    records = read_optional_input("RWB_INPUT_records", [])
    if isinstance(records, dict):
        records = records.get("records", records.get("rows", []))
    if "${id}" == "ris-export":
        lines = []
        for record in records:
            lines += ["TY  - JOUR", f"TI  - {record.get('title', '')}", f"PY  - {record.get('publication_year', '')}", f"DO  - {record.get('doi', '')}", "ER  -"]
        payload = {"ris": "\\n".join(lines), "count": len(records)}
    elif "${id}" == "bibtex-export":
        entries = [f"@article{{record{i},\\n  title = {{{r.get('title', '')}}},\\n  year = {{{r.get('publication_year', '')}}},\\n  doi = {{{r.get('doi', '')}}}\\n}}" for i, r in enumerate(records, 1)]
        payload = {"bibtex": "\\n\\n".join(entries), "count": len(records)}
    else:
        payload = {"dry_run": params.get("dry_run", True), "records": records, "decisions": read_optional_input("RWB_INPUT_decisions", {})}
        if not params.get("dry_run", True) and params.get("source_mode") == "live_archived":
            write_json(raw_dir() / "${id}_request.json", payload)
    write_json(os.environ["RWB_OUTPUT_${outputName}"], payload)

if __name__ == "__main__":
    main()
`);
}

addPythonModule({
  id: "prospero-source",
  name: "PROSPERO Source",
  description: "Imports a PROSPERO registration snapshot or live record metadata when provided.",
  stage: "source",
  network: true,
  domains: ["www.crd.york.ac.uk"],
  outputs: [{ name: "registration", schema: "schemas/registration.json", description: "Registration metadata.", kind: "structured_data" }],
}, `
def main():
    params = read_json(os.environ["RWB_PARAMS"])
    mode = params.get("source_mode", "fixture")
    if mode == "snapshot":
        payload = read_json(params["snapshot_path"])
    else:
        payload = {"registration_id": params.get("registration_id", "CRD000000000"), "status": "fixture", "protocol_alignment": []}
    write_json(os.environ["RWB_OUTPUT_registration"], payload)

if __name__ == "__main__":
    main()
`);
write(path.join(modulesRoot, "prospero-source", "schemas", "registration.json"), json({ type: "object", additionalProperties: true }));

for (const [id, outputName, domain, documentation_url] of [
  ["osf-deposit", "osf_deposit", "api.osf.io", "https://developer.osf.io/"],
  ["zenodo-deposit", "zenodo_deposit", "zenodo.org", "https://developers.zenodo.org/"],
  ["figshare-deposit", "figshare_deposit", "api.figshare.com", "https://docs.figshare.com/"],
]) {
  addPythonModule({
    id,
    name: id.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join(" "),
    description: `Creates a dry-run, archived, or explicit live ${id.replace("-deposit", "")} draft deposit request for the final bundle.`,
    stage: "report",
    determinism: "volatile",
    network: true,
    domains: [domain],
    documentation_url,
    outputs: [{ name: outputName, schema: "schemas/deposit.json", description: "Deposit result or dry-run request.", kind: "structured_data" }],
    inputs: [{ name: "bundle_manifest", schema: "schemas/anything.json", optional: true }],
  }, `
def main():
    params = read_json(os.environ["RWB_PARAMS"])
    payload = {"service": "${id.replace("-deposit", "")}", "dry_run": params.get("dry_run", True), "submit_live": params.get("submit_live", False), "metadata": params.get("metadata", {}), "bundle": read_optional_input("RWB_INPUT_bundle_manifest", {})}
    if params.get("source_mode") == "snapshot":
        payload = read_json(params["snapshot_path"])
    elif not params.get("dry_run", True) and params.get("source_mode") == "live_archived":
        write_json(raw_dir() / "${id}_request.json", payload)
        payload["status"] = "live_submission_requires_module_specific_token_and_explicit_submit"
    else:
        payload["status"] = "dry_run"
    write_json(os.environ["RWB_OUTPUT_${outputName}"], payload)

if __name__ == "__main__":
    main()
`);
  write(path.join(modulesRoot, id, "schemas", "deposit.json"), json({ type: "object", additionalProperties: true }));
}

addPythonModule({
  id: "prospero-submit",
  name: "PROSPERO Submit",
  description: "Generates a manual PROSPERO submission template from a preregistration draft.",
  stage: "report",
  outputs: [{ name: "prospero_submission", schema: "schemas/submission.json", description: "Manual submission template.", kind: "report_text" }],
  inputs: [{ name: "preregistration", schema: "schemas/anything.json", optional: true }],
}, `
def main():
    params = read_json(os.environ["RWB_PARAMS"])
    prereg = read_optional_input("RWB_INPUT_preregistration", {})
    markdown = "# PROSPERO Submission Template\\n\\n" + json.dumps(prereg, indent=2, sort_keys=True)
    write_json(os.environ["RWB_OUTPUT_prospero_submission"], {"markdown": markdown, "requires_manual_submission": True, "template": params.get("template", "prospero")})

if __name__ == "__main__":
    main()
`);
write(path.join(modulesRoot, "prospero-submit", "schemas", "submission.json"), json({ type: "object", required: ["markdown", "requires_manual_submission"], properties: { markdown: { type: "string" }, requires_manual_submission: { type: "boolean" }, template: { type: "string" } }, additionalProperties: false }));

addPythonModule({
  id: "topic-model-py",
  name: "Topic Model Py",
  description: "Clusters abstracts and extracted sections into lightweight deterministic topic buckets for fixture-safe runs.",
  stage: "analyze",
  determinism: "stochastic",
  outputs: [{ name: "topics", schema: "schemas/topics.json", description: "Topic assignments.", kind: "structured_data" }],
  inputs: [{ name: "records", schema: "schemas/records.json", optional: true }, { name: "sections", schema: "schemas/anything.json", optional: true }],
}, `
def main():
    records = read_optional_input("RWB_INPUT_records", [])
    if isinstance(records, dict):
        records = records.get("records", records.get("rows", []))
    topics = []
    for i, record in enumerate(records):
        text = (record.get("title", "") + " " + record.get("abstract", "")).lower()
        label = "methods" if "method" in text else "evidence" if "evidence" in text else "general"
        topics.append({"record_id": str(record.get("record_id") or record.get("id") or i), "topic": label, "score": 1.0})
    write_json(os.environ["RWB_OUTPUT_topics"], {"topics": topics, "method": "fixture_keyword_bucket"})

if __name__ == "__main__":
    main()
`);
write(path.join(modulesRoot, "topic-model-py", "schemas", "topics.json"), json({ type: "object", required: ["topics"], properties: { topics: { type: "array", items: { type: "object" } }, method: { type: "string" } }, additionalProperties: false }));

addPythonModule({
  id: "concept-network-py",
  name: "Concept Network Py",
  description: "Builds deterministic co-occurrence networks from keywords, titles, and extracted entities.",
  stage: "analyze",
  outputs: [{ name: "concept_network", schema: "schemas/concept_network.json", description: "Nodes and weighted edges.", kind: "structured_data" }],
  inputs: [{ name: "records", schema: "schemas/records.json" }],
}, `
def main():
    records = read_json(os.environ["RWB_INPUT_records"])
    edges = {}
    nodes = {}
    for record in records:
        terms = [t.lower() for t in record.get("keywords", [])]
        if not terms:
            terms = [w.strip(".,:;()").lower() for w in record.get("title", "").split() if len(w) > 5][:5]
        for term in terms:
            nodes[term] = nodes.get(term, 0) + 1
        for i in range(len(terms)):
            for j in range(i + 1, len(terms)):
                key = tuple(sorted([terms[i], terms[j]]))
                edges[key] = edges.get(key, 0) + 1
    write_json(os.environ["RWB_OUTPUT_concept_network"], {"nodes": [{"id": k, "count": v} for k, v in sorted(nodes.items())], "edges": [{"source": a, "target": b, "weight": w} for (a, b), w in sorted(edges.items())]})

if __name__ == "__main__":
    main()
`);
write(path.join(modulesRoot, "concept-network-py", "schemas", "concept_network.json"), json({ type: "object", required: ["nodes", "edges"], properties: { nodes: { type: "array" }, edges: { type: "array" } }, additionalProperties: false }));

addPythonModule({
  id: "quality-flags",
  name: "Quality Flags",
  description: "Checks reporting and reproducibility signals such as registration, code availability, and data links.",
  stage: "review",
  outputs: [{ name: "quality_flags", schema: "schemas/quality_flags.json", description: "Quality and methods-reporting flags.", kind: "structured_data" }],
  inputs: [{ name: "records", schema: "schemas/records.json", optional: true }, { name: "registration", schema: "schemas/anything.json", optional: true }],
}, `
def main():
    records = read_optional_input("RWB_INPUT_records", [])
    registration = read_optional_input("RWB_INPUT_registration", {})
    flags = []
    flags.append({"flag": "registration_present", "status": "pass" if registration else "missing"})
    text = json.dumps(records, sort_keys=True).lower()
    flags.append({"flag": "data_availability_mentioned", "status": "pass" if "data" in text else "missing"})
    flags.append({"flag": "code_availability_mentioned", "status": "pass" if "code" in text or "github" in text else "missing"})
    write_json(os.environ["RWB_OUTPUT_quality_flags"], {"flags": flags})

if __name__ == "__main__":
    main()
`);
write(path.join(modulesRoot, "quality-flags", "schemas", "quality_flags.json"), json({ type: "object", required: ["flags"], properties: { flags: { type: "array", items: { type: "object" } } }, additionalProperties: false }));

addPythonModule({
  id: "cover-letter-drafter",
  name: "Cover Letter Drafter",
  description: "Drafts a journal cover letter from manuscript findings for human review.",
  stage: "report",
  determinism: "replayable",
  llm: true,
  hitl: true,
  outputs: [{ name: "cover_letter", schema: "schemas/cover_letter.json", description: "Cover letter markdown.", kind: "report_text" }],
  inputs: [{ name: "manuscript", schema: "schemas/anything.json" }],
  params: { type: "object", properties: { journal: { type: "string", default: "Target journal" }, provider: { type: "string", enum: ["anthropic", "openai", "ollama"], default: "anthropic" }, model: { type: "string", default: "claude-sonnet-4-20250514" } }, additionalProperties: false },
}, `
def main():
    params = read_json(os.environ["RWB_PARAMS"])
    manuscript = read_json(os.environ["RWB_INPUT_manuscript"])
    title = manuscript.get("title", "the submitted manuscript") if isinstance(manuscript, dict) else "the submitted manuscript"
    markdown = f"Dear Editor,\\n\\nPlease consider {title} for publication in {params.get('journal', 'your journal')}. The full reproducibility bundle is available for reviewer verification.\\n\\nSincerely,\\nThe study authors\\n"
    write_json(os.environ["RWB_OUTPUT_cover_letter"], {"markdown": markdown, "requires_review": True})

if __name__ == "__main__":
    main()
`);
write(path.join(modulesRoot, "cover-letter-drafter", "schemas", "cover_letter.json"), json({ type: "object", required: ["markdown", "requires_review"], properties: { markdown: { type: "string" }, requires_review: { type: "boolean" } }, additionalProperties: false }));

addRModule({
  id: "meta-regression-r",
  name: "Meta-regression R",
  description: "Runs a deterministic fixture-safe weighted meta-regression over effect-size rows.",
  stage: "analyze",
  outputs: [{ name: "meta_regression", schema: "schemas/meta_regression.json", description: "Meta-regression coefficients.", kind: "structured_data" }],
  inputs: [{ name: "effects", schema: "schemas/effects.json" }],
}, `
library(jsonlite)
payload <- fromJSON(Sys.getenv("RWB_INPUT_effects"), simplifyVector = FALSE)
rows <- payload$rows
effects <- vapply(rows, function(row) as.numeric(row$effect), numeric(1))
ses <- vapply(rows, function(row) as.numeric(row$se), numeric(1))
x <- seq_along(effects)
fit <- lm(effects ~ x, weights = 1 / (ses ^ 2))
out <- list(coefficients = as.list(signif(coef(fit), 10)), k = length(effects), method = "weighted_lm_fixture")
write(toJSON(out, pretty = TRUE, auto_unbox = TRUE), file = Sys.getenv("RWB_OUTPUT_meta_regression"))
`);
write(path.join(modulesRoot, "meta-regression-r", "schemas", "effects.json"), json({ type: "object", required: ["rows"], properties: { rows: { type: "array", items: { type: "object", required: ["effect", "se"], properties: { effect: { type: "number" }, se: { type: "number" } }, additionalProperties: true } } }, additionalProperties: true }));
write(path.join(modulesRoot, "meta-regression-r", "schemas", "meta_regression.json"), json({ type: "object", required: ["coefficients", "k", "method"], properties: { coefficients: { type: "object" }, k: { type: "integer" }, method: { type: "string" } }, additionalProperties: false }));

addRModule({
  id: "funnel-plot-r",
  name: "Funnel Plot R",
  description: "Computes a funnel plot spec and simple Egger-style asymmetry signal.",
  stage: "analyze",
  outputs: [{ name: "funnel_plot", schema: "schemas/funnel_plot.json", description: "Funnel plot spec.", kind: "figure_spec" }],
  inputs: [{ name: "effects", schema: "schemas/effects.json" }],
}, `
library(jsonlite)
payload <- fromJSON(Sys.getenv("RWB_INPUT_effects"), simplifyVector = FALSE)
rows <- payload$rows
effects <- vapply(rows, function(row) as.numeric(row$effect), numeric(1))
ses <- vapply(rows, function(row) as.numeric(row$se), numeric(1))
precision <- 1 / ses
egger <- if (length(effects) > 2) signif(coef(lm(effects / ses ~ precision))[2], 10) else NA
points <- lapply(seq_along(effects), function(i) list(effect = signif(effects[[i]], 10), se = signif(ses[[i]], 10)))
out <- list(kind = "funnel_plot", points = points, egger_slope = if (is.na(egger)) NULL else egger)
write(toJSON(out, pretty = TRUE, auto_unbox = TRUE, null = "null"), file = Sys.getenv("RWB_OUTPUT_funnel_plot"))
`);
write(path.join(modulesRoot, "funnel-plot-r", "schemas", "effects.json"), json({ type: "object", required: ["rows"], properties: { rows: { type: "array", items: { type: "object", required: ["effect", "se"], properties: { effect: { type: "number" }, se: { type: "number" } }, additionalProperties: true } } }, additionalProperties: true }));
write(path.join(modulesRoot, "funnel-plot-r", "schemas", "funnel_plot.json"), json({ type: "object", required: ["kind", "points"], properties: { kind: { type: "string" }, points: { type: "array" }, egger_slope: { type: ["number", "null"] } }, additionalProperties: false }));
