# CLAUDE.md

Guidance for Claude when working in this repo.

## Working style

- **Prefer Sonnet for token efficiency.** Use the cheaper/faster model for
  mechanical or well-scoped work (edits, refactors, file plumbing, running
  builds, log triage, search). Reserve Opus for genuinely hard reasoning
  (architecture, tricky debugging, ambiguous design). When delegating to
  subagents, pick `sonnet` unless the task clearly needs more.
- Keep chat replies concise. Lead with the result.

## Project

Govviz — a static dashboard of long-run UK government performance indicators.
Stack: **Vite + React + TypeScript**, **TanStack Router** (file-based routing,
codegen via `@tanstack/router-plugin`), **Tailwind v4** (`@tailwindcss/vite`,
theme in `src/styles.css`), **Recharts**, **d3-hierarchy**, **lucide-react**.

- Data/series + helpers: `src/components/data.ts`
- Departments registry (per-dept series, `spendBn`): `src/components/departments.ts`
- Routes: `src/routes/` (`index.tsx` redirects `/` → `/overview`;
  `overview.tsx` is the whole-of-government treemap landing page;
  `$dept.tsx` is a department dashboard). `src/routeTree.gen.ts` is generated.
- Treemap overview: `GovTreemap.tsx`, `overview.ts` (RAG scoring + colour),
  `Modal.tsx`, `OverviewPage.tsx`.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (also regenerates `routeTree.gen.ts`)
- `npm run typecheck` — `tsc -b`
- After adding/renaming a route file, run `npm run build` (or dev) so the
  router plugin regenerates `routeTree.gen.ts`; then `typecheck`.

## Deployment

- GitHub Pages **project site** at `https://egly443.github.io/Govviz/`.
- Vite `base` is `/Govviz/` for production builds; router `basepath` derives
  from `import.meta.env.BASE_URL`. `index.html` favicon uses `%BASE_URL%`.
- `.github/workflows/deploy.yml` builds on push to `main` and deploys via the
  official Pages actions; it copies `index.html` → `404.html` as the SPA
  deep-link fallback. **Deploys run from `main` only**, so changes must reach
  `main` (via a PR or a direct push) to go live.
- **Pages "Source" must be "GitHub Actions", not "Deploy from a branch".** If a
  `pages build and deployment` workflow run appears on each push, the source is
  set to the branch and GitHub serves the **raw repo source** (`/src/main.tsx`,
  no CSS) → blank page + GitHub's own 404 on deep links. Fix in repo Settings →
  Pages → Build and deployment → Source → GitHub Actions. Assets use stable
  (non-hashed) filenames so an edge-cached index.html can't reference purged files.

## Environment gotchas (Claude Code on the web)

- **No outbound internet from the sandbox.** External fetches/curl (incl. the
  live `*.github.io` site and `lovable.dev`) return 403 via the egress proxy.
  Do not try to verify the deployed site with curl/WebFetch — it can't reach it.
  Git/GitHub go through an authorised local proxy and the `mcp__github__*` tools.
- **No browser** for visual checks. To smoke-test that the built app actually
  renders (catches client-only crashes that SSR/`tsc` miss), load the production
  bundle in `jsdom`: create a JSDOM, set `globalThis.self = window` and
  `Object.setPrototypeOf(globalThis, window)` to expose DOM globals, polyfill
  `ResizeObserver` (have `observe()` fire the callback with a real width so the
  treemap lays out), then `await import()` the hashed file in `dist/assets/` and
  read `#root` innerHTML / collect `window` error events. Install jsdom with
  `npm i --no-save jsdom`. Don't commit throwaway scripts.
- A **blank page on Pages** with a verified-good build is almost always a stale
  cached `index.html` pointing at purged asset hashes — hard-refresh / incognito.

## Real-data pipeline (status + how to extend)

Goal: every chart shows **real data from a reputable source** (ONS, World Bank,
gov.uk, NAO…), never fabricated. Charts with no real source yet render an
explicit "no source yet" placeholder (illustrative generators removed 2026-06).

### Architecture
- **`scripts/build-data.mjs`** fetches each series in CI and writes
  `src/generated/seriesData.ts`. Runs as the workflow's **"Fetch live data"**
  step (before `vite build`). Per-source `try/catch`; **never fails the build**.
- **`src/generated/seriesData.ts`** is committed as an **empty `{}`** (no datasets
  in git); CI overwrites it for the production build only.
- **Data layer** (`src/components/data.ts`): `realPoints(id)` and
  `realLine(id, lineId)` return baked CI data or `[]` (single-arg since 2026-06;
  the illustrative fallback args and generators were deleted). A chart becomes
  "real" by (a) wrapping its `points` in `realPoints` and (b) adding a manifest
  entry in `build-data.mjs` keyed by the same `id`.
- **Guard:** every manifest entry has `min`/`max`; a fetched latest value outside
  the range is rejected → falls back. A wrong-but-resolving code can never show
  wrong data. `scale` multiplies raw values; fetchers retry transient errors.

### Fetch helpers (in build-data.mjs)
- `ons(topic, cdid, dataset, freq)` → ONS timeseries JSON (topic/cdid/dataset may be arrays — every combo tried).
- `wb(indicator)` → World Bank API (OECD/WHO/UN-sourced, internationally comparable).
- `eesCsv(datasetId)` → DfE Explore Education Statistics CSV → `{headers, rows}`.
- `unhcr(endpoint, params)` → UNHCR population API.
- `govukContent(path)` → gov.uk Content API JSON. Use `.details.attachments` (a page's current files) and `.links.documents` (a collection's editions). Works for `government/statistics/*`, `government/collections/*`, and `government/statistical-data-sets/*`.
- `govukAttachments(path)` → that page's attachment list (title/url/content_type).
- `govukCollectionLatest(slug, accept)` → newest edition (by `public_updated_at`) in a gov.uk **collection** whose doc passes `accept` → base_path. Robust way to follow a yearly-republished release.
- `govukLatest(q, accept)` → gov.uk Search API; newest result passing `accept` → path. Follows a series republished under a changing slug.
- `xlsxBook(url)` / `xlsxBookFromBuffer(buf)` / `sheetRows(book, name)` → SheetJS reader for **.ods/.xls/.xlsx** (from a URL or an in-memory buffer). `sheetRows` returns array-of-arrays — numeric cells are numbers, suppression markers (`w`/`x`/`z`) are strings.
- `unzipUrl(url)` → download a `.zip` and return its entries as `{ name, buf }` (fflate); pair with `xlsxBookFromBuffer` to read zipped workbooks.
- CI installs the parser deps via `npm install --no-save xlsx fflate` (keeps package-lock in sync); both are imported lazily so local/offline runs skip them.
- `parseCsvLine(line)` → quote-aware CSV splitter. Plus raw `fetch(url, fetchOpts({...}))` for HTML scrapes & CKAN APIs (`fetchOpts` sets UA + 30s timeout; pass `"user-agent"` to override).

### Discovering codes — **WebSearch works** (curl/WebFetch don't!)
The sandbox blocks `curl`/`WebFetch`, **but `WebSearch` reaches the internet.** Use it to
find ONS CDIDs/WB codes/EES dataset IDs/gov.uk collection slugs, then wire the fetcher
(CI does the actual fetch). The actual file structure is discovered by a diagnostic CI run.

### Proven source patterns
- **gov.uk collection → latest ODS:** `govukCollectionLatest(slug, accept)` → `govukAttachments` → `xlsxBook` (dwp-fraud-error, moj-crown-backlog, moj-cost-per-prisoner, moj-completion-days).
- **gov.uk statistical-data-set:** `govukContent("government/statistical-data-sets/{slug}").details.attachments` (ho-visa-sla → VSI_02).
- **gov.uk consolidated CSV collection:** loop `links.documents`, parse each CSV (mod-procurement + dft-capital-overrun = IPA GMPP delivery-confidence RAG).
- **england.nhs.uk scrape:** fetch the topic/year HTML page, regex `href="...\.xlsx?|\.csv"` for the random-suffix file, then xlsxBook/CSV (ae-performance, discharge-delays). Links are server-rendered, NOT zipped.
- **EES CSV:** `eesCsv(datasetId)` (dfe-teacher-recruitment, dfe-ect-attrition, dfe-attainment-gap = KS4 disadvantage gap index).
- **Transposed/grouped ODS:** gov.uk "accessible" workbooks often put periods in columns (DASA 3a/5e, MHCLG LT120 net-additional-dwellings, Defra recycling tonnages) or per-period `{date} Rate` triplets (HMPPS); detect the header/year row and iterate columns. Anchor row-label matches (`/^total net additional dwellings/`) so a "Source: …" caption doesn't match first.
- **Quarterly carry-forward sheet:** MHCLG homelessness TA1 puts the year in col 0 (blank on Q2–Q4, carry forward), the quarter in col 1, and the value in a labelled column — read year+quarter from separate columns.
- **ONS dataset workbook (not a CDID):** scrape the dataset landing-page HTML for the current `.xlsx`, read the **Contents** sheet to pick the right table by description (e.g. *median* vs lower-quartile ratio — both pass the guard, so disambiguate by label), then parse (mhclg-affordability).
- **data.gov.uk CKAN `.zip`:** `package_show` → resource `.zip` URLs → `unzipUrl` → `xlsxBookFromBuffer` per entry; sum across per-entity sheets (defra-sewage EDM — works only when the EA endpoint isn't rate-limiting). Watch `\b` word boundaries on years flanked by underscores (`EDM_2020_…` needs digit boundaries, not `\b`).
- **Branch CI harness:** `.github/workflows/data-check.yml` runs the fetcher on non-main pushes **without deploying** — validate parsers against live sources here (the sandbox has no internet), then promote to main. Production deploy (`deploy.yml`) runs only on `main`.

### Coverage — current state (95 ok / 1 skip as of 2026-06-25)
Read the latest CI **"Fetch live data"** log (`mcp__github__get_job_logs`) for the authoritative
`ok`/`SKIP` tally — the manifest is cumulative so one run shows everything. Only `turnover` is a
consistent `SKIP` (digital.nhs.uk 403); `defra-sewage-hours` fetches intermittently (`ok` with a
partial year-range, or `SKIP`, depending on whether the EA host rate-limits that run). ~90 series
IDs now bake real data across the original ten departments (HMT/DHSC via ONS+World Bank; DfE via EES;
DWP via World Bank; MHCLG/Defra via gov.uk-ODS + ONS + World Bank; plus the gov.uk-ODS /
statistical-data-set / england.nhs.uk operational series listed below).

### Whole-of-government expansion (2026-06): six more departments
The registry grew from ten to **sixteen** departments (the major missing ministerial departments).
All wiring is data-driven from the `departments` array — no new routes/tabs/treemap code. CI tally
after this work: **110 ok / 2 skip** (data-check run #128; only `turnover` and `dsit-gigabit-broadband`
SKIP, both hard-blocked by HTTP 403 — not parser bugs).
- **DESNZ, DSIT, DBT, DCMS** real World Bank series — **all CI-verified `ok`**: `desnz-renewables-share`
  EG.FEC.RNEW.ZS (32 pts); `dsit-rd-gdp` GB.XPD.RSDV.GD.ZS + `dsit-researchers` SP.POP.SCIE.RD.P6;
  `dbt-exports-gdp` NE.EXP.GNFS.ZS + `dbt-hightech-exports` TX.VAL.TECH.MF.ZS; `dcms-tourism-arrivals`
  ST.INT.ARVL. Guards reject wrong-but-resolving values.
- **Two more converted illustrative→real this session (CI-verified):**
  - `dbt-business-investment` — ONS CDID **NPEL** (business investment, chained volume, SA), £m→£bn via
    `scale`, quarterly. 117 pts 1997–2026. Clean time series, no ODS parsing.
  - `desnz-ghg-emissions` — gov.uk final UK GHG emissions ODS. **Lesson:** the recency-ordered
    `govukLatest` search buried the annual release under news items, and `govukCollectionLatest`
    matched nothing (this collection groups documents differently). What worked: walk the **stable
    yearly release slug** `final-uk-greenhouse-gas-emissions-national-statistics-1990-to-{YEAR}`
    newest-first to the first page carrying an ODS, then a **dual-orientation parser** (years-across-
    columns *or* years-down-a-column) finds the net-total row. 33 pts 1990–2022 via the 2022 tables.
- **FCDO, Cabinet Office now have real data** (no longer placeholder shells):
  - `cab-civil-service-headcount` — ONS CDID **G7G6** (public-sector employment, FTE, thousands→raw via
    `scale: 1000`), quarterly, 109 pts 1999–2026. Clean one-liner.
  - `cab-gmpp-confidence` — IPA GMPP whole-portfolio delivery confidence (% Green/Amber-Green). Factored
    a shared `gmppEntries()` discovery out of `gmppVariance` (which powers mod-procurement/dft-capital-
    overrun) and added `gmppPortfolioConfidence()` aggregating across all departments. 4 pts (2021–2024).
  - `fcdo-oda-gni` (8 pts 2017–2024) + `fcdo-oda-total` (3 pts) — gov.uk SID **multi-edition merge**: the
    "final UK ODA spend {Y}" ODS is a 2–3yr snapshot, so walk yearly editions (`final-uk-oda-spend-{Y}`
    and the older `final-uk-aid-spend-{Y}` slug) and take each edition's headline year. **Lesson:** the
    ODS uses years embedded in column headers and note-suffixed cells (`"2023\r\n…"`) — robust extraction
    is by **value range**, not header/position matching: ODA:GNI ratio = the cell in [0.2,1.0]; total ODA
    = the TOTAL-ODA-row cell in [5000,25000]£m; date = the edition's headline year.
- **Plus the rest of the placeholder backlog landed this session (7 of 8):**
  - `desnz-fuel-poverty` — gov.uk "Fuel poverty trends" xlsx, England LILEE %, 16 pts (2010–2025).
  - `dcms-creative-gva` — DCMS Economic Estimates "All sectors" ODS, 15 pts (2010–2024). **Lesson:** the
    GVA tables put DCMS **sectors as COLUMN headers** with years down col0 (sheets 1a-1c are SIC-definition
    lookups, not values), and sheet 2a is **current prices £bn** (not £m, no `scale`). Orientation-C parser
    (sector-as-column) + a current-prices-title tiebreak (over chained-volume 2b).
  - `dcms-sport-participation` — Sport England Active Lives landing-page scrape, 4 pts (2021–2025).
    **Lesson:** "Active" is a COLUMN group; the % is the "Rate (%)" sub-column stored as a **proportion**
    (0.6207 → ×100); read the "All adults (aged 16+)" row.
- **Only hard block left among the new departments:** `dsit-gigabit-broadband` (Ofcom Connected Nations)
  — every Ofcom data-downloads page **HTTP 403s** automated clients (same class as `turnover`/digital.nhs.uk).
  Fetcher kept as a documented SKIP; needs a non-gated mirror (the data.gov.uk CKAN copy is LA/postcode-only).
- TODO: freeze the new real series into `tools/loop/fixtures/ok-series.json` via `ci-reward.mjs --freeze`
  once stable, so a future regression fails CI.

### Deepening pass + HMRC (2026-06): 17 departments, ~120 series
Added **HMRC as the 17th department** (non-ministerial; hero = phone wait times, core = tax gap) and
deepened the six newer departments with long-run "ordinary people" indicators. Data-driven as always —
no route/tab/treemap changes. CI tally: **117 ok / 5 skip** (data-check run #131).
- **7 new real series landed `ok`:**
  - DESNZ `desnz-energy-use-pc` (WB EG.USE.PCAP.KG.OE, 35 pts).
  - DSIT `dsit-internet-users` (WB IT.NET.USER.ZS, 35 pts) + `dsit-mobile-subs` (IT.CEL.SETS.P2, 53 pts).
  - DBT `dbt-fdi` (WB BX.KLT.DINV.WD.GD.ZS, 55 pts) + `dbt-retail-sales` (ONS CDID **J5EK**, 365 monthly
    pts 1996–2026 — clean `ons()` one-liner, no ODS).
  - HMRC `hmrc-tax-gap` (gov.uk "Measuring tax gaps tables" consolidated ODS, **20 pts 2005–2024** —
    dual-orientation + [3,12]% value-range; the strong HMRC anchor).
- **Dropped:** `dcms-tourism-receipts` (WB ST.INT.RCPT.CD) — resolved `ok` but only 4 stale points
  (1995–1998; WB discontinued it for the UK) and redundant with the `dcms-tourism-arrivals` hero. Removed
  rather than ship a 1998-latest chart.
- **3 bespoke gov.uk-ODS series still SKIP (placeholders, need a diagnostic round — drafted, wired, guarded):**
  - `hmrc-call-wait` (HMRC monthly performance reports) — walks 24 editions but the "average speed of
    answer" row label didn't match in any sheet → 0 points. Hardest: each month is a separate publication.
  - `desnz-electricity-price` (DESNZ Quarterly Energy Prices table 2.2.4, p/kWh) — file/sheet found but the
    p/kWh row/orientation missed.
  - `cab-foi-intime` (Cabinet Office FOI statistics, quarterly editions) — 0 edition points merged; the
    "all monitored bodies" timeliness row/worksheet didn't match.
  Each emits rich CI diagnostics for the next iteration (same loop that landed FCDO/sport/creative-GVA).

Converted illustrative→real in the 2026-06 campaign: dwp-fraud-error, dfe-teacher-recruitment,
dfe-attainment-gap, moj-crown-backlog, moj-cost-per-prisoner, moj-officer-resignations,
moj-completion-days, mod-personnel-shortfall, mod-voluntary-outflow, mod-procurement,
dft-capital-overrun, ho-visa-sla, dft-rail-cancellations, ae-performance, agency-spend,
discharge-delays. Plus the 2026-06 MHCLG/Defra launch: mhclg-temp-accommodation (TA1 quarterly),
mhclg-net-dwellings (LT120 transposed), mhclg-affordability (ONS median HPE ratio, Contents-disambiguated),
defra-recycling (computed dry+organic/total), defra-pm25 + defra-forest (World Bank).
Plus the 2026-06-22 NHS RTT landing (first outer-tier/CI-reward data task): waiting-list +
rtt-18-week, rebuilt by aggregating the per-provider monthly Incomplete workbooks (NHS dropped the
national overview file) — sum the NHS "Provider" + independent-sector "IS Provider" all-specialties
("Total" treatment-function) rows per month over the last 18 months; latest Mar-2026 = 7.01M list /
65.3% within 18 weeks, on NHS's published 7.4M→falling, 65%-by-Mar-2026 trajectory. Both frozen in
`tools/loop/fixtures/ok-series.json`.

### Illustrative data REMOVED from the app (2026-06)
Fabricated/illustrative fallbacks no longer render anywhere. `SHOW_ILLUSTRATIVE`
is permanently `false` and `realPoints`/`realLine` return `[]` when CI hasn't
baked data, so an unsourced series shows an explicit "no source yet" placeholder
in **every** build (a local build without `src/generated/seriesData.ts` populated
shows placeholders). `latest`/`minMax` are guarded for empty series. The A–F
department "competence grade" was also removed (it was a composite indicator with
undocumented weighting); department pages now show a per-indicator RAG snapshot,
and un-targeted (own-range) RAG cells are desaturated and labelled "no external
benchmark". Reference baselines are labelled with their basis/year.

**DONE — source cleanup (2026-06):** the dead generators
(`annual`/`trajectory`/`annualSeries`/`noise`) and their inert anchor-literal
fallback args were deleted (1194 lines); `realPoints`/`realLine`/`wbLines` are
single-arg. (Done via the agentic loop — see "Agentic coding loop" below.)
`turnoverByGroup` keeps its pre-existing illustrative anchors as plain points
(no longer interpolated) — still on the illustrative backlog, unchanged in substance.

**TODO — indicators still needing a real source** (currently render placeholders;
see the per-series notes in `docs/backlog-research/` and the rows below):
`turnover`, `defra-sewage-hours` (intermittent), plus the hard-blocked DWP
Stat-Xplore / PDF-only series. (`waiting-list` + `rtt-18-week` landed
2026-06-22; `defra-bathing-water` landed 2026-06-24 — see below.)

### DONE — `defra-bathing-water` (2026-06-24)
The CLAUDE.md blocker claim ("HTML/PDF only, EA API on the same 403-prone
host") was **wrong** and never live-tested — disproved by an actual CI fetch.
The headline `government/statistics/bathing-water-quality-statistics`
collection genuinely is PDF/HTML-only, but the underlying classification
counts are published separately as the EA `env17-bathing-water-quality-
additional-datasets` statistical-data-set, on `assets.publishing.service.gov.uk`
(not the 403-prone `environment.data.gov.uk` host) — one ODS workbook per
year (2015–2025), not a consolidated timeseries. Layout varies year to year:
some are a transposed 5-year table, most are a region-by-classification
matrix (rows = EA areas, columns = Excellent/Good/Sufficient/Poor) with the
national total in a row labelled **"England"**, not "Total" — that's why a
plain row-label scan for "total" never matched. Parser in `build-data.mjs`
finds the header row containing "Excellent" and the "England" row, sums the
classification columns for the total, and computes %Good-or-Excellent.
10 points, 2015–2025, frozen in `tools/loop/fixtures/ok-series.json` (floor
10). `docs/conformance/test-cases.json`'s `bathing-water-quality` case
re-scored T3/M2 (was T3/M0) — discoverable-but-undocumented-and-bespoke, not
embargoed. Essay corrected to match (`docs/blog-open-data-for-ai.md`).

### DONE — essay fact-check pass (2026-06-25)
Live-verified every checkable claim in `docs/blog-open-data-for-ai.md` against
a fresh CI run (fetcher logs + source code) and against external sources via
WebSearch. `turnover` (digital.nhs.uk 403) and `defra-sewage-hours` (EA
rate-limiting) claims confirmed accurate; ONS/World Bank/MHCLG parsing-quirk
claims (net-dwellings transposition, TA1 carry-forward, affordability
Contents-sheet disambiguation) all matched the live fetcher behaviour, no
changes needed. One real inaccuracy found and fixed: the essay and
`docs/conformance/test-cases.json` misnamed the GDS/DSIT (20 Jan 2026)
four-pillar framework — invented an "access" pillar and omitted "legal,
security & ethical compliance". Corrected to the real four pillars (technical
optimisation; data & metadata quality; organisational & infrastructure
context; legal/security/ethical compliance) in both files, and tightened the
T/M-axis-to-pillar mapping to two pillars per axis. Also fixed a stale
`CLAUDE.md` claim that DWP Stat-Xplore authenticates via `Authorization:
Bearer` — it's actually an `APIKey` header (see below).

**Fetchers wired but currently SKIP (CI-verified blockers):**
| Series | Blocker |
|---|---|
| `turnover` | digital.nhs.uk Cloudflare-blocks automated access (403 even with a browser UA); data.gov.uk `nhs-workforce-turnover` resources point back to digital.nhs.uk. Needs a non-gated source. |
| `defra-sewage-hours` | EA Event Duration Monitoring annual returns are `.zip`-of-xlsx on data.gov.uk (pkg `19f6064d…`); parser unzips (fflate) and sums "Total Duration (hours)" across per-company sheets, but the `environment.data.gov.uk/api/file/download` endpoint rate-limit/403s automated requests (first zip occasionally succeeds, rest 403). Needs a non-gated mirror. Defra hero is `defra-recycling` instead. |

**Hard-blocked (no fetcher; charts intentionally illustrative):** DWP Stat-Xplore series
(`dwp-pip-clearance`, `dwp-work-coach-ratio`, `dwp-uc-mr`) need a free API key as CI secret
`DWP_STATXPLORE_KEY` (`POST https://stat-xplore.dwp.gov.uk/webapi/rest/v1/table`, key sent in an `APIKey: {key}` header — not `Authorization: Bearer`);
`mod-readiness` (classified); `ho-caseworker-turnover`, `ho-hotel-spend`, `dfe-dsg-deficit`,
`dft-dvla-backlog`, `dft-srn-degradation` (PDF / parliamentary-answer / LA-return only).

Per-series research notes (sources, drafted fetchers, dead-ends) live in `docs/backlog-research/`.


### Workflow notes
- User granted **direct pushes to `main`** for data iteration:
  `git push origin HEAD:main && git push origin <working-branch>`.
- Commit as `Claude <noreply@anthropic.com>` (`git config user.email
  noreply@anthropic.com && git config user.name Claude`) so commits verify.
- Working branch: varies per session/task — check `git branch --show-current`
  rather than relying on a name hardcoded here (most recently
  `claude/essay-factual-review-flwbgt`).
- **WebSearch reaches the internet** (curl/WebFetch don't). Use it to find stable
  CSV/Excel URLs or dataset IDs, then wire in CI — the actual fetch happens in CI.
- `eesCsv(datasetId)` helper already in `build-data.mjs` — reuse for any new EES
  dataset IDs found.
- **EES catalogue search:** `https://explore-education-statistics.service.gov.uk/
  data-catalogue` — use WebSearch to find dataset IDs matching a topic.
- `xlsx` and `fflate` are already installed in both workflows
  (`npm install --no-save xlsx fflate`) — no extra step needed to parse Excel/ODS
  or unzip archives.
- Tax burden = receipts (ONS `ANBV`, £m) ÷ GDP — already wired via WB
  `GC.TAX.TOTL.GD.ZS` (tax % GDP). The explicit ONS ratio is not needed unless
  UK-domestic definition differs materially.

## Agentic coding loop (`tools/loop/`)

An experimental verifier-driven loop for letting a coding agent iterate against a
machine-checked verdict. The lesson learned building it: **the loop is trivial;
the verifier (eval) is the whole game** — see `tools/loop/README.md`.

- **`eval.mjs`** — the verifier. Runs checks in trust × speed order,
  short-circuiting: `scope` (diff stays in `--allow`), `manifest` (`--series` has
  min/max), `typecheck`, `build`, `jsdom` smoke, `goal` (`--forbid`/`--require`
  regex + `--shrink=N` lines-vs-HEAD). Emits a structured verdict (`--json`).
- **`run.mjs`** — the loop. Pluggable `AGENT_CMD` (e.g.
  `claude -p --permission-mode acceptEdits` — note `--dangerously-skip-permissions`
  is blocked as root), feeds the verdict back, stuck-detector + step budget,
  injects `LESSONS.md` and appends to it on bail. Logs each step to `runs/*.jsonl`.
- **`ci-reward.mjs`** — the OUTER reward: parses build-data.mjs's `ok`/`SKIP` log
  into a per-series verdict (`--series` gate, `--summary` for CI, `--freeze` /
  `--check-fixtures` self-growing regression corpus). Wired into `data-check.yml`.
- **`LESSONS.md`** — cross-episode memory, injected into every prompt.

**Hard-won lessons (also encoded in `LESSONS.md`):** a generic eval proves "not
broken", not "task done" — encode the goal predicate or the loop has no gradient.
Name-forbids are gamed by renaming → pair with `--shrink`. A green verdict is
necessary, never sufficient — **always human-review the diff before commit** (the
loop reward-hacked twice before `--shrink` + review caught it). Start runs from a
clean tree (scope guard treats any dirty file as the agent's). Don't run
working-tree git ops while a loop is editing the tree.

**Code-task example (proven):** removing the dead generators —
`tools/loop/tasks/cleanup-dead-generators.md` (shipped 1194-line deletion).

### DONE — first outer-tier data task: `waiting-list` + `rtt-18-week` (2026-06-22)
The teed-up `tools/loop/tasks/data-waiting-list.md` task landed — the first full
exercise of the **outer (CI) reward tier** (`SKIP→ok→freeze`), driven through
`data-check.yml` + `ci-reward.mjs` from the session. NHS England has no national
RTT overview/full-CSV file anymore (only stale 2014/2019-20 archives), so both
series are rebuilt by aggregating the 18 most-recent per-month `Incomplete-Provider`
workbooks: sum the NHS "Provider" + independent-sector "IS Provider" all-specialties
("Total" treatment-function) rows (excluding the "with DTA" alternative-measure
sheets) → national total-incomplete + % within 18 weeks. Both frozen in
`tools/loop/fixtures/ok-series.json` (floor 12, observed 18). Research log:
`docs/backlog-research/nhs-rtt.md`. **Lessons:** (a) `sheet_to_json(header:1)` yields
sparse rows whose holes survive `.map()` → build dense rows with `Array.from` before
running header predicates; (b) the fetch step costs ~+4.5 min on every build (18 ×
9 MB downloads), so each monthly file is wrapped resilient and `RTT_MONTHS` caps it.

**NEXT STEP — next real-data candidate:** `turnover` is hard-blocked (Cloudflare
403); `defra-bathing-water` landed 2026-06-24 (see above). `defra-sewage-hours`
remains blocked on the 403-prone `environment.data.gov.uk` host — needs a
non-gated mirror. The new NHS RTT interactive dashboard
(`data.england.nhs.uk/dashboard/rtt`) was checked 2026-06-24 as a possible
lighter-weight replacement for the per-provider aggregation — CI-verified
HTTP 200 but zero static CSV/JSON/API links (likely a JS-rendered SPA,
invisible to a plain HTML probe); closed as a documented no-op, see
`docs/backlog-research/nhs-rtt.md`. `parseRtt()`'s per-provider aggregation
remains the approach of record. See `docs/backlog-research/` for per-series
notes.

## TODO / follow-ups
- **Enable blog analytics (GoatCounter):** the `/blog` route + cookieless beacon
  are wired but dormant. To turn on: create a free site at goatcounter.com, then
  add an **Actions variable** `VITE_GOATCOUNTER=https://YOURCODE.goatcounter.com/count`
  (repo → Settings → Secrets and variables → Actions → Variables). The next
  deploy starts counting. Unset = no tracker ships. Share via the UTM links in
  `docs/share-links.md` to attribute traction by channel/recipient.
