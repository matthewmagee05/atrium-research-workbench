import json
import os
from pathlib import Path


def main() -> None:
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)
    fixture_id = params["fixture_id"]
    fixture_path = Path(os.environ["RWB_FIXTURES_DIR"]) / fixture_id / "records.json"
    with open(fixture_path, "r", encoding="utf-8") as handle:
        records = json.load(handle)
    records = sorted(records, key=lambda record: record.get("id", ""))
    with open(os.environ["RWB_OUTPUT_records"], "w", encoding="utf-8", newline="\n") as handle:
        json.dump(records, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()
