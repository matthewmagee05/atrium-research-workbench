import hashlib
import json
import os
from pathlib import Path


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


params = read_json(os.environ["RWB_PARAMS"])
materials = []
for key, value in sorted(os.environ.items()):
    if key.startswith("RWB_INPUT_") and Path(value).exists():
        logical_name = key.replace("RWB_INPUT_", "").lower()
        materials.append({
            "name": logical_name,
            "path": value,
            "sha256": sha256_file(value),
            "size_bytes": Path(value).stat().st_size,
            "include_in_submission": logical_name not in {"manuscript"},
        })

index_lines = [f"# {params.get('label', 'Supplementary materials')}", ""]
for item in materials:
    index_lines.append(f"- `{item['name']}` ({item['size_bytes']} bytes, {item['sha256']})")

write_json(os.environ["RWB_OUTPUT_supplementary_manifest"], {
    "label": params.get("label", "Supplementary materials"),
    "materials": materials,
    "index_markdown": "\n".join(index_lines) + "\n",
    "packaging_status": "manifest_only",
    "reviewer_note": "Files are referenced by immutable hashes in the reproducibility bundle; final journal upload packaging remains an editorial step.",
})
