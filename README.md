# Research Workbench

Implementation of the Research Workbench reproducibility engine, CLI, Tier 1A bibliometric path, and a Tier 1B desktop shell.

## Requirements

- Node 20+
- Python 3.11+
- npm

## Quickstart

```bash
npm install
npm run build
cp -R golden-pipelines/tier-0-spike /tmp/rwb-tier0
node apps/cli/dist/index.js protocol freeze /tmp/rwb-tier0/protocol.yaml
node apps/cli/dist/index.js run /tmp/rwb-tier0/protocol.yaml
node apps/cli/dist/index.js bundle export /tmp/rwb-tier0 --output /tmp/rwb-tier0-bundle
node apps/cli/dist/index.js bundle replay /tmp/rwb-tier0-bundle
node apps/cli/dist/index.js bundle verify /tmp/rwb-tier0-bundle
```

Current verified paths:

- Tier 0 replay/verify spike.
- Tier 1A fixture bibliometric pipeline with R subprocess support, `corpus.lock.json`, `METHODS.md`, and `environment.lock`.
- Tier 1B desktop shell build.

Later-tier modules are represented as manifests/placeholders where the full human-review and sandboxing surfaces are not yet production-complete.
