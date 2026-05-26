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
spec = read_json(os.environ["RWB_INPUT_forest_plot_spec"])
title = params.get("title", "Forest plot")
studies = spec.get("studies", [])
height = 80 + len(studies) * 28
rows = []
for i, study in enumerate(studies):
    y = 50 + i * 28
    effect = float(study.get("effect", 0))
    x = 170 + effect * 80
    rows.append(f"<text x=\"20\" y=\"{y}\" font-size=\"11\">{study.get('label', study.get('record_id', 'study'))}</text><circle cx=\"{x:.1f}\" cy=\"{y - 4}\" r=\"4\" fill=\"#1d5f55\"/>")
summary = spec.get("summary", {})
svg = f"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"420\" height=\"{height}\"><text x=\"20\" y=\"24\" font-size=\"16\">{title}</text><line x1=\"170\" x2=\"170\" y1=\"36\" y2=\"{height - 20}\" stroke=\"#888\"/>{''.join(rows)}<text x=\"20\" y=\"{height - 12}\" font-size=\"11\">Pooled: {summary.get('pooled_effect', 'n/a')}</text></svg>"
write_json(os.environ["RWB_OUTPUT_forest_plot_figure"], {"kind": "forest_plot", "title": title, "svg": svg, "data": spec})
