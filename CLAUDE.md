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
  `main` (open a PR) to go live.
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
gov.uk, NAO…), never fabricated. Charts with no real source yet fall back to
clearly-labelled illustrative generators.

### Architecture
- **`scripts/build-data.mjs`** fetches each series in CI and writes
  `src/generated/seriesData.ts`. Runs as the workflow's **"Fetch live data"**
  step (before `vite build`). Per-source `try/catch`; **never fails the build**.
- **`src/generated/seriesData.ts`** is committed as an **empty `{}`** (no datasets
  in git); CI overwrites it for the production build only.
- **Data layer** (`src/components/data.ts`): `realPoints(id, fallback)` and
  `realLine(id, lineId, fallback)` prefer baked data, else the illustrative
  fallback. A chart becomes "real" by (a) wrapping its `points` in `realPoints`
  and (b) adding a manifest entry in `build-data.mjs` keyed by the same `id`.
- **Guard:** every manifest entry has `min`/`max`; a fetched latest value outside
  the range is rejected → falls back. A wrong-but-resolving code can never show
  wrong data. `scale` multiplies raw values; fetchers retry transient errors.

### Fetch helpers (in build-data.mjs)
- `ons(topic, cdid, dataset, freq)` → hits `www.ons.gov.uk/{topic}/timeseries/
  {cdid}/{dataset}/data` (clean JSON). `topic`/`cdid`/`dataset` may be **arrays** —
  every combination is tried (auto-resolves the right dataset).
- `wb(indicator)` → World Bank API `api.worldbank.org/v2/country/GBR/indicator/
  {code}?format=json` (OECD/WHO/UN sourced, internationally comparable).

### Discovering codes — **WebSearch works** (curl/WebFetch don't!)
The sandbox blocks `curl`/`WebFetch`, **but the `WebSearch` tool reaches the
internet.** Use it to find ONS CDIDs/datasets and World Bank codes, then wire the
fetcher (CI does the actual fetch). e.g. searching "ONS real household disposable
income per head CDID" found `CRXX`/`ukea`.

### Coverage — current state (49 SOURCES entries, 49 ok / 0 SKIP as of 2026-06-12)

**~47 unique series IDs are live** (real data fetched in CI). Read the latest CI
**"Fetch live data"** log (via `mcp__github__get_job_logs`) for the authoritative
`ok`/`SKIP` tally — the manifest is cumulative so one run shows everything.

| Dept | Live series IDs |
|------|----------------|
| HMT  | hmt-psnd, hmt-psnd-cash, hmt-deficit, hmt-unemployment, hmt-gdp-per-capita, hmt-gdp-growth, hmt-real-income, hmt-productivity, hmt-cost-of-living (cpi + wages lines), hmt-investment-gdp, hmt-current-account, hmt-employment-rate, hmt-participation, hmt-trade-gdp, hmt-savings, hmt-gni-per-capita, hmt-tax-burden, hmt-debt-interest, hmt-tax-split (direct + indirect lines) |
| DHSC | dhsc-clinical-per-1000 (doctors + nurses lines), dhsc-beds-per-1000, dhsc-health-spend-gdp, dhsc-health-spend-pc, dhsc-infant-mortality, life-expectancy, dhsc-suicide, dhsc-measles-imm, dhsc-oop, vacancy (nursing vacancy rate) |
| DfE  | dfe-edu-spend-gdp, dfe-pupil-teacher, dfe-tertiary-enrol, dfe-teacher-recruitment (EES), dfe-ect-attrition (EES) |
| HO   | ho-homicide-rate, ho-migrant-stock, ho-asylum-backlog |
| MoD  | mod-defence-spend-gdp, mod-personnel-total |
| DWP  | dwp-pop-65, dwp-oldage-dependency, dwp-female-participation, dwp-gini, dwp-youth-unemp |
| DfT  | dft-road-death-rate, dft-co2-pc |

### Still illustrative — ~28 series — **FOR OPUS TO SOLVE**

These are the series that remain illustrative. Each has a specific blocker; a
sufficiently capable model should be able to find a workaround (scraping, snapshot
commits, alternative indicators, or zip/Excel CI parsers).

#### DHSC operational (6 series in `src/components/data.ts`)
| Series | Description | Blocker |
|--------|-------------|---------|
| `waitingList` | NHS RTT total waiting list size | NHS England publishes dated **zipped Excel** (`https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/`); no REST JSON endpoint |
| `rtt18Week` | % patients waiting ≤18 weeks | Same zip; sheet "Provider" col "Total within 18 weeks" |
| `dischargeDelays` | Delayed discharges (bed-days lost) | NHS England daily SitRep, archived Excel |
| `agencySpend` | Agency/locum spend (£bn) | NHS England board papers / NAO; no structured API |
| `aePerformance` | A&E 4-hour performance % | NHS England A&E monthly Excel; no REST JSON |
| `turnover` | NHS staff turnover % | NHS Digital workforce stats Excel; no REST JSON |

**Possible approach:** CI wget of the known Excel URL + `xlsx` npm package to
parse. The RTT zip URL pattern is stable (`rtt-*-full-extract.zip`). The
`xlsx` package is already a common npm dep and can read `.xlsb`/`.xlsx`.

#### MoJ (4 series in `src/components/departments.ts`)
| Series | Blocker |
|--------|---------|
| `moj-crown-backlog` | `data.justice.gov.uk` is a Tableau dashboard; no API. NAO/MoJ annual reports are PDFs. |
| `moj-officer-resignations` | HMPPS workforce quarterly bulletin is Excel-only. |
| `moj-cost-per-prisoner` | HMPPS annual report & accounts, Excel annex. |
| `moj-completion-days` | LAA/HMCTS published as Excel/CSV in ad-hoc statistical releases. |

**Possible approach:** `data.justice.gov.uk` has a `/views/{view}/data.csv?...`
Tableau endpoint — worth probing. Alternatively commit sourced snapshots from
the MoJ/HMPPS annual report Excel files (manual, citable).

#### MoD operational (4 series)
| Series | Blocker |
|--------|---------|
| `mod-personnel-shortfall` | DASA (Defence Analytical Services & Advice) publishes UK Armed Forces quarterly manpower as Excel; no API. |
| `mod-voluntary-outflow` | Same DASA quarterly bulletin. |
| `mod-procurement` | IPA GMPP annual report is PDF/Excel; no structured API. |
| `mod-readiness` | Classified / not published at all. Consider replacing with DASA-published readiness-proxy (e.g. trained strength %). |

**Possible approach:** DASA `www.gov.uk/government/collections/uk-armed-forces-quarterly-service-personnel-statistics` — check if any CSV version is available alongside the Excel.

#### DWP operational (4 series)
| Series | Blocker |
|--------|---------|
| `dwp-pip-clearance` | DWP Stat-Xplore (`stat-xplore.dwp.gov.uk`) requires a **free API key** (register at the site). Endpoint is `POST /table` with a JSON query body. |
| `dwp-work-coach-ratio` | Same Stat-Xplore; claimant-count ÷ work-coach headcount. |
| `dwp-fraud-error` | DWP publishes annual fraud/error estimates as Excel on gov.uk — URL pattern is stable. |
| `dwp-uc-mr` | DWP Stat-Xplore UC mandatory reconsideration data. |

**Possible approach for `dwp-fraud-error`:** The annual Excel is at a stable
`https://assets.publishing.service.gov.uk/...` URL — CI can wget + parse with
`xlsx`. For Stat-Xplore series: user could register for a free API key and add it
as a CI secret `DWP_STATXPLORE_KEY`; the fetcher sends `Authorization: Bearer
{key}` to `https://stat-xplore.dwp.gov.uk/webapi/rest/v1/table`.

#### Home Office operational (3 series)
| Series | Blocker |
|--------|---------|
| `ho-caseworker-turnover` | Not published as a structured dataset; appears only in HO annual reports. |
| `ho-hotel-spend` | Published in parliamentary answers / NAO reports; no structured API. |
| `ho-visa-sla` | UKVI published quarterly transparency data as Excel on gov.uk — URL may be stable. |

**Possible approach for `ho-visa-sla`:** Check
`https://www.gov.uk/government/collections/migration-transparency-data` for a
directly linkable CSV/Excel; CI can scrape if URL is stable.

#### DfE non-operational (2 series)
| Series | Blocker |
|--------|---------|
| `dfe-attainment-gap` | EPI publish an annual report PDF/Excel; no API. NPDB (National Pupil Database) data is behind a data-share agreement. |
| `dfe-dsg-deficit` | DSG deficit is reported at local-authority level in DfE's section 251 outturn returns (Excel); no aggregate API. |

**Possible approach:** EES (`explore-education-statistics.service.gov.uk`) may
have an attainment-gap dataset — search EES catalogue for "attainment gap" or
"disadvantage gap". The `eesCsv(datasetId)` helper in `build-data.mjs` can fetch
it if found.

#### DfT operational (4 series)
| Series | Blocker |
|--------|---------|
| `dft-rail-cancellations` | ORR (Office of Rail and Road) publishes train performance data as Excel/CSV; `dataportal.orr.gov.uk` has some CSV endpoints — worth probing. |
| `dft-dvla-backlog` | DVLA does not publish transaction backlog as open data; appears in parliamentary answers only. |
| `dft-capital-overrun` | IPA GMPP annual report (PDF/Excel); no API. |
| `dft-srn-degradation` | National Highways asset condition data is in annual reports; no API. |

**Possible approach for `dft-rail-cancellations`:** ORR data portal
(`https://dataportal.orr.gov.uk/statistics/performance/train-punctuality/`) may
have a CSV download link. CI can wget the CSV and parse the cancellation % column.

### Workflow notes
- User granted **direct pushes to `main`** for data iteration:
  `git push origin HEAD:main && git push origin claude/govuk-mcp-verify-l6kckt`
- Commit as `Claude <noreply@anthropic.com>` (`git config user.email
  noreply@anthropic.com && git config user.name Claude`) so commits verify.
- Working branch: `claude/govuk-mcp-verify-l6kckt`
- **WebSearch reaches the internet** (curl/WebFetch don't). Use it to find stable
  CSV/Excel URLs or dataset IDs, then wire in CI — the actual fetch happens in CI.
- `eesCsv(datasetId)` helper already in `build-data.mjs` — reuse for any new EES
  dataset IDs found.
- **EES catalogue search:** `https://explore-education-statistics.service.gov.uk/
  data-catalogue` — use WebSearch to find dataset IDs matching a topic.
- `xlsx` npm package is available if CI needs to parse Excel files; add as a CI
  `npm install --no-save xlsx` step before the fetch script if needed.
- Tax burden = receipts (ONS `ANBV`, £m) ÷ GDP — already wired via WB
  `GC.TAX.TOTL.GD.ZS` (tax % GDP). The explicit ONS ratio is not needed unless
  UK-domestic definition differs materially.
