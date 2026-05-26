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
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def raw_dir():
    target = Path(os.environ.get("RWB_RAW_RESPONSES_DIR") or Path(os.environ["RWB_ARTIFACT_DIR"]) / "raw_responses")
    target.mkdir(parents=True, exist_ok=True)
    return target


def read_optional_input(name, fallback):
    path = os.environ.get(name)
    if path and Path(path).exists():
        return read_json(path)
    return fallback


def main():
    params = read_json(os.environ["RWB_PARAMS"])
    records = read_optional_input("RWB_INPUT_records", [])
    if isinstance(records, dict):
        records = records.get("records", records.get("rows", []))
    if "zotero-export" == "ris-export":
        lines = []
        for record in records:
            lines += ["TY  - JOUR", f"TI  - {record.get('title', '')}", f"PY  - {record.get('publication_year', '')}", f"DO  - {record.get('doi', '')}", "ER  -"]
        payload = {"ris": "\n".join(lines), "count": len(records)}
    elif "zotero-export" == "bibtex-export":
        entries = [f"@article{{record{i},\n  title = {{{r.get('title', '')}}},\n  year = {{{r.get('publication_year', '')}}},\n  doi = {{{r.get('doi', '')}}}\n}}" for i, r in enumerate(records, 1)]
        payload = {"bibtex": "\n\n".join(entries), "count": len(records)}
    else:
        payload = {"dry_run": params.get("dry_run", True), "records": records, "decisions": read_optional_input("RWB_INPUT_decisions", {})}
        if not params.get("dry_run", True) and params.get("source_mode") == "live_archived":
            write_json(raw_dir() / "zotero-export_request.json", payload)
    write_json(os.environ["RWB_OUTPUT_zotero_update_plan"], payload)

if __name__ == "__main__":
    main()

