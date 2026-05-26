import json
import os


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def main():
    params = read_json(os.environ["RWB_PARAMS"])
    if params.get("source_mode") == "snapshot":
        write_json(os.environ["RWB_OUTPUT_grade_table"], read_json(params["snapshot_path"]))
        return
    meta = read_json(os.environ["RWB_INPUT_meta_summary"])
    rob = read_json(os.environ["RWB_INPUT_rob_assessments"])
    high_count = sum(1 for row in rob.get("assessments", []) if row.get("overall") == "high")
    certainty = "low" if high_count else "moderate"
    reasons = ["Risk of bias concerns"] if high_count else ["No automatic downgrade applied"]
    write_json(os.environ["RWB_OUTPUT_grade_table"], {
        "outcomes": [{
            "outcome": params.get("outcome", "Primary outcome"),
            "certainty": certainty,
            "reasons": reasons,
            "effect": meta,
            "requires_review": True,
        }]
    })


if __name__ == "__main__":
    main()
