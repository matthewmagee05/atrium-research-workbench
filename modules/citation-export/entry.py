import json
import os
import re


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def clean(value):
    return str(value or "").replace("{", "").replace("}", "").strip()


def cite_key(record, index):
    authors = record.get("authors") or []
    first_author = authors[0] if authors else record.get("id", "record")
    if isinstance(first_author, dict):
        first_author = first_author.get("family") or first_author.get("name") or "record"
    first = str(first_author).split()[-1].lower()
    year = record.get("publication_year") or "nodate"
    return re.sub(r"[^a-z0-9]+", "", f"{first}{year}_{index}") or f"record{index}"


def format_author_bibtex(author):
    if isinstance(author, dict):
        if author.get("family") and author.get("given"):
            return f"{author['family']}, {author['given']}"
        return author.get("name", "")
    return str(author)


def format_author_ris(author):
    return format_author_bibtex(author)


records = read_json(os.environ["RWB_INPUT_records"])
bib = []
ris = []
csl = []
for i, record in enumerate(records, start=1):
    key = cite_key(record, i)
    title = clean(record.get("title"))
    year = clean(record.get("publication_year"))
    doi = clean(record.get("doi"))
    venue = clean(record.get("venue") or record.get("container_title"))
    url = clean(record.get("url") or record.get("landing_page_url"))
    authors = record.get("authors") or []
    bib_authors = " and ".join(clean(format_author_bibtex(a)) for a in authors if clean(format_author_bibtex(a)))

    fields = [
        ("title", title),
        ("author", bib_authors),
        ("journal", venue),
        ("year", year),
        ("doi", doi),
        ("url", url),
    ]
    bib_body = "\n".join(f"  {name} = {{{value}}}," for name, value in fields if value).rstrip(",")
    bib.append(f"@article{{{key},\n{bib_body}\n}}")

    ris.append("TY  - JOUR")
    for author in authors:
        formatted = clean(format_author_ris(author))
        if formatted:
            ris.append(f"AU  - {formatted}")
    for tag, value in [("TI", title), ("JO", venue), ("PY", year), ("DO", doi), ("UR", url)]:
        if value:
            ris.append(f"{tag}  - {value}")
    ris.append("ER  -")

    csl.append({
        "id": key,
        "type": "article-journal",
        "title": title,
        "container-title": venue,
        "issued": {"date-parts": [[int(year)]]} if year.isdigit() else None,
        "DOI": doi or None,
        "URL": url or None,
        "author": [{"literal": clean(format_author_bibtex(a))} for a in authors if clean(format_author_bibtex(a))],
    })

write_json(os.environ["RWB_OUTPUT_citations"], {
    "bibtex": "\n\n".join(bib),
    "ris": "\n".join(ris),
    "csl_json": csl,
    "count": len(records),
})
