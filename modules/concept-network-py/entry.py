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

