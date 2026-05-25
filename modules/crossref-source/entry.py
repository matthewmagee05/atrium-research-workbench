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
        filters = params.get("filters", {})
        max_records = int(params.get("max_records", 25))
        query_params: dict[str, str] = {"rows": str(max_records)}
        if query:
            query_params["query"] = query
        if filters:
            query_params["filter"] = ",".join(
                f"{key}:{value}" for key, value in sorted(filters.items())
            )
        url = "https://api.crossref.org/works?" + urllib.parse.urlencode(query_params)
        headers = {"User-Agent": "ResearchWorkbench/0.1 (https://github.com/research-workbench)"}
        mailto = os.environ.get("RWB_CROSSREF_EMAIL")
        if mailto:
            headers["User-Agent"] += f" (mailto:{mailto})"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        raw_dir = Path(os.environ["RWB_ARTIFACT_DIR"]) / "raw_responses"
        raw_dir.mkdir(parents=True, exist_ok=True)
        write_json(str(raw_dir / "crossref_query_1.json"), payload)
        records = payload.get("message", {}).get("items", [])
    else:
        raise ValueError(f"Unsupported source_mode: {mode}")
    records = sorted(records, key=lambda record: str(record.get("DOI", record.get("doi", ""))))
    write_json(os.environ["RWB_OUTPUT_records"], records)


if __name__ == "__main__":
    main()
