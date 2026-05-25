import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get("RWB_FIXTURES_DIR", ""), "..", "packages", "module-sdk-py"))
from rwb_sdk import llm_complete, review_request, progress_update, write_json


def main() -> None:
    with open(os.environ["RWB_INPUT_included_records"], "r", encoding="utf-8") as handle:
        records = json.load(handle)
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)

    fields = params.get("fields", [])

    with open(os.path.join(os.path.dirname(__file__), "prompts", "extraction.md"), "r") as f:
        prompt_template = f.read()

    field_descriptions = "\n".join(
        f"- {f['name']}: {f['description']}" for f in fields
    )

    rows = []
    total = len(records)

    for i, record in enumerate(records):
        progress_update(int((i / max(total, 1)) * 100), f"Extracting from record {i + 1}/{total}")

        record_id = record.get("id", record.get("record_id", f"record_{i}"))

        user_content = json.dumps({
            "record_id": record_id,
            "title": record.get("title", ""),
            "abstract": record.get("abstract", ""),
            "full_text": record.get("full_text", ""),
            "fields_to_extract": field_descriptions,
        }, sort_keys=True)

        field_schema = {
            "type": "object",
            "properties": {f["name"]: {"type": "string"} for f in fields},
        }

        try:
            response = llm_complete(
                provider=params.get("provider", "anthropic"),
                model=params.get("model", "claude-sonnet-4-20250514"),
                messages=[
                    {"role": "system", "content": prompt_template},
                    {"role": "user", "content": user_content},
                ],
                schema={
                    "type": "object",
                    "required": ["fields"],
                    "properties": {"fields": field_schema},
                    "additionalProperties": False,
                },
                max_output_tokens=500,
            )
            parsed = json.loads(response.get("text", "{}"))
            extracted_fields = parsed.get("fields", {})
        except Exception as exc:
            extracted_fields = {"error": str(exc)}

        requires_review = not all(
            f["name"] in extracted_fields and extracted_fields[f["name"]]
            for f in fields
        )

        row = {
            "record_id": record_id,
            "fields": extracted_fields,
            "requires_review": requires_review,
        }

        if requires_review:
            review_request(
                payload={"record": record, "extraction": row},
                schema={
                    "type": "object",
                    "required": ["accepted"],
                    "properties": {
                        "accepted": {"type": "boolean"},
                        "corrected_fields": field_schema,
                        "reviewer_rationale": {"type": "string"},
                    },
                },
            )

        rows.append(row)

    progress_update(100, f"Extracted from {total} records")
    write_json(os.environ["RWB_OUTPUT_extractions"], {"rows": rows})


if __name__ == "__main__":
    main()
