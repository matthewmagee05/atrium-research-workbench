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

