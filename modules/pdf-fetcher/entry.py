import hashlib
import json
import os
import urllib.request
from pathlib import Path


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def safe_name(doi):
    return hashlib.sha256(doi.encode("utf-8")).hexdigest()[:24] + ".pdf"


def write_fixture_pdf(path, doi):
    text = f"%PDF-1.4\n% Atrium fixture PDF for {doi}\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n"
    path.write_bytes(text.encode("utf-8"))


def main():
    params = read_json(os.environ["RWB_PARAMS"])
    mode = params.get("source_mode", "fixture")
    if mode == "snapshot":
        write_json(os.environ["RWB_OUTPUT_pdf_manifest"], read_json(params["snapshot_path"]))
        return
    links_payload = read_json(os.environ["RWB_INPUT_full_text_links"])
    cache_dir = Path(os.environ.get("RWB_PDF_CACHE_DIR") or Path(os.environ["RWB_ARTIFACT_DIR"]) / "pdf_cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    max_bytes = int(params.get("max_bytes", 52428800))
    pdfs = []
    for link in links_payload.get("links", []):
        doi = link.get("doi", "")
        pdf_path = cache_dir / safe_name(doi)
        source_url = link.get("pdf_url")
        downloaded = False
        reason = None
        if mode == "fixture" or (source_url or "").startswith("fixture://"):
            write_fixture_pdf(pdf_path, doi)
            downloaded = True
        elif mode == "live_archived":
            if not link.get("is_oa"):
                reason = "not_open_access"
            elif not source_url:
                reason = "missing_pdf_url"
            elif not str(source_url).startswith(("http://", "https://")):
                reason = "unsupported_url_scheme"
            else:
                request = urllib.request.Request(source_url, headers={"User-Agent": "Atrium PDF Fetcher"})
                with urllib.request.urlopen(request, timeout=60) as response:
                    data = response.read(max_bytes + 1)
                if len(data) > max_bytes:
                    reason = "max_bytes_exceeded"
                else:
                    pdf_path.write_bytes(data)
                    downloaded = True
        else:
            raise ValueError(f"Unsupported source_mode: {mode}")
        pdfs.append({
            "record_id": str(link.get("record_id", "")),
            "doi": doi,
            "path": str(pdf_path),
            "source_url": source_url,
            "bytes": pdf_path.stat().st_size if pdf_path.exists() else 0,
            "downloaded": downloaded,
            "reason": reason,
        })
    write_json(os.environ["RWB_OUTPUT_pdf_manifest"], {"pdfs": pdfs})


if __name__ == "__main__":
    main()
