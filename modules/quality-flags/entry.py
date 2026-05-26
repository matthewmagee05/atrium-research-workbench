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

