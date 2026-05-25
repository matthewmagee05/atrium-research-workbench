import json
import os
import re


def write_json(path: str, value) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def main() -> None:
    with open(os.environ["RWB_INPUT_normalized"], "r", encoding="utf-8") as handle:
        records = json.load(handle)
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)
    doi_match = bool(params.get("doi_match", True))
    seen = set()
    included = []
    excluded = []
    reasons = {}
    for record in sorted(records, key=lambda item: item["record_id"]):
        key = f"doi:{record.get('doi')}" if doi_match and record.get("doi") else f"title:{title_key(record.get('title', ''))}"
        if key in seen:
            excluded.append(record["record_id"])
            reasons[record["record_id"]] = f"duplicate:{key}"
            continue
        seen.add(key)
        included.append(record)
    lock = {
        "corpus_id": "computed-by-core-artifact-id",
        "produced_by": {"node_id": os.environ.get("RWB_NODE_ID"), "module": "deterministic-dedupe@1.0.0"},
        "produced_at": "1970-01-01T00:00:00.000Z",
        "source_provenance": [],
        "normalization": {"module": "record-normalizer@1.0.0", "records_in": len(records), "records_out": len(records)},
        "dedup_decisions": {"module": "deterministic-dedupe@1.0.0", "duplicates_removed": len(excluded)},
        "included_record_ids": [record["record_id"] for record in included],
        "excluded_record_ids": excluded,
        "exclusion_reasons": reasons,
        "final_record_count": len(included),
    }
    write_json(os.environ["RWB_OUTPUT_deduped"], included)
    write_json(os.environ["RWB_OUTPUT_corpus_lock"], lock)


if __name__ == "__main__":
    main()
