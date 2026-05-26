import json
import os
from pathlib import Path


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def fixture_tei(pdf):
    doi = pdf.get("doi", "")
    rid = pdf.get("record_id", "")
    sections = [
        {"title": "Methods", "text": f"Fixture methods for {doi}. Sample size 100. Pairwise comparison."},
        {"title": "Results", "text": f"Fixture results for {doi}. Effect size 0.20 with standard error 0.05."},
        {"title": "Discussion", "text": "Fixture discussion notes limitations and reproducibility."},
    ]
    body = "".join(f"<div><head>{s['title']}</head><p>{s['text']}</p></div>" for s in sections)
    return {
        "record_id": str(rid),
        "doi": doi,
        "tei_xml": f"<TEI><teiHeader><idno type=\"DOI\">{doi}</idno></teiHeader><text><body>{body}</body></text></TEI>",
        "sections": sections,
        "grobid_status": "fixture",
    }


def main():
    params = read_json(os.environ["RWB_PARAMS"])
    mode = params.get("source_mode", "fixture")
    if mode == "snapshot":
        write_json(os.environ["RWB_OUTPUT_tei_documents"], read_json(params["snapshot_path"]))
        return
    manifest = read_json(os.environ["RWB_INPUT_pdf_manifest"])
    documents = [fixture_tei(pdf) for pdf in manifest.get("pdfs", []) if pdf.get("downloaded", True)]
    write_json(os.environ["RWB_OUTPUT_tei_documents"], {"documents": documents})


if __name__ == "__main__":
    main()
