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

