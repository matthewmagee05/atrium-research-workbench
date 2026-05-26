import json
import os
from pathlib import Path


DESCRIPTIONS = [
    "Title identifies the report as a systematic review.",
    "Abstract uses a structured summary.",
    "Rationale is described.",
    "Objectives or questions are explicit.",
    "Eligibility criteria are specified.",
    "Information sources are specified.",
    "Search strategy is reproducible.",
    "Selection process is described.",
    "Data collection process is described.",
    "Data items are listed.",
    "Risk of bias assessment is described.",
    "Effect measures are specified.",
    "Synthesis methods are described.",
    "Reporting bias assessment is described.",
    "Certainty assessment is described.",
    "Study selection results are shown.",
    "Study characteristics are shown.",
    "Risk of bias results are shown.",
    "Results of individual studies are shown.",
    "Synthesis results are shown.",
    "Reporting bias results are shown.",
    "Certainty of evidence is shown.",
    "Discussion interprets findings.",
    "Registration information is provided.",
    "Protocol access is provided.",
    "Funding is reported.",
    "Competing interests are reported.",
]


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def maybe_input(name):
    path = os.environ.get(name)
    if path and Path(path).exists():
        return read_json(path)
    return None


def main():
    params = read_json(os.environ["RWB_PARAMS"])
    if params.get("source_mode") == "snapshot":
        write_json(os.environ["RWB_OUTPUT_prisma_checklist"], read_json(params["snapshot_path"]))
        return
    flow = maybe_input("RWB_INPUT_prisma_flow")
    manuscript = maybe_input("RWB_INPUT_manuscript")
    manuscript_text = json.dumps(manuscript or {}, sort_keys=True).lower()
    items = []
    for idx, description in enumerate(DESCRIPTIONS, start=1):
        evidence = []
        if idx == 16 and flow:
            evidence.append("prisma_flow artifact present")
        if any(term in manuscript_text for term in description.lower().split()[:3]):
            evidence.append("manuscript text mentions this topic")
        status = "complete" if evidence else "missing"
        items.append({"item": str(idx), "description": description, "status": status, "evidence": evidence})
    write_json(os.environ["RWB_OUTPUT_prisma_checklist"], {"standard": params.get("reporting_standard", "PRISMA 2020"), "items": items})


if __name__ == "__main__":
    main()
