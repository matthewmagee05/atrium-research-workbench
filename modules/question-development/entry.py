import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get("RWB_FIXTURES_DIR", ""), "..", "packages", "module-sdk-py"))
from rwb_sdk import llm_complete, review_request, progress_update, write_json


def main() -> None:
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)

    topic = params.get("topic", "").strip()
    if not topic:
        raise ValueError("question-development requires a 'topic' parameter")

    max_questions = int(params.get("max_questions", 5))

    with open(os.path.join(os.path.dirname(__file__), "prompts", "question_development.md"), "r", encoding="utf-8") as f:
        prompt = f.read()

    progress_update(10, "Generating candidate questions")

    schema = {
        "type": "object",
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["text", "rationale"],
                    "properties": {
                        "text": {"type": "string"},
                        "rationale": {"type": "string"},
                    },
                    "additionalProperties": False,
                },
            },
        },
        "additionalProperties": False,
    }

    user_payload = {
        "topic": topic,
        "max_questions": max_questions,
        "instructions": "Generate diverse, focused, testable research questions about the topic.",
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
            max_output_tokens=2000,
        )
        parsed = json.loads(response.get("text", "{}"))
        raw_questions = parsed.get("questions", [])
    except Exception as exc:
        progress_update(50, f"LLM call failed; emitting placeholder. Reason: {exc}")
        raw_questions = [
            {"text": f"What evidence exists about: {topic}?", "rationale": "Fallback placeholder; LLM unavailable."}
        ]

    questions = []
    for i, q in enumerate(raw_questions[:max_questions]):
        text = (q.get("text") or "").strip()
        rationale = (q.get("rationale") or "").strip()
        if not text:
            continue
        question = {
            "text": text,
            "rationale": rationale or "(no rationale provided)",
            "requires_review": True,
        }
        questions.append(question)
        review_request(
            payload={"question_index": i, "candidate": question},
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

    progress_update(100, f"Generated {len(questions)} candidate questions")
    write_json(os.environ["RWB_OUTPUT_questions"], {"questions": questions})


if __name__ == "__main__":
    main()
