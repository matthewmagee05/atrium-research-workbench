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

