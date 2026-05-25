import json
import os
import urllib.request
from typing import Any


def _call(operation: str, payload: dict[str, Any]) -> dict[str, Any]:
    base = os.environ.get("RWB_PROXY_SOCKET")
    if not base:
        raise RuntimeError("RWB_PROXY_SOCKET is not configured")
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base.rstrip('/')}/{operation}",
        data=data,
        method="POST",
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def llm_complete(provider: str, model: str, messages: list[dict[str, str]], schema: dict[str, Any] | None = None, max_output_tokens: int | None = None) -> dict[str, Any]:
    return _call(
        "llm.complete",
        {
            "binding": {"provider": provider, "model_id": model},
            "messages": messages,
            "schema": schema,
            "max_output_tokens": max_output_tokens,
        },
    )


def journal_note(text: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    return _call("journal.note", {"text": text, "metadata": metadata or {}})


def review_request(payload: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    return _call("review.request", {"payload": payload, "schema": schema})


def progress_update(percent: int, message: str) -> dict[str, Any]:
    return _call("progress.update", {"percent": percent, "message": message})


def artifact_read_metadata(artifact_id: str) -> dict[str, Any]:
    return _call("artifact.read_metadata", {"artifact_id": artifact_id})
