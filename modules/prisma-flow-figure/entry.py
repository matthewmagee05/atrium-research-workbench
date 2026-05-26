import json
import os


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


params = read_json(os.environ["RWB_PARAMS"])
flow = read_json(os.environ["RWB_INPUT_prisma_flow"])
title = params.get("title", "PRISMA 2020 Flow Diagram")
labels = [
    ("Identified", flow.get("identified", 0)),
    ("Screened", flow.get("screened", 0)),
    ("Excluded", flow.get("excluded", 0)),
    ("Included", flow.get("included", 0)),
]
boxes = []
for i, (label, value) in enumerate(labels):
    y = 30 + i * 70
    boxes.append(f"<rect x=\"20\" y=\"{y}\" width=\"260\" height=\"44\" fill=\"#f5f9f7\" stroke=\"#1d5f55\"/><text x=\"34\" y=\"{y + 26}\" font-size=\"14\">{label}: {value}</text>")
svg = f"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"340\"><text x=\"20\" y=\"20\" font-size=\"16\">{title}</text>{''.join(boxes)}</svg>"
write_json(os.environ["RWB_OUTPUT_prisma_flow_figure"], {"kind": "prisma_flow", "title": title, "svg": svg, "data": flow})
