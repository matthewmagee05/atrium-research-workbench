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
        library_type = params.get("library_type", "users")
        library_id = params["library_id"]
        collection = params.get("collection_id")
        path_part = f"/collections/{collection}/items/top" if collection else "/items/top"
        url = f"https://api.zotero.org/{library_type}/{library_id}{path_part}?" + urllib.parse.urlencode({"limit": str(params.get("max_records", 100)), "format": "json"})
        headers = {"Zotero-API-Version": "3"}
        token = params.get("api_key") or os.environ.get("RWB_ZOTERO_API_KEY")
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
