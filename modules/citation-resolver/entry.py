import json
import os


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


sections = read_json(os.environ["RWB_INPUT_sections"])
records = read_json(os.environ["RWB_INPUT_records"])
index = {str(r.get("doi", "")).lower(): r for r in records if r.get("doi")}
citations = []
for section_record in sections.get("records", []):
    text = json.dumps(section_record.get("sections", {})).lower()
    for doi, record in index.items():
        if doi and doi in text:
            citations.append({"record_id": section_record.get("record_id", ""), "cited_record_id": record.get("record_id") or record.get("id") or "", "doi": doi, "match": "doi"})
write_json(os.environ["RWB_OUTPUT_resolved_citations"], {"citations": citations})
