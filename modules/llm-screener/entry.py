import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get("RWB_FIXTURES_DIR", ""), "..", "packages", "module-sdk-py"))
from rwb_sdk import llm_complete, review_request, progress_update, write_json


def main() -> None:
    with open(os.environ["RWB_INPUT_records"], "r", encoding="utf-8") as handle:
        records = json.load(handle)
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)

    inclusion = params.get("inclusion_criteria", [])
    exclusion = params.get("exclusion_criteria", [])
    threshold = params.get("confidence_threshold", 0.7)

    with open(os.path.join(os.path.dirname(__file__), "prompts", "screening.md"), "r") as f:
        prompt_template = f.read()

    decisions = []
    total = len(records)

    for i, record in enumerate(records):
        progress_update(int((i / max(total, 1)) * 100), f"Screening record {i + 1}/{total}")

        title = record.get("title", "")
        abstract = record.get("abstract", "")
        record_id = record.get("id", record.get("record_id", f"record_{i}"))

        user_content = json.dumps({
            "record_id": record_id,
            "title": title,
            "abstract": abstract,
            "inclusion_criteria": inclusion,
            "exclusion_criteria": exclusion,
        }, sort_keys=True)

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
                    "required": ["recommendation", "confidence", "rationale"],
                    "properties": {
                        "recommendation": {"type": "string", "enum": ["include", "exclude", "uncertain"]},
                        "confidence": {"type": "number"},
                        "rationale": {"type": "string"},
                    },
                    "additionalProperties": False,
                },
                max_output_tokens=300,
            )
            parsed = json.loads(response.get("text", "{}"))
            recommendation = parsed.get("recommendation", "uncertain")
            confidence = parsed.get("confidence", 0.0)
            rationale = parsed.get("rationale", "")
        except Exception as exc:
            recommendation = "uncertain"
            confidence = 0.0
            rationale = f"LLM call failed: {exc}"

        requires_review = confidence < threshold or recommendation == "uncertain"

        decision = {
            "record_id": record_id,
            "recommendation": recommendation,
            "confidence": confidence,
            "rationale": rationale,
            "requires_review": requires_review,
        }

        if requires_review:
            review_request(
                payload={"record": record, "decision": decision},
                schema={
                    "type": "object",
                    "required": ["accepted", "override_recommendation"],
                    "properties": {
                        "accepted": {"type": "boolean"},
                        "override_recommendation": {"type": "string", "enum": ["include", "exclude", "uncertain"]},
                        "reviewer_rationale": {"type": "string"},
                    },
                },
            )

        decisions.append(decision)

    progress_update(100, f"Screened {total} records")
    write_json(os.environ["RWB_OUTPUT_screening_decisions"], {"decisions": decisions})


if __name__ == "__main__":
    main()
