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

### Coverage (as of last session)
~40 series real across all 8 departments (CPI, PSND %GDP + £tn "£3tn chart",
deficit, unemployment, GDP/GNI per head, productivity, real income; doctors/
nurses/beds per 1,000, life expectancy, infant mortality, health spend, suicide,
measles, OOP; education spend, pupil-teacher, tertiary; homicide, foreign-born;
defence spend, forces personnel; over-65s, dependency, female participation,
Gini, youth unemployment; road deaths, CO₂). Read the latest CI **"Fetch live
data"** log (via `mcp__github__get_job_logs`) for the live `ok`/`SKIP` tally —
the manifest is cumulative so one run shows everything.

### Still illustrative — the **operational** metrics
NHS RTT/A&E/discharge/agency/vacancies, MoJ (all: court backlog, reoffending,
prisons), Home Office asylum/visa/hotels, MoD personnel-shortfall/outflow/
procurement/readiness, DWP PIP/work-coach/fraud/UC, DfT rail/DVLA/SRN, and a few
Treasury (tax burden, tax split, debt interest, wages line). **These have no
stable API** — NHS RTT is dated **zipped Excel**, `data.justice.gov.uk` is a
**dashboard**. They can't be blind-fetched like ONS/WB.

### Next session — gov.uk MCP route (user's chosen approach)
`.mcp.json` declares a `govuk-services` MCP server (`python -m govuk_mcp`). It is
**NOT active yet**: `govuk_mcp` is not installed and the sandbox can't pip-install
(no internet). To use it: the **environment setup script must install the package**,
then a **fresh session** loads `.mcp.json` and `mcp__govuk-services__*` tools
appear. Then source the operational metrics **through those tools** (like the
GitHub MCP). If the package turns out not to exist, fall back to committing small
**sourced snapshots** (real figures + citation), or add a zip/Excel CI scraper.

### Workflow notes
- User granted **direct pushes to `main`** for data iteration (`git push origin
  HEAD:main`, then `git push -f origin claude/github-repo-import-CAH4y` to keep
  the branch in sync). CI fetch runs "in the background"; read its log afterwards.
- Commit as `Claude <noreply@anthropic.com>` (`git config user.email
  noreply@anthropic.com && git config user.name Claude`) so commits verify.
- Tax burden = receipts (ONS `ANBV`, £m) ÷ GDP — needs a ratio transform if wired.
  Wages line = ONS `KAC3`/`lms` (its `/data` JSON needs a closer look).
