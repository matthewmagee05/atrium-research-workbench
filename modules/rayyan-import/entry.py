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


def parse_ris(text):
    records = []
    current = {}
    authors = []
    for line in text.splitlines():
        if len(line) < 6 or "  - " not in line:
            continue
        tag, value = line[:2], line[6:].strip()
        if tag == "TY":
            current = {"source": "rayyan-import"}
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
        if "rayyan-import" == "endnote-xml-source":
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

