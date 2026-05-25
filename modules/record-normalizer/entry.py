import json
import os
import re
from typing import Any


def normalize_doi(value: Any) -> str | None:
    if not value:
        return None
    doi = str(value).strip().lower()
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi)
    return doi or None


def authors(record: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for authorship in record.get("authorships", []) or []:
        name = ((authorship or {}).get("author") or {}).get("display_name")
        if name:
            names.append(str(name))
    return names


def venue(record: dict[str, Any]) -> str | None:
    source = ((record.get("primary_location") or {}).get("source") or {})
    name = source.get("display_name")
    return str(name) if name else None


def main() -> None:
    with open(os.environ["RWB_INPUT_records"], "r", encoding="utf-8") as handle:
        records = json.load(handle)
    normalized = []
    for index, record in enumerate(records):
        source_id = str(record.get("id") or f"record-{index + 1}")
        normalized.append(
            {
                "record_id": source_id.rsplit("/", 1)[-1],
                "source_id": source_id,
                "doi": normalize_doi(record.get("doi")),
                "title": str(record.get("title") or "").strip(),
                "publication_year": record.get("publication_year"),
                "publication_date": record.get("publication_date"),
                "authors": authors(record),
                "venue": venue(record),
            }
        )
    normalized.sort(key=lambda item: item["record_id"])
    with open(os.environ["RWB_OUTPUT_normalized"], "w", encoding="utf-8", newline="\n") as handle:
        json.dump(normalized, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()
