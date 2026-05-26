import json
import os
import re


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


params = read_json(os.environ["RWB_PARAMS"])
if params.get("source_mode") == "snapshot":
    write_json(os.environ["RWB_OUTPUT_tables"], read_json(params["snapshot_path"]))
else:
    payload = read_json(os.environ["RWB_INPUT_sections"])
    tables = []
    for record in payload.get("records", []):
        text = "\n".join(str(v) for v in record.get("sections", {}).values())
        sample = re.search(r"sample size\s+(\d+)", text, re.I)
        effect = re.search(r"effect size\s+(-?\d+(?:\.\d+)?)", text, re.I)
        if sample or effect:
            tables.append({
                "record_id": record.get("record_id", ""),
                "caption": "Auto-extracted study characteristics",
                "rows": [{"sample_size": int(sample.group(1)) if sample else None, "effect": float(effect.group(1)) if effect else None}],
                "requires_review": True,
            })
    write_json(os.environ["RWB_OUTPUT_tables"], {"tables": tables})
