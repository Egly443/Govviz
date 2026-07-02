# AI-ready public data benchmark

This benchmark defines what Govviz means by "better than other government
implementations" for public performance series. It is not a prestige ranking.
It is a repeatable task suite: can a script or agent find, trust, fetch, and use
the data without scraping or guessing?

The machine-readable cases live in
[`benchmark-cases.json`](./benchmark-cases.json). They compare Govviz's reference
data product against common public-data surfaces such as GOV.UK publication
pages, data.gov.uk package pages, the ONS API, ODI NDL-lite-style cataloguing,
and comparable local or international data portals where relevant.

## Scoring model

Each target is scored per task from 0 to 2:

- `0`: fails, unavailable, blocked, or requires human-only interpretation.
- `1`: possible with bespoke scraping, manual lookup, or out-of-band semantics.
- `2`: directly machine-readable, stable, documented, and semantically safe.

The benchmark reports:

- `taskScore`: total points across tasks.
- `machineReadability`: whether data can be fetched without browser scraping.
- `semanticSafety`: whether the consumer can avoid a plausible wrong measure.
- `provenance`: whether source, licence, and lineage travel with the data.
- `freshness`: whether the latest period/fetch status is explicit.
- `agentReadiness`: whether an LLM tool or simple script can resolve and fetch.

## Required tasks

1. Resolve a stable series identifier.
2. Fetch the latest value.
3. Fetch the full time series.
4. Identify unit and multiplier.
5. Identify geography or population coverage.
6. Determine licence.
7. Determine release/freshness status.
8. Trace provenance to the primary producer and upstream file.
9. Fetch from a scripted client without a browser.
10. Consume through a formal agent/API contract.
11. Reject a wrong-but-plausible value using a published guard or equivalent.
12. Distinguish similar measures, such as median versus lower-quartile ratios.

## Running the benchmark

This directory currently defines the benchmark contract. The next step is an
executable runner that reads `benchmark-cases.json`, checks the live targets,
and emits `dist/data/benchmark-report.json` plus an HTML report. Until that
runner exists, use the cases as acceptance tests for implementation work and for
manual reviews in the essay.

