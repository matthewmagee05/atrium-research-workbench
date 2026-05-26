# OSF Deposit

Creates a dry-run, archived request, or explicit live OSF draft project for final bundle or preregistration materials.

Modes:

- `fixture` / `dry_run: true`: builds the request payload and writes it to raw-response provenance without network.
- `snapshot`: replays a prior deposit output from `snapshot_path`.
- `live_archived` + `submit_live: true` + `dry_run: false`: requires `RWB_OSF_TOKEN`, creates a private OSF project node through the OSF API, and archives request/response JSON.

The module does not publish a public preregistration automatically; human review is required before any public submission.
