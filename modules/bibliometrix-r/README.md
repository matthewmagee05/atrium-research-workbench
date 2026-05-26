# Bibliometrix R

Tier 1A R analysis module. The default path uses deterministic R aggregations for annual publications, venue counts, author productivity, citations, co-author edges, keyword frequencies, and figure specs.

Additional deterministic outputs include citation percentile distributions, most-cited records, author impact with h-index, source impact with h-index, keyword co-occurrence edges, and Bradford-style source zones. These are emitted as structured tables plus canonical figure specs so reviewers can verify the analysis without relying on platform-specific rendered graphics.

Set `use_bibliometrix_package: true` to call `bibliometrix::biblioAnalysis()` when the CRAN `bibliometrix` package is installed in the module's R environment. The optional package result is folded into `summary.bibliometrix_package`; if the package is missing, the module records `available: false` instead of failing the deterministic fallback path.
