import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get("RWB_FIXTURES_DIR", ""), "..", "packages", "module-sdk-py"))
from rwb_sdk import llm_complete, review_request, progress_update, write_json


def main() -> None:
    with open(os.environ["RWB_INPUT_hypotheses"], "r", encoding="utf-8") as handle:
        hypothesis_payload = json.load(handle)
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)

    hypotheses = hypothesis_payload.get("hypotheses", [])
    if not hypotheses:
        raise ValueError("preregistration-generator requires at least one reviewed hypothesis")

    template = params.get("template", "osf-standard")

    with open(os.path.join(os.path.dirname(__file__), "prompts", "preregistration.md"), "r", encoding="utf-8") as f:
        prompt = f.read()

    schema = {
        "type": "object",
        "required": ["markdown"],
        "properties": {"markdown": {"type": "string"}},
        "additionalProperties": False,
    }

    progress_update(15, "Drafting preregistration document")

    user_payload = {
        "template": template,
        "hypotheses": hypotheses,
        "instructions": "Draft a complete preregistration in markdown covering: background, hypotheses, design, methods, analysis plan, and threats to validity.",
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
            max_output_tokens=8000,
        )
        parsed = json.loads(response.get("text", "{}"))
        markdown = (parsed.get("markdown") or "").strip()
    except Exception as exc:
        progress_update(50, f"LLM call failed; emitting fallback. Reason: {exc}")
        bullets = "\n".join(
            f"- {h.get('text', '')}" for h in hypotheses if h.get("text")
        )
        markdown = (
            f"# Preregistration (fallback)\n\n"
            f"_LLM unavailable: {exc}_\n\n"
            f"## Hypotheses\n\n{bullets}\n\n"
            f"## Design\n\nResearcher to complete.\n\n"
            f"## Analysis plan\n\nResearcher to complete.\n"
        )

    if not markdown:
        markdown = "# Preregistration (empty)\n\nNo content returned by LLM."

    output = {"markdown": markdown, "requires_review": True}

    review_request(
        payload={"preregistration_excerpt": markdown[:2000]},
        schema={
            "type": "object",
            "required": ["accepted"],
            "properties": {
                "accepted": {"type": "boolean"},
                "reviewer_rationale": {"type": "string"},
            },
        },
    )

    progress_update(100, "Preregistration draft ready for review")
    write_json(os.environ["RWB_OUTPUT_preregistration"], output)


if __name__ == "__main__":
    main()
