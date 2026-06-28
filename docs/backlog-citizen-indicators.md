# Citizen-accountability indicator backlog + collection plan

**Created 2026-06-28.** Turns the measurement-gap thesis
(`docs/measurement-gap-thesis.md`) into a buildable backlog: the **consumer-side
/ felt-outcome** indicators Govviz is missing, with sources, methodology fit and
a phased plan. Source leads below were spot-checked via WebSearch (2026-06-28);
the actual fetch + file-structure discovery happens in a `data-check.yml` CI run,
as always (the sandbox has no internet).

## Design principle (the filter every candidate must pass)

An indicator earns a place only if it is **consumer-side** (something a citizen
feels, not a department's internal throughput), **externally sourced** (from
ONS / a regulator / a survey — *not* self-attested by the delivering body, so it
is hard to fake), and a **long series** (multi-year, ideally multi-decade). This
is the same bar the best existing series already meet (HMRC phone waits, sewage,
temporary accommodation); it just makes the bar explicit.

**Proposed methodology enhancement — a `lens` tag.** Add an optional
`lens: "experience" | "process"` (and a `sourceIndependence: "external" |
"self"`) field to `TrendSeries`. It costs nothing to render, but it makes the
thesis *machine-visible*: the department page / treemap could group or annotate
"what they do" vs "what you get", and we can report the consumer-side share of
coverage. This is the single enhancement that operationalises the whole thesis —
do it in Phase 0.

## The backlog (prioritised; clusters on the consumer side, as the thesis predicts)

| # | Proposed id | Dept | What a citizen feels | Source | Methodology | Phase |
|---|---|---|---|---|---|---|
| 1 | `hmt-private-rents` | HMT (or MHCLG) | "my rent keeps rising" | ONS **Price Index of Private Rents (PIPR)**, monthly, UK | `ons()` / ONS dataset — **clean fit** | 1 |
| 2 | `hmt-food-prices` | HMT | "the weekly shop costs more" | ONS CPI **food & non-alcoholic drink** index (CDID) | `ons()` — **clean fit** | 1 |
| 3 | `ho-net-migration` | Home Office | the headline migration number | ONS **Long-Term International Migration (LTIM)** | `ons()` / ONS dataset | 1 |
| 4 | `dfe-persistent-absence` | DfE | "kids aren't in school" (post-Covid surge) | DfE **pupil absence** (EES) | `eesCsv()` — **clean fit** | 1 |
| 5 | `ho-shoplifting` | Home Office | "shoplifting is out of control" | Home Office **police-recorded crime** open data (shoplifting offences) | reuse `ho-charge-rate` open-data pattern | 1 |
| 6 | `mhclg-council-tax` | MHCLG | "council tax goes up every year" | gov.uk **Live tables on Council Tax** (avg Band D, since 1993) | gov.uk statistical-data-set / ODS — existing pattern | 2 |
| 7 | `mhclg-rough-sleeping` | MHCLG | rough sleeping on the street | MHCLG **annual rough sleeping snapshot** | gov.uk ODS — existing pattern | 2 |
| 8 | `mhclg-social-housing-waitlist` | MHCLG | "years on the council-house list" | MHCLG **Local Authority Housing Statistics** (households on waiting lists) | gov.uk ODS | 2 |
| 9 | `dft-local-roads` | DfT | **potholes** on the road I drive | DfT **road conditions** (% of *local* roads needing maintenance) — complements our SRN series | gov.uk ODS | 2 |
| 10 | `ho-passport-times` | Home Office | "will my passport arrive in time" | HMPO **transparency data** (% within 3/10 weeks) — complements visa SLA | gov.uk transparency (like `ho-visa-sla`) | 2 |
| 11 | `dft-rail-fares` | DfT | "fares rise every January" | ORR/DfT **regulated rail fares index** (or ONS rail-fare CPI subindex) | ORR portal CSV (we already scrape ORR) / `ons()` | 2 |
| 12 | `hmt-regional-gap` | HMT | the North–South / "levelling-up" gap | ONS **regional GVA per head** (dispersion, or London vs rest) | ONS dataset | 2 |
| 13 | `dwp-child-poverty` | DWP | children growing up poor | DWP **HBAI** children in relative low income — **Stat-Xplore** (FYE1995–2025) | **new `statXplore()` helper** + DWP key | 3 |
| 14 | `dwp-pensioner-poverty` | DWP | pensioners in poverty | DWP **HBAI** pensioners in relative low income — Stat-Xplore | `statXplore()` + DWP key | 3 |
| 15 | `dhsc-gp-access` | DHSC | **can't get a GP appointment** | **GP Patient Survey** (% able to get an appointment) — gp-patient.co.uk / england.nhs.uk | england.nhs.uk scrape (proven) — friendly host | 4 |
| 16 | `dhsc-camhs-wait` | DHSC | child mental-health waits | NHS England **CYP mental health** waiting times | england.nhs.uk scrape | 4 |
| 17 | `dhsc-dentistry-access` | DHSC | "can't find an NHS dentist" | NHS **dental statistics** (% adults seen in 24 months) | NHS BSA / digital.nhs.uk — **403 risk** (like `turnover`); try NHS BSA host | 4 |
| 18 | `defra-water-bills` | Defra | the water bill | **Ofwat** / Discover Water — avg annual household water+sewerage bill, real terms | **new regulator helper** | 5 |
| 19 | `dfe-childcare-cost` | DfE | childcare costs more than rent | **Coram** Family & Childcare survey (avg part-time nursery cost) | third-party scrape — **enhancement** | 5 |

**Why this list is the thesis's own prediction:** every entry is consumer-side
and externally sourced, and they cluster on **primary-care access, the household
bills, child poverty, and the crime people experience** — exactly the gap the
note predicts. The current set is strong on producer-side throughput; this list
rebalances it toward felt outcomes.

## Methodology: what reuses, what needs enhancing

**Reuses existing machinery cleanly (most of the backlog):**
- `ons(topic, cdid, dataset, freq)` → PIPR, food CPI, LTIM, regional GVA, rail-fare CPI. Several are one-liners.
- `eesCsv(datasetId)` → persistent absence.
- gov.uk statistical-data-set / `govukAttachments` + `xlsxBook` → council tax, rough sleeping, social-housing waitlist, local roads, passport times. The transposed/“England”-row/value-range tricks from `defra-bathing-water` and `mhclg-net-dwellings` apply directly.
- Home Office police-recorded-crime open data → shoplifting (same source as `ho-charge-rate`).
- england.nhs.uk scrape (proven on `ae-performance`/`rtt`/`discharge-delays`) → GP access, CAMHS.

**New helpers worth building (each unlocks several series):**
1. **`statXplore(dataset, fields, key)`** — `POST https://stat-xplore.dwp.gov.uk/webapi/rest/v1/table`, key in the `APIKey` header, parse the JSON cube into `[{date,value}]`. Unlocks **child poverty, pensioner poverty** here *and* the already-planned `dwp-pip-clearance` / `dwp-uc-mr`. Build it once when the DWP key lands — it is the highest-leverage single addition.
2. **`lens` / `sourceIndependence` tag** on `TrendSeries` (+ optional manifest mirror) — Phase 0, framing.
3. **A regulator-CSV helper** (Ofwat / Discover Water; ORR is partly covered) — small, unlocks water bills and tidies rail fares.

**Genuinely hard / lower-confidence (flag, don't over-promise):**
- `dhsc-dentistry-access` and any GPAD appointment-*volume* series live on
  `digital.nhs.uk`, the same Cloudflare-403 wall as `turnover` — route via NHS
  BSA or the GP Patient Survey (gp-patient.co.uk) instead, or accept a SKIP.
- `dfe-childcare-cost` is third-party (Coram) — reputable but not a government
  open dataset; treat as best-effort.

## Phased collection plan (same outer-loop as every prior data task)

Each phase: draft fetchers → push to the working branch → validate live on
`data-check.yml` (no deploy) → iterate on the CI diagnostics → freeze ok series
in `tools/loop/fixtures/ok-series.json` with a conservative floor → land to main.
Parallel-draft within a phase via Sonnet subagents where the fetchers are
independent (as with the 2026-06 placeholder batch).

- **Phase 0 — framing (cheap).** Add the `lens`/`sourceIndependence` tag; pick
  final ids and decide hero/core/supporting placement per department; add the
  chart objects as placeholders (they render "no source yet" until wired).
- **Phase 1 — clean ONS/EES one-liners (best value-to-effort).** #1–5. Mostly
  `ons()`/`eesCsv()`/the HO open-data pattern; low risk, fast wins, and they hit
  the most universal felt costs (rent, food, migration, school absence, theft).
- **Phase 2 — gov.uk ODS / data-set (existing pattern).** #6–12. The
  transposed-workbook / value-range parsing toolkit already exists.
- **Phase 3 — Stat-Xplore (with the DWP key).** Build `statXplore()`; land
  #13–14 alongside the already-planned PIP / UC-MR trio. Child poverty is the
  single highest-salience addition on the list.
- **Phase 4 — NHS access (england.nhs.uk scrape).** #15–16 via the proven NHS
  scrape; attempt #17 (dentistry) with the 403 caveat.
- **Phase 5 — regulator / third-party (enhancement).** #18 (water bills) needs
  the regulator helper; #19 (childcare) is best-effort.

## Recommended first move

When the **DWP key** lands, do **Phase 3 child poverty** with the same wiring
(highest salience, rides the key), and in parallel knock out **Phase 1** (rent,
food, net migration, persistent absence, shoplifting) — five clean one-liners
that close the most universal everyday-cost and crime gaps with the lowest
build cost. That single push would move the dashboard materially toward "the one
a citizen would actually open."
