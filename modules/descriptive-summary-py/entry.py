import json
import os
from collections import Counter
from typing import Any


def present(value: Any) -> bool:
    return value is not None and value != "" and value != []


def stable_value(value: Any) -> str:
    if isinstance(value, list):
        return "; ".join(str(item) for item in value)
    return str(value)


def main() -> None:
    with open(os.environ["RWB_INPUT_normalized"], "r", encoding="utf-8") as handle:
        records = json.load(handle)
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)
    fields = params.get("summary_fields", [])
    summaries = {}
    for field in fields:
        values = [record.get(field) for record in records]
        missing = sum(1 for value in values if not present(value))
        distribution = Counter(stable_value(value) for value in values if present(value))
        summaries[field] = {
            "missing": missing,
            "present": len(records) - missing,
            "distribution": dict(sorted(distribution.items(), key=lambda item: item[0])),
        }
    output = {
        "records_total": len(records),
        "summary_fields": fields,
        "fields": summaries,
    }
    with open(os.environ["RWB_OUTPUT_summary"], "w", encoding="utf-8", newline="\n") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()
