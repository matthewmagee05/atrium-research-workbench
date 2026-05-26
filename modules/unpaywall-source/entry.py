import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def normalize_doi(value):
    if not value:
        return ""
    doi = str(value).strip()
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi, flags=re.I)
    return doi.lower()


def load_input_records(params):
    input_path = os.environ.get("RWB_INPUT_records")
    if input_path and Path(input_path).exists():
        return read_json(input_path)
    fixture_id = params.get("fixture_id", "tiny-corpus")
    return read_json(Path(os.environ["RWB_FIXTURES_DIR"]) / fixture_id / "records.json")


def record_id(record):
    return str(record.get("record_id") or record.get("id") or record.get("DOI") or record.get("doi") or "")


def fixture_links(records, max_records):
    links = []
    for record in records[:max_records]:
        doi = normalize_doi(record.get("doi") or record.get("DOI"))
        if not doi:
            continue
        slug = doi.replace("/", "_")
        links.append({
            "record_id": record_id(record),
            "doi": doi,
            "is_oa": True,
            "pdf_url": f"fixture://pdf/{slug}.pdf",
            "landing_page_url": f"fixture://landing/{slug}",
            "license": "cc-by",
            "source": "fixture",
        })
    return links


def live_link(doi, email, raw_dir):
    url = "https://api.unpaywall.org/v2/" + urllib.parse.quote(doi) + "?" + urllib.parse.urlencode({"email": email})
    with urllib.request.urlopen(url, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    write_json(raw_dir / f"unpaywall_{doi.replace('/', '_')}.json", payload)
    best = payload.get("best_oa_location") or {}
    is_oa = bool(payload.get("is_oa"))
    return {
        "doi": doi,
        "is_oa": is_oa,
        "pdf_url": best.get("url_for_pdf") if is_oa else None,
        "landing_page_url": best.get("url") if is_oa else None,
        "license": best.get("license") if is_oa else None,
        "source": "unpaywall",
    }


def main():
    params = read_json(os.environ["RWB_PARAMS"])
    mode = params.get("source_mode", "fixture")
    max_records = int(params.get("max_records", 50))
    if mode == "snapshot":
        output = read_json(params["snapshot_path"])
        write_json(os.environ["RWB_OUTPUT_full_text_links"], output)
        return
    records = load_input_records(params)
    if mode == "fixture":
        links = fixture_links(records, max_records)
    elif mode == "live_archived":
        email = params.get("email") or os.environ.get("RWB_UNPAYWALL_EMAIL")
        if not email:
            raise ValueError("live_archived mode requires params.email or RWB_UNPAYWALL_EMAIL")
        raw_dir = Path(os.environ.get("RWB_RAW_RESPONSES_DIR") or Path(os.environ["RWB_ARTIFACT_DIR"]) / "raw_responses")
        raw_dir.mkdir(parents=True, exist_ok=True)
        links = []
        for record in records[:max_records]:
            doi = normalize_doi(record.get("doi") or record.get("DOI"))
            if not doi:
                continue
            link = live_link(doi, email, raw_dir)
            link["record_id"] = record_id(record)
            links.append(link)
    else:
        raise ValueError(f"Unsupported source_mode: {mode}")
    write_json(os.environ["RWB_OUTPUT_full_text_links"], {"links": links})


if __name__ == "__main__":
    main()
