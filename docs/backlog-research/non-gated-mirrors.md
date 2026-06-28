# Non-gated mirrors for the three hard 403 / rate-limited blockers

Research pass 2026-06-28 (via WebSearch; the sandbox can't fetch, so each lead
is a *candidate to validate in a `data-check.yml` CI diagnostic run*, not a
confirmed solve). Goal: replace a 403/rate-limited host with a reachable one
for `turnover`, `dsit-gigabit-broadband`, and `defra-sewage-hours`.

## `defra-sewage-hours` — STRONGEST lead (new approach)

The per-company EDM workbooks are zip-of-xlsx on `environment.data.gov.uk`,
whose `/api/file/download` endpoint rate-limits/403s automated clients (only the
first zip usually succeeds). **But the national headline we actually plot —
total monitored spill hours — is quoted verbatim each year in the EA/Defra
release on reachable hosts:**

- `www.gov.uk/government/news/...` press releases (the gov.uk Content API, which
  we already use, serves these — not the 403-prone host).
- `environmentagency.blog.gov.uk` annual EDM blog posts.

Confirmed headline totals from the 2024/2023 releases: **2024 = 3,614,428 hours;
2023 = 3,606,170 hours** (and a 2025 release now exists: "fewer and shorter
spills in 2025"). 

**Next step:** add a fallback in `defraSewage()` — try the EA zip host first;
on failure, `govukLatest`/`govukContent` the annual "storm overflow spill data
for {YEAR}" news article and regex the total-hours figure (`/([\d,]+)\s*hours/`,
or "X million hours"). One point/year, on a non-gated host, matching the
ministerially-quoted number. Walk yearly slugs newest-first like GHG/FCDO.
Guard ~[1e6, 6e6] hours. Fewer years than the workbook sum, but reliable.

## `turnover` (NHS workforce turnover/leaver rate) — medium lead

`digital.nhs.uk` Cloudflare-403s scripts. Candidate data.gov.uk CKAN datasets
(test whether the resource URLs resolve to a reachable host vs 302 back to
digital.nhs.uk):

- `5b243950-f42e-4f8f-ac8e-2012e2c1b8d1` — **NHS Workforce – Turnover** (annual,
  by HEE region, HCHS staff). Closest to our metric.
- `56059f48-e736-4345-ad83-3b05b05d2557` — Reasons for Leaving / Staff Movements
  (monthly timeseries).
- `e2de4db6-b5fd-46f6-920e-0ca6d6efe640` — Turnover by Organisation.

The search surfaced `…/datafile/<id>/preview` URLs, hinting the CSV may be
cached on a data.gov.uk host rather than only linked off-site.

**Next step:** CI diagnostic — CKAN `package_show` on `5b243950…` and
`56059f48…`; log each resource's `format` + `url` + the host it 302s to; attempt
a fetch. If a resource is served from a non-`digital.nhs.uk` host, parse it; if
all redirect back, this stays blocked (as CLAUDE.md already suspected).

## `dsit-gigabit-broadband` (Ofcom Connected Nations) — weakest lead

Ofcom's Connected Nations CSVs are Open Government Licence but hosted on
`ofcom.org.uk`, which 403s automated clients (same class as the others). The
data.gov.uk CKAN copy is LA/postcode-only (no clean national % series).

Mirror candidates to test for reachability + a long national gigabit-% series:

- **House of Commons Library** "Broadband and mobile coverage" briefing
  (`commonslibrary.parliament.uk`, briefing CBP-8847) — usually ships a
  downloadable spreadsheet and is generally reachable; would give a UK
  gigabit-availability time series sourced *from* Ofcom but on a friendlier host.
- **thinkbroadband labs** (`labs.thinkbroadband.com`) — publishes its own daily
  availability stats including gigabit coverage; reachable, but a different
  methodology from Ofcom (note the provenance if used).

Headline for sanity-checking any parse: gigabit-capable coverage **≈87% of UK
premises, July 2025** (Connected Nations 2025).

**Next step:** CI diagnostic — probe the HoC Library briefing page for a
data-file link and its HTTP status; if 200 and tabular, prefer it (cite as
"Ofcom Connected Nations, via House of Commons Library"). Otherwise keep the
documented SKIP.

## Priority

1. `defra-sewage-hours` news-article fallback — clear, reachable, matches the
   headline; do first.
2. `turnover` CKAN probe — quick to test, binary outcome.
3. `dsit-gigabit-broadband` HoC-Library probe — lowest confidence; only if 1–2 land.

Sources: gov.uk/government/news storm-overflow releases; EA blog
(environmentagency.blog.gov.uk); data.gov.uk CKAN NHS workforce turnover
datasets; Ofcom Connected Nations 2025 data-downloads; House of Commons Library
broadband briefing.
