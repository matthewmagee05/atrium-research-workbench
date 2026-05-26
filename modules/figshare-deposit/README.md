# Figshare Deposit

Creates a dry-run, archived request, or explicit live Figshare draft article for the final bundle.

Modes:

- `fixture` / `dry_run: true`: builds the article payload and writes it to raw-response provenance without network.
- `snapshot`: replays a prior deposit output from `snapshot_path`.
- `live_archived` + `submit_live: true` + `dry_run: false`: requires `RWB_FIGSHARE_TOKEN`, creates a draft article through the Figshare API, and archives request/response JSON.

The module creates a draft article only. File upload and publication remain explicit follow-up steps.
