import json
import os
import urllib.request


def call(operation, payload):
    base = os.environ["RWB_PROXY_SOCKET"].rstrip("/")
    request = urllib.request.Request(
        f"{base}/{operation}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


call("progress.update", {"percent": 50, "message": "proxy smoke"})
call("journal.note", {"text": "Proxy smoke journal entry", "metadata": {"module": "proxy-smoke"}})
review = call("review.request", {"payload": {"needs_review": True}, "schema": {"type": "object"}})

with open(os.environ["RWB_OUTPUT_result"], "w", encoding="utf-8", newline="\n") as handle:
    json.dump({"ok": True, "review_id": review["id"]}, handle, indent=2, sort_keys=True)
    handle.write("\n")
