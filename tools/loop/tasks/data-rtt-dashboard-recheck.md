# Recheck `waiting-list` / `rtt-18-week` against the new NHS RTT dashboard

A narrow, low-confidence **data task** for a new session. Goal: find out
whether the NHS England RTT interactive dashboard (launched 20 Nov 2025, after
this project's RTT research was done) exposes a national CSV/API that's
cheaper and more robust than the current 18-month per-provider aggregation —
and switch to it **only if it actually does**.

## Read this first — don't repeat already-disproved work

`docs/backlog-research/nhs-rtt.md` already documents that the old approach —
a single national **"RTT Overview Timeseries Including Estimates for Missing
Trusts"** `.xlsx` file — was tried and confirmed **gone**: a CI inventory of
the RTT year/landing pages found only stale 2014/2019-20 archives. That's why
`parseRtt()` in `scripts/build-data.mjs` (~line 326-471) currently sums the 18
most-recent monthly `Incomplete-Provider-*.xlsx` workbooks instead. **Do not
re-implement the old Overview Timeseries fetch — it was already checked and
is dead.**

What's genuinely untested is the **dashboard that launched after that
research**: `https://data.england.nhs.uk/dashboard/rtt` (per NHS England's own
statistics page, "first released 20 November 2025"). Dashboards built on a
data platform like this often have an underlying JSON/CSV API feeding the
charts (inspect network requests, or check `digital.nhs.uk`'s RTT publication
page for an accompanying API/open-data link) that could supply the **national**
total-incomplete and %-within-18-weeks directly, instead of summing ~20
provider workbooks every build.

## Why this matters even if it's a no-op

CLAUDE.md notes the current approach costs **+4.5 minutes per CI build** (18 ×
9 MB downloads). If the dashboard has a lightweight national endpoint, this is
a meaningful build-time win, not just a tidiness change. If it doesn't, log
that clearly so the next person doesn't re-ask the question.

## The series

- **ids:** `waiting-list` (total incomplete pathways, millions) and
  `rtt-18-week` (% within 18 weeks) — both already `ok` and frozen in
  `tools/loop/fixtures/ok-series.json`. **This task must not regress them** —
  treat the current `parseRtt()` as the fallback of record.
- **Guards (unchanged):** `waiting-list` `min: 1, max: 12` (millions, via
  `scale: 1/1_000_000`); `rtt-18-week` `min: 40, max: 100`.
- **Conformance cases:** `docs/conformance/test-cases.json` →
  `nhs-rtt-incomplete-within-18-weeks` and `nhs-rtt-incomplete-total` (update
  `current.M` / `failure_modes` / `status` only if a national endpoint
  genuinely replaces the per-provider aggregation).

## Inner-loop Done (structural — verifiable in-sandbox)

- A diagnostic-only change to `scripts/build-data.mjs` (or a throwaway script,
  not committed) that probes `data.england.nhs.uk/dashboard/rtt` and the
  `digital.nhs.uk` November-2025 RTT publication page for a CSV/JSON data link,
  logging what it finds.
- If a usable national endpoint exists: `parseRtt()` tries it first and falls
  back to the existing per-provider aggregation on any failure — never a
  single-path swap that could silently break the frozen series.
- `node tools/loop/eval.mjs --series=waiting-list --series=rtt-18-week --allow=scripts/build-data.mjs --skip-build`
  → PASS.

## Outer-loop Done (real reward)

1. Push the branch → `data-check.yml` runs both fetchers.
2. Pull the log via `mcp__github__get_job_logs`, pipe to
   `node tools/loop/ci-reward.mjs --series=waiting-list --series=rtt-18-week`
   → exit 0, values consistent with the existing frozen fixtures (no big jump —
   a new source returning a wildly different number is a parsing bug, not a
   win).
3. If a national endpoint genuinely works and is faster: swap it in as primary,
   re-freeze fixtures, update `docs/backlog-research/nhs-rtt.md` with a new
   "2026-xx: dashboard API supersedes per-provider aggregation" section, and
   note the CI time saved.
4. If it doesn't pan out (no public API behind the dashboard, or it's
   restricted): leave `parseRtt()` untouched, write one paragraph in
   `nhs-rtt.md` documenting what was checked and why it didn't help, and close
   this task as a documented no-op. That's a valid, useful outcome — don't
   force a change for its own sake.
