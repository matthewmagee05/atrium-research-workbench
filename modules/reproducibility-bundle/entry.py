import json
import os


def main() -> None:
    with open(os.environ["RWB_OUTPUT_bundle_summary"], "w", encoding="utf-8", newline="\n") as handle:
        json.dump({"status": "bundle export is handled by the core CLI"}, handle, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()
