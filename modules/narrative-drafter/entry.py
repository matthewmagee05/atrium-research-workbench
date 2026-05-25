import json
import os
import urllib.request


def write_json(path: str, value) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def proxy_call(operation, payload):
    base = os.environ["RWB_PROXY_SOCKET"].rstrip("/")
    request = urllib.request.Request(
        f"{base}/{operation}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    with open(os.environ["RWB_INPUT_summary"], "r", encoding="utf-8") as handle:
        summary = json.load(handle)
    with open(os.environ["RWB_PARAMS"], "r", encoding="utf-8") as handle:
        params = json.load(handle)
    provider = params.get("provider")
    model = params.get("model")
    if provider and model:
        response = proxy_call(
            "llm.complete",
            {
                "binding": {"provider": provider, "model_id": model},
                "messages": [
                    {"role": "system", "content": "Draft concise manuscript results text from structured bibliometric summary data."},
                    {"role": "user", "content": json.dumps(summary, sort_keys=True)},
                ],
                "max_output_tokens": 800,
            },
        )
        draft_text = response.get("text", "")
    else:
        draft_text = (
            "## Results\n\n"
            f"The analyzed corpus contained {summary.get('records_total')} records. "
            "This offline fallback draft exists so the module contract can be validated without credentials."
        )
    write_json(os.environ["RWB_OUTPUT_draft"], {"markdown": draft_text})
    write_json(
        os.environ["RWB_OUTPUT_claims"],
        {
            "claims": [
                {
                    "claim_id": "claim_001",
                    "text": f"The analyzed corpus contained {summary.get('records_total')} records.",
                    "section": "results",
                    "supported_by": [],
                    "record_ids": [],
                    "status": "ungrounded_requires_review",
                }
            ]
        },
    )


if __name__ == "__main__":
    main()
