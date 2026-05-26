import json
import os


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def judgement(fields):
    text = json.dumps(fields, sort_keys=True).lower()
    if "random" in text and "blinding" in text:
        return "some_concerns"
    if "random" in text:
        return "some_concerns"
    return "high"


def main():
    params = read_json(os.environ["RWB_PARAMS"])
    if params.get("source_mode") == "snapshot":
        write_json(os.environ["RWB_OUTPUT_rob_assessments"], read_json(params["snapshot_path"]))
        return
    payload = read_json(os.environ["RWB_INPUT_extractions"])
    tool = params.get("tool", "rob2")
    assessments = []
    domains = ["randomization", "deviations", "missing_data", "measurement", "selection"]
    for row in payload.get("rows", []):
        fields = row.get("fields", {})
        overall = judgement(fields)
        assessments.append({
            "record_id": str(row.get("record_id", "")),
            "tool": tool,
            "overall": overall,
            "domains": [{"domain": d, "judgement": overall, "support": "Auto-suggested from extracted fields."} for d in domains],
            "rationale": "Structured suggestion only; human adjudication required before use.",
            "requires_review": True,
        })
    write_json(os.environ["RWB_OUTPUT_rob_assessments"], {"assessments": assessments})


if __name__ == "__main__":
    main()
