# Plan: indicators from public grievances (review action #5)

Goal: pick indicators backwards from what ordinary people actually complain
about, not forwards from what's easy to fetch. Every candidate must resolve to
**real, hard-to-fudge data** or it isn't shipped (the production honesty gate
blanks unsourced series; we don't fabricate).

## Status legend
- ✅ **Live** — real data baked in CI, on the deployed site.
- 🟡 **Tractable** — clean source identified, needs a fetcher + parser.
- 🔴 **Blocked** — no clean machine-readable source today (documented why).
- ⛔ **No department** — grievance doesn't map to one of the current 8 depts.

## Shipped this campaign
| Grievance | Series | Dept | Source |
|---|---|---|---|
| ✅ "Waited hours for an ambulance" | `dhsc-ambulance-c2` | DHSC | NHS England AQI / AmbSYS (field A31), monthly |
| ✅ "Police don't solve crimes" | `ho-charge-rate` | HO | Home Office "Crime outcomes" ODS, Table_1_3, annual |
| ✅ A&E 4-hour waits | `ae-performance` | DHSC | NHS England monthly A&E time series |
| ✅ Hospital discharge bottleneck | `discharge-delays` | DHSC | NHS England discharge SitRep |

## Candidate backlog (ranked by salience × tractability)

### 1. 🟡 NHS dentistry — "can't find an NHS dentist" (DHSC)
- **Metric to ship:** *number of adult patients seen by an NHS dentist in 24 months* (a count, not the old %).
- **Source:** NHSBSA "Dental statistics – England" → `dental_patient_geo_breakdown_*.xlsx` on the public S3 bucket (GetObject works; the page at `nhsbsa.nhs.uk/statistical-collections/dental-england` lists the file). Scraper + XLSX parse already wired and proven to reach the file.
- **Blocker that retired the % version:** NHSBSA discontinued the longitudinal "% of adult population seen" series; current open data is geographic counts, mostly single-year. **Check Table_4a/Table_5a in the patient workbook** for a national multi-year "adult patients seen" count — if present, ship the count (still a strong access signal). If only single-year, leave blocked.
- **Effort:** 1–2 CI iterations (discovery is solved; parse the national table).

### 2. 🟡 GP appointment access — the #1 public gripe (DHSC)
- **Metric:** *% reporting a good overall experience of their GP practice* (GP Patient Survey, good = very good + fairly good).
- **Source — GP Patient Survey (Ipsos):** reachable, NOT Cloudflare-gated. **Findings from CI (attempted, then parked):**
  - The reports page (`gp-patient.co.uk/surveysandreports`) only links the **current year's** national CSV. Filenames look like `GPPS_2025_National_data_(weighted)_(csv)_v2_PUBLIC_v2.csv`.
  - Per-year national CSVs sit at a **stable path**: `https://www.gp-patient.co.uk/Download?fileRedirect={year}%2Fsurvey-results%2Fnational-results%2Fnational-data-csv%2F{filename}`. The filename **suffix varies by year** (`_v2_PUBLIC_v2`, `_PUBLIC`, …) — needs per-year resolution.
  - The national CSV is a **single England row, very wide**; columns are `{mnemonic}_{n}.count` / `_{n}.pct` / `.basew`. **The overall-experience mnemonic is NOT `overallexp`** (tried — no match). The remaining blocker: **dump the full header to identify the real mnemonic** (search for the overall-experience question), then read `% good = {mnemonic}_1.pct + {mnemonic}_2.pct`.
- **Diagnostic result (CI probe, 2026-06):** requesting the national CSV URL **directly** returns `HTTP 200` but an **HTML interstitial page** (`rows=337 cols=1`), not the CSV — so the `Download?fileRedirect=` endpoint is **session/referer-gated and unreliable for automation**. (A prior run that first visited `/surveysandreports` did get the real CSV header once, so it's inconsistent.) This is the real blocker, not the column name.
- **Remaining options (harder than first thought):** (a) establish a session — fetch `/surveysandreports` and persist/replay its cookies on the CSV request (Node fetch needs manual cookie handling); (b) find a stable direct asset URL or an Ipsos data API; (c) switch metric to one with a cleaner source. Until one of these, **do not ship** — the endpoint can't be relied on.
- **Source B — NHS Digital appointments / GP workforce:** 🔴 digital.nhs.uk is Cloudflare-blocked (403) — same wall as `turnover`.

### 3. 🔴 Potholes / local road condition (DfT)
- **Metric:** % of local 'A'/'B'/'C' roads where maintenance should be considered (DfT RDC tables).
- **Blocker:** DfT changed the measurement methodology in 2021 (SCANNER → image-based), creating an **incompatible break** — a long series would be misleading (the same artefact we rejected for Attainment 8). Ship only the **post-2021 comparable window** clearly labelled, or skip. Low priority until enough post-2021 years accumulate.

### 4. ⛔ Water / sewage spills (no dept)
- **Metric:** storm-overflow spill hours/counts (Environment Agency Event Duration Monitoring, annual) — hugely salient.
- **Source:** EA EDM annual release on gov.uk (CSV/XLSX) — likely tractable.
- **Blocker:** **no Defra/environment department** in the current 8. Needs either a new department block (Defra) or a cross-cutting "environment" section. Decide product scope first.

### 5. ⛔ Energy bills / cost of living (HMT-adjacent)
- **Metric:** ONS domestic electricity & gas price indices (CDIDs via the existing `ons()` helper — easy and reliable).
- **Note:** partially covered by `hmt-cost-of-living` (CPI vs wages). A dedicated energy-price series is cheap to add to HMT if wanted, but arguably out of "civil service competence" scope (prices are market/regulator-driven). Low priority.

### 6. ⛔ Childcare costs, social housing waits / homelessness (no dept)
- Temporary-accommodation households (MHCLG) and 30-hours childcare cost are top grievances but map to **MHCLG/DfE-childcare**, not cleanly to the current 8. Needs product scope decision (add MHCLG?).

## Cross-cutting blockers to resolve first
- **Department coverage.** Several top grievances (water, housing, childcare) have **no home** in the 8 departments. Biggest unlock: add **Defra** and **MHCLG** blocks, or a thematic "what people feel" section that isn't department-bound.
- **digital.nhs.uk Cloudflare wall.** Blocks GP appointments, NHS workforce turnover, dentistry-% — a non-gated mirror (NHSBSA S3, data.gov.uk, ONS) is needed per metric.

## Recommended next order
1. **GP access via GPPS** (#2, Source A) — highest salience, source is reachable.
2. **Dentistry count** (#1) — discovery already solved; just parse the national table.
3. **Water/sewage** (#4) — but only after deciding whether to add a Defra block.

Everything here is gated by the same rule: real or nothing. A candidate that
can't be sourced cleanly stays in this doc, not on the dashboard.
