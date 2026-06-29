# Data licence

Govviz is a **downstream compiler**: it fetches official UK statistics from their
primary producers, validates them, and re-publishes them as an AI-ready open-data
product (see [`/data/`](https://egly443.github.io/Govviz/data/) and the
[AI-ready series profile](docs/conformance/ai-ready-series-profile.md)). Each
series' `licence` field, and its CSVW `dc:license`, states the licence that
applies to that series.

## Per-series licence

- **UK-government-sourced series** (ONS, gov.uk, NHS England, DfE, Defra/EA,
  MHCLG, HMRC, …) are published under the
  [Open Government Licence v3.0 (OGL)](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
  Contains public sector information licensed under the OGL v3.0.
- **World Bank–derived series** carry
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); attribution to the
  World Bank (and its upstream national sources) is preserved in each record's
  `provenance`.

The authoritative, machine-readable licence for any series is the `licence`
field of its metadata record at `/data/series/{id}.json`.

## The compilation

The *arrangement, harmonisation and AI-ready packaging* (the catalogue, the
per-series records, the tidy CSV/CSVW, the validation ranges and provenance
lineage) is published under **OGL v3.0**, consistent with the predominant
upstream licence, so the whole product is reusable by a fifteen-line script and
an everyday AI agent.

## Provenance, not impersonation

Every record names its **primary producer** in `producer` and `provenance.source`,
and marks Govviz as the compiler in `provenance.compiledBy`. Govviz does not
assert authorship of the underlying statistics; it re-publishes them in a
machine-first shape, with the exact upstream file and content/byte fingerprints
recorded for verifiable lineage.
