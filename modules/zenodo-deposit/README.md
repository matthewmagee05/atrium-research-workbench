# Zenodo Deposit

Creates a dry-run, archived request, or explicit live Zenodo draft deposition for the final bundle.

Modes:

- `fixture` / `dry_run: true`: builds the deposition payload and writes it to raw-response provenance without network.
- `snapshot`: replays a prior deposit output from `snapshot_path`.
- `live_archived` + `submit_live: true` + `dry_run: false`: requires `RWB_ZENODO_TOKEN`, creates a draft deposition through the Zenodo API, and archives request/response JSON.

The module creates a draft record only. File upload and publication remain explicit follow-up steps.
