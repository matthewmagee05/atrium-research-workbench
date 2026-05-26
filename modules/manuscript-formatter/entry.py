import json
import os
from datetime import datetime, timezone
from pathlib import Path


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def maybe_json(env_name):
    path = os.environ.get(env_name)
    return read_json(path) if path and Path(path).exists() else {}


def normalize_style(style):
    aliases = {
        "generic": "generic-journal",
        "journal": "generic-journal",
        "prisma": "prisma-systematic-review",
        "systematic-review": "prisma-systematic-review",
        "apa": "apa-7",
        "nature": "nature-portfolio",
    }
    key = str(style or "generic-journal").strip().lower()
    return aliases.get(key, key)


def style_profile(style):
    profiles = {
        "generic-journal": {
            "required_sections": ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Data and Code Availability", "References"],
            "word_limits": {"abstract": 250},
            "citation_style": "numeric-or-author-date",
        },
        "prisma-systematic-review": {
            "required_sections": ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Funding", "Data and Code Availability", "PRISMA Checklist", "References"],
            "word_limits": {"abstract": 300},
            "citation_style": "journal-specific",
        },
        "apa-7": {
            "required_sections": ["Abstract", "Introduction", "Method", "Results", "Discussion", "References"],
            "word_limits": {"abstract": 250},
            "citation_style": "apa-author-date",
        },
        "nature-portfolio": {
            "required_sections": ["Abstract", "Introduction", "Results", "Discussion", "Methods", "Data Availability", "Code Availability", "References"],
            "word_limits": {"abstract": 200},
            "citation_style": "numbered",
        },
    }
    return profiles.get(style, profiles["generic-journal"])


def extract_markdown(draft):
    if isinstance(draft, dict):
        return draft.get("markdown") or draft.get("draft") or json.dumps(draft, indent=2, sort_keys=True)
    return str(draft)


def ensure_section(markdown, heading, default_text):
    needle = f"## {heading}".lower()
    if needle in markdown.lower():
        return markdown
    return f"{markdown.rstrip()}\n\n## {heading}\n\n{default_text}\n"


def asset_rows(kind, payload):
    if not isinstance(payload, dict):
        return []
    rows = []
    for name, value in sorted(payload.items()):
        rows.append({"kind": kind, "name": name, "summary": value if isinstance(value, (str, int, float)) else type(value).__name__})
    return rows


params = read_json(os.environ["RWB_PARAMS"])
draft = read_json(os.environ["RWB_INPUT_draft"])
figures = maybe_json("RWB_INPUT_figures")
tables = maybe_json("RWB_INPUT_tables")

style = normalize_style(params.get("target_style", "generic-journal"))
profile = style_profile(style)
title = params.get("title", "Untitled Atrium Study")
authors = params.get("authors", [])
keywords = params.get("keywords", [])

body = extract_markdown(draft)
if not body.lstrip().startswith("#"):
    body = f"# {title}\n\n{body}"
elif f"# {title}" not in body.splitlines()[:3]:
    body = f"# {title}\n\n{body}"

for section in profile["required_sections"]:
    if section == "Abstract":
        default = "TBD - abstract requires author review."
    elif section in {"References", "PRISMA Checklist"}:
        default = "See accompanying structured artifacts in the reproducibility bundle."
    elif "Availability" in section:
        default = "A reproducibility bundle accompanies this manuscript."
    else:
        default = "TBD - section requires author review."
    body = ensure_section(body, section, default)

title_page = {
    "title": title,
    "authors": authors,
    "corresponding_author": params.get("corresponding_author", ""),
    "keywords": keywords,
    "target_style": style,
    "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
}
assets = asset_rows("figure", figures) + asset_rows("table", tables)
submission_checklist = [
    {"item": "title_page", "status": "present" if title else "needs_review"},
    {"item": "abstract", "status": "present" if "## Abstract" in body else "needs_review"},
    {"item": "figures", "status": "present" if figures else "not_supplied"},
    {"item": "tables", "status": "present" if tables else "not_supplied"},
    {"item": "data_code_availability", "status": "present"},
    {"item": "human_editorial_review", "status": "required"},
]

write_json(os.environ["RWB_OUTPUT_manuscript"], {
    "title": title,
    "style": style,
    "markdown": body,
    "assets": assets,
    "title_page": title_page,
    "style_profile": profile,
    "submission_checklist": submission_checklist,
    "requires_editorial_review": True,
})
