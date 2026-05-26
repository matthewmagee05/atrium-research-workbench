# Meta-analysis R

Computes a deterministic pairwise random-effects summary from extracted effect sizes. The first implementation uses a base-R DerSimonian-Laird estimate so fixture pipelines do not require CRAN downloads; production runs can opt into `metafor` once module-level `renv` locking is configured.

