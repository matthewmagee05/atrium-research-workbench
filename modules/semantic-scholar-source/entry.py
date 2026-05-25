import json
import os
import urllib.parse
import urllib.request
from pathlib import Path


def read_json(path: Path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, value) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


S2_FIELDS = ",".join([
    "paperId", "externalIds", "title", "abstract", "year",
    "authors", "venue", "publicationDate", "citationCount",
    "referenceCount", "isOpenAccess",
])


def main() -> None:
    params = read_json(Path(os.environ["RWB_PARAMS"]))
    mode = params.get("source_mode", "fixture")
    if mode == "fixture":
        fixture_id = params.get("fixture_id", "tiny-corpus")
        records = read_json(Path(os.environ["RWB_FIXTURES_DIR"]) / fixture_id / "records.json")
    elif mode == "snapshot":
        records = read_json(Path(params["snapshot_path"]))
    elif mode == "live_archived":
        query = params.get("query", "")
        max_records = min(int(params.get("max_records", 25)), 100)
        query_params: dict[str, str] = {
            "query": query,
            "limit": str(max_records),
            "fields": S2_FIELDS,
        }
        url = "https://api.semanticscholar.org/graph/v1/paper/search?" + urllib.parse.urlencode(query_params)
        headers: dict[str, str] = {}
        api_key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
        if api_key:
            headers["x-api-key"] = api_key
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        raw_dir = Path(os.environ["RWB_ARTIFACT_DIR"]) / "raw_responses"
        raw_dir.mkdir(parents=True, exist_ok=True)
        write_json(str(raw_dir / "s2_query_1.json"), payload)
        records = payload.get("data", [])
    else:
        raise ValueError(f"Unsupported source_mode: {mode}")
    records = sorted(records, key=lambda record: str(record.get("paperId", record.get("id", ""))))
    write_json(os.environ["RWB_OUTPUT_records"], records)


if __name__ == "__main__":
    main()
