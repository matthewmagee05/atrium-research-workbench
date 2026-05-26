import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get("RWB_FIXTURES_DIR", ""), "..", "packages", "module-sdk-py"))
from rwb_sdk import llm_complete, review_request, progress_update, write_json


def main() -> None:
    with open(os.environ["RWB_INPUT_questions"], "r", encoding="utf-8") as handle:
        question_payload = json.load(handle)
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)

    max_hypotheses = int(params.get("max_hypotheses", 5))
    questions = question_payload.get("questions", [])
    if not questions:
        raise ValueError("hypothesis-drafter requires at least one question")

    with open(os.path.join(os.path.dirname(__file__), "prompts", "hypothesis_draft.md"), "r", encoding="utf-8") as f:
        prompt = f.read()

    schema = {
        "type": "object",
        "required": ["hypotheses"],
        "properties": {
            "hypotheses": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["text", "variables", "assumptions"],
                    "properties": {
                        "text": {"type": "string"},
                        "variables": {"type": "array", "items": {"type": "string"}},
                        "assumptions": {"type": "array", "items": {"type": "string"}},
                    },
                    "additionalProperties": False,
                },
            },
        },
        "additionalProperties": False,
    }

    progress_update(10, "Drafting hypotheses")

    user_payload = {
        "questions": [q.get("text", "") for q in questions if q.get("text")],
        "max_hypotheses": max_hypotheses,
    }

    try:
        response = llm_complete(
            provider=params.get("provider", "anthropic"),
            model=params.get("model", "claude-sonnet-4-20250514"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(user_payload, sort_keys=True)},
            ],
            schema=schema,
            max_output_tokens=3000,
        )
        parsed = json.loads(response.get("text", "{}"))
        raw_hypotheses = parsed.get("hypotheses", [])
    except Exception as exc:
        progress_update(50, f"LLM call failed; emitting conservative fallback hypotheses. Reason: {exc}")
        raw_hypotheses = [
            {
                "text": f"The evidence base contains extractable variables relevant to: {q.get('text', '')}",
                "variables": ["record_id", "study_design", "population_or_context", "outcome_or_finding"],
                "assumptions": ["Offline fallback generated because the LLM provider was unavailable; researcher review is required before preregistration."],
            }
            for q in questions[:max_hypotheses]
        ]

    hypotheses = []
    for i, h in enumerate(raw_hypotheses[:max_hypotheses]):
        text = (h.get("text") or "").strip()
        if not text:
            continue
        hypothesis = {
            "text": text,
            "variables": h.get("variables") or [],
            "assumptions": h.get("assumptions") or [],
            "requires_review": True,
        }
        hypotheses.append(hypothesis)
        review_request(
            payload={"hypothesis_index": i, "candidate": hypothesis},
            schema={
                "type": "object",
                "required": ["accepted"],
                "properties": {
                    "accepted": {"type": "boolean"},
                    "revised_text": {"type": "string"},
                    "reviewer_rationale": {"type": "string"},
                },
            },
        )

    progress_update(100, f"Drafted {len(hypotheses)} hypotheses")
    write_json(os.environ["RWB_OUTPUT_hypotheses"], {"hypotheses": hypotheses})


if __name__ == "__main__":
    main()
