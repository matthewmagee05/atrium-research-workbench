import json
import os


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def bucket(title):
    text = (title or "").lower()
    if "method" in text:
        return "methods"
    if "result" in text or "finding" in text:
        return "results"
    if "discussion" in text or "conclusion" in text:
        return "discussion"
    return "other"


def main():
    params = read_json(os.environ["RWB_PARAMS"])
    if params.get("source_mode") == "snapshot":
        write_json(os.environ["RWB_OUTPUT_sections"], read_json(params["snapshot_path"]))
        return
    payload = read_json(os.environ["RWB_INPUT_tei_documents"])
    wanted = set(params.get("sections", ["methods", "results", "discussion"]))
    records = []
    for doc in payload.get("documents", []):
        sections = {}
        for section in doc.get("sections", []):
            key = bucket(section.get("title"))
            if key in wanted:
                sections[key] = (sections.get(key, "") + "\n" + section.get("text", "")).strip()
        records.append({"record_id": str(doc.get("record_id", "")), "doi": doc.get("doi", ""), "sections": sections})
    write_json(os.environ["RWB_OUTPUT_sections"], {"records": records})


if __name__ == "__main__":
    main()
