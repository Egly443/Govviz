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
- `ons(topic, cdid, dataset, freq)` → ONS timeseries JSON (topic/cdid/dataset may be arrays — every combo tried).
- `wb(indicator)` → World Bank API (OECD/WHO/UN-sourced, internationally comparable).
- `eesCsv(datasetId)` → DfE Explore Education Statistics CSV → `{headers, rows}`.
- `unhcr(endpoint, params)` → UNHCR population API.
- `govukContent(path)` → gov.uk Content API JSON. Use `.details.attachments` (a page's current files) and `.links.documents` (a collection's editions). Works for `government/statistics/*`, `government/collections/*`, and `government/statistical-data-sets/*`.
- `govukAttachments(path)` → that page's attachment list (title/url/content_type).
- `govukCollectionLatest(slug, accept)` → newest edition (by `public_updated_at`) in a gov.uk **collection** whose doc passes `accept` → base_path. Robust way to follow a yearly-republished release.
- `xlsxBook(url)` / `sheetRows(book, name)` → SheetJS reader for **.ods/.xls/.xlsx**. CI installs `xlsx` via `npm install --no-save xlsx` (keeps package-lock in sync); imported lazily. `sheetRows` returns array-of-arrays — numeric cells are numbers, suppression markers (`w`/`x`/`z`) are strings.
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
- **Transposed/grouped ODS:** gov.uk "accessible" workbooks often put periods in columns (DASA 3a/5e) or per-period `{date} Rate` triplets (HMPPS); detect the header row and iterate columns.
- **Branch CI harness:** `.github/workflows/data-check.yml` runs the fetcher on non-main pushes **without deploying** — validate parsers against live sources here (the sandbox has no internet), then promote to main. Production deploy (`deploy.yml`) runs only on `main`.

### Coverage — current state (64 ok / 3 skipped as of 2026-06-15)
Read the latest CI **"Fetch live data"** log (`mcp__github__get_job_logs`) for the authoritative
`ok`/`SKIP` tally — the manifest is cumulative so one run shows everything. ~64 series IDs now
bake real data across all departments (HMT/DHSC via ONS+World Bank; DfE via EES; DWP via World
Bank; plus the gov.uk-ODS / statistical-data-set / england.nhs.uk operational series listed below).

Converted illustrative→real in the 2026-06 campaign: dwp-fraud-error, dfe-teacher-recruitment,
dfe-attainment-gap, moj-crown-backlog, moj-cost-per-prisoner, moj-officer-resignations,
moj-completion-days, mod-personnel-shortfall, mod-voluntary-outflow, mod-procurement,
dft-capital-overrun, ho-visa-sla, dft-rail-cancellations, ae-performance, agency-spend,
discharge-delays.

### Remaining illustrative
**Fetchers wired but currently SKIP (CI-verified blockers):**
| Series | Blocker |
|---|---|
| `waiting-list` | NHS England discontinued the national RTT timeseries; only split per-org monthly XLSX (`Incomplete-Provider` ~9 MB, etc.). Needs summing providers × RTT week-bands. `data.england.nhs.uk` CKAN → 404. |
| `rtt-18-week` | Same per-provider RTT workbook; % within 18 weeks must be aggregated from it. |
| `turnover` | digital.nhs.uk Cloudflare-blocks automated access (403 even with a browser UA); data.gov.uk `nhs-workforce-turnover` resources point back to digital.nhs.uk. Needs a non-gated source. |

**Hard-blocked (no fetcher; charts intentionally illustrative):** DWP Stat-Xplore series
(`dwp-pip-clearance`, `dwp-work-coach-ratio`, `dwp-uc-mr`) need a free API key as CI secret
`DWP_STATXPLORE_KEY` (`POST https://stat-xplore.dwp.gov.uk/webapi/rest/v1/table`, `Authorization: Bearer {key}`);
`mod-readiness` (classified); `ho-caseworker-turnover`, `ho-hotel-spend`, `dfe-dsg-deficit`,
`dft-dvla-backlog`, `dft-srn-degradation` (PDF / parliamentary-answer / LA-return only).

Per-series research notes (sources, drafted fetchers, dead-ends) live in `docs/backlog-research/`.


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
