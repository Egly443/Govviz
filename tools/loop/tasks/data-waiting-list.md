# Bake real data for `waiting-list` (NHS England RTT — total incomplete pathways)

A ready-to-run **data task** for a new session — the first real exercise of the
loop's outer (CI) reward tier. Unlike the code-cleanup task, a data task cannot
be fully verified in-sandbox (no internet); the real reward is minted in CI.

## Why this is an outer-tier task

`eval.mjs` can only check that a fetcher is *structurally* wired (manifest entry
has min/max, the app still typechecks/builds). It CANNOT confirm the data
actually fetches — that needs the internet, which only CI has. So the real
gradient is `ci-reward.mjs` reading the `data-check.yml` "Fetch live data" log.
Drive this from the session (git push + `mcp__github__get_job_logs`), not a blind
inner loop.

## The series

- **id:** `waiting-list` (DHSC). National RTT waiting list size = total incomplete
  pathways (patients waiting to start treatment), monthly.
- **Source:** NHS England "Referral to Treatment (RTT) Waiting Times" statistics.
  The national timeseries was discontinued; the live figure lives in the
  **"Incomplete" provider-level monthly XLSX** (`Incomplete-Provider-*.xlsx`,
  ~9 MB) — sum the total-incomplete column across all providers per month.
- **Full research / dead-ends:** `docs/backlog-research/nhs-rtt.md` (read first).
- **Pattern to reuse:** england.nhs.uk HTML scrape for the random-suffix file
  (see `ae-performance`, `discharge-delays` in `build-data.mjs`) → `xlsxBook` →
  sum the provider rows. CKAN `data.england.nhs.uk` 404s — scrape the topic page.

## Inner-loop Done (structural — verifiable in-sandbox)

- A `SOURCES` entry in `scripts/build-data.mjs` keyed `waiting-list` with numeric
  `min`/`max` (e.g. waiting list size in millions or raw count — pick the unit the
  chart expects; guard generously, e.g. `min: 2_000_000, max: 10_000_000`).
- `src/components/data.ts` series renders `realPoints("waiting-list")` (already does).
- `node tools/loop/eval.mjs --series=waiting-list --allow=scripts/build-data.mjs --skip-build`
  → PASS (manifest + typecheck).

## Outer-loop Done (real reward — the actual goal)

1. Push the branch → `data-check.yml` runs the fetcher against live NHS England.
2. Pull the "Fetch live data" log via `mcp__github__get_job_logs`, pipe to
   `node tools/loop/ci-reward.mjs --series=waiting-list` → exit 0 (`ok`), with a
   plausible recent value inside the guard.
3. Freeze it into the regression corpus:
   `node tools/loop/ci-reward.mjs --freeze --log=fetch.log` → commit
   `tools/loop/fixtures/ok-series.json`.
4. Promote to `main` (CI bakes it into the deployed build).

## Iterate

The fetcher's actual XLSX structure (sheet name, header row, which column is
total-incomplete) is unknown until a diagnostic CI run reveals it — add
`console.log` of sheet names / first rows, push, read the log, refine. Same
loop as the proven series, just driven through CI. When `waiting-list` lands,
`rtt-18-week` (% within 18 weeks) reuses the same provider workbook.
