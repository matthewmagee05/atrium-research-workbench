import json
import os
from collections import Counter


with open(os.environ["RWB_INPUT_screening_decisions"], "r", encoding="utf-8") as handle:
    payload = json.load(handle)
counts = Counter(row["recommendation"] for row in payload.get("decisions", []))
flow = {
    "identified": len(payload.get("decisions", [])),
    "screened": len(payload.get("decisions", [])),
    "included": counts.get("include", 0),
    "excluded": counts.get("exclude", 0),
    "uncertain": counts.get("uncertain", 0),
}
with open(os.environ["RWB_OUTPUT_prisma_flow"], "w", encoding="utf-8", newline="\n") as handle:
    json.dump(flow, handle, indent=2, sort_keys=True)
    handle.write("\n")
