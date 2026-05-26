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
    if mode == "snapshot":
        payload = read_json(params["snapshot_path"])
    else:
        payload = {"registration_id": params.get("registration_id", "CRD000000000"), "status": "fixture", "protocol_alignment": []}
    write_json(os.environ["RWB_OUTPUT_registration"], payload)

if __name__ == "__main__":
    main()

