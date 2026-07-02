# Govviz AI-ready data critique and implementation recommendations

Date: 2026-07-02

This brief turns the critique of the essay, website, deployed data product, and
repository into numbered implementation recommendations. Each recommendation is
written so an LLM can pick it up as a backlog item and implement it to a high
standard.

## Evidence used

- ODI, "A framework for AI-ready enterprise data", June 2026:
  https://theodi.hacdn.io/media/documents/A_framework_for_AI-ready_enterprise_data.pdf
- GDS and DSIT, "Guidelines and best practices for making government datasets
  ready for AI", published 19 January 2026:
  https://www.gov.uk/government/publications/making-government-datasets-ready-for-ai/guidelines-and-best-practices-for-making-government-datasets-ready-for-ai
- DSIT, "National Data Library: progress update, January 2026", published
  26 January 2026:
  https://www.gov.uk/government/publications/national-data-library-progress-update-january-2026/national-data-library-progress-update-january-2026
- GDS, "Opportunities for public sector data survey 2026" and privacy notice:
  https://www.gov.uk/government/publications/opportunities-for-public-sector-data-survey-2026
- ODI, "Prototyping an AI-ready National Data Library", March 2026:
  https://theodi.org/insights/reports/prototyping-an-ai-ready-national-data-library/
- DSIT, "AI Opportunities Action Plan", 13 January 2025:
  https://www.gov.uk/government/publications/ai-opportunities-action-plan/ai-opportunities-action-plan
- UK Government, "The Government Data Quality Framework":
  https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework
- GDS, "Data and AI Ethics Framework", last updated 18 December 2025:
  https://www.gov.uk/government/publications/data-ethics-framework
- GDS, "Algorithmic Transparency Recording Standard Hub", last updated
  8 May 2025:
  https://www.gov.uk/government/collections/algorithmic-transparency-recording-standard-hub
- Govviz deployed checks on 2026-07-02:
  `https://egly443.github.io/Govviz/overview` returned HTTP 404 with the SPA
  fallback body; `https://egly443.github.io/Govviz/blog.md` returned HTTP 200;
  `https://egly443.github.io/Govviz/data/catalog.json` returned HTTP 200;
  `https://egly443.github.io/Govviz/data/series/index.json` listed 124 series;
  `https://egly443.github.io/Govviz/data/mcp.json` exposed the MCP descriptor.

## High-level critique

The essay has the right core thesis: UK public statistics are trusted but often
not machine-readable enough for AI agents, and the fix is a thin, standard,
machine-first publishing layer over existing official sources. The strongest
parts are the field evidence, the Trust x Machine-readability model, the
AI-ready series profile, and the fact that Govviz already ships a reference
data product rather than only an argument.

The gap is that the project now needs to move from a persuasive personal field
report to a standards-grade reference implementation. Since January 2026, the
official conversation has become more concrete: GDS/DSIT have a four-pillar
AI-ready data framework and self-assessment, DSIT has launched NDL discovery and
five kickstarter projects, and ODI has published both NDL-lite and a 21-criteria
enterprise AI-ready data framework. Govviz should explicitly map to those
criteria, prove its claims continuously, publish machine-readable conformance
reports, and avoid any deployment or metadata weaknesses that let critics say
"good essay, but not a production-quality implementation".

## Numbered recommendations

### 1. Reframe the essay around the 2026 policy state, not only the original field report

**Files to touch:** `docs/blog-open-data-for-ai.md`,
`scripts/prerender-blog.mjs`.

**Implementation:** Add a short "What changed in 2026" section near the top,
before the war stories. It should state that the diagnosis is now shared by
GDS/DSIT and ODI, then distinguish Govviz's contribution: an accountability-tail
conformance suite and a live downstream reference implementation for individual
public performance series. Update references to include the June 2026 ODI
enterprise framework, not only ODI NDL-lite.

**Acceptance criteria:** The first 20 percent of the essay tells an official
reader why this is timely as of July 2026; it names GDS/DSIT, DSIT NDL, ODI
NDL-lite, and ODI enterprise AI-ready data; and it clearly says Govviz is the
execution and assurance layer, not a rival national platform.

### 2. Add an explicit crosswalk from Govviz to the GDS/DSIT four pillars and ODI 21 criteria

**Files to touch:** `docs/conformance/ai-ready-series-profile.md`,
`docs/conformance/README.md`, `docs/blog-open-data-for-ai.md`,
`scripts/build-open-data.mjs`.

**Implementation:** Create a table mapping each Govviz profile field and build
gate to:

- GDS/DSIT pillars: technical optimisation; data and metadata quality;
  organisation and infrastructure context; legal, security and ethical
  compliance.
- ODI enterprise categories: dataset properties, metadata, surrounding
  infrastructure, governance.
- ODI enterprise criteria that Govviz already satisfies: appropriate file
  formats, machine-readable metadata, provenance, versioned assets,
  accessibility via a data product and API-like static URLs, version control,
  monitoring checkpoints via build gates.
- Criteria Govviz does not yet satisfy: policy-as-code access controls,
  named data stewards, clear data access process, active cataloguing, semantic
  knowledge graph, and an AI-data feedback loop.

**Acceptance criteria:** A reviewer can see exactly where Govviz conforms, where
it is intentionally out of scope as a public aggregate dashboard, and where the
next implementation work sits.

### 3. Define "better than other government implementations" as a measurable benchmark

**Files to add:** `docs/benchmarks/README.md`,
`docs/benchmarks/benchmark-cases.json`.

**Implementation:** Create a benchmark suite comparing Govviz, data.gov.uk,
GOV.UK publication pages, ONS API, ODI NDL-lite, London Datastore, and at least
one international reference where applicable. Use 10 to 20 tasks: resolve a
series, fetch latest value, fetch full time series, identify unit, identify
geography, determine licence, identify next release, trace provenance, fetch via
script with no browser, and consume through an agent interface. Score each
target on latency, HTTP status, machine-readability, semantic safety,
provenance, and freshness.

**Acceptance criteria:** "Better" becomes a repeatable result, not a slogan.
The essay can cite a table like "Govviz passes 9/10 tasks for 124 series; source
platforms fail on deep-link status, metadata, unstable URLs, or semantic
ambiguity".

### 4. Fix deployed deep-link HTTP 404s for `/overview`

**Files to touch:** `scripts/prerender-blog.mjs` or a new
`scripts/prerender-overview.mjs`, `package.json`, possibly `index.html`.

**Implementation:** Generate `dist/overview/index.html` during build, using the
same approach as `scripts/prerender-departments.mjs`. The page should reuse the
built app shell, set title, canonical URL, OG tags, JSON-LD, and static no-JS
content summarising the whole-of-government dashboard and linking to
`/data/catalog.json`, `/data/series/index.json`, `/blog`, and the repo.

**Acceptance criteria:** `curl -I https://egly443.github.io/Govviz/overview`
returns HTTP 200, not 404. The body contains meaningful no-JS content and still
hydrates into the interactive app for browsers.

### 5. Prerender `/about` and verify `/data/` remains the static data portal

**Files to touch:** add `scripts/prerender-static-routes.mjs` or extend existing
prerender scripts; update `package.json`.

**Implementation:** `https://egly443.github.io/Govviz/data/` already serves a
static HTML data portal with HTTP 200, so preserve that behaviour. Generate
`dist/about/index.html` with no-JS methodology content, and add a deployed URL
check proving `/data/` still returns the static data portal rather than the SPA
fallback. Include canonical tags, schema.org Dataset/TechArticle where
appropriate, and links to JSON, CSV, CSVW, profile, conformance suite, and MCP
descriptor.

**Acceptance criteria:** Direct non-JS fetches of the public top-level pages do
not depend on the SPA fallback. Search engines, AI crawlers, and scripts can
read the implementation claims as text.

### 6. Turn the overview page into a proof surface, not only a dashboard

**Files to touch:** `src/components/OverviewPage.tsx`,
`src/components/DataHealthStrip.tsx`, `src/components/GovTreemap.tsx`,
`src/styles.css`.

**Implementation:** Add compact links from the data health strip to the open
data catalogue, conformance report, and source-failure report. In the modal
opened by a tile, add "JSON", "CSV", "CSVW", and "source" buttons for the
selected series. Keep the UI restrained and operational; do not add a marketing
hero.

**Acceptance criteria:** A visitor can move from a chart tile to the exact
machine-readable artefacts in one click. The visible product demonstrates
"machine-first, human-rendered" rather than merely describing it.

### 7. Publish a generated conformance report for the live deployment

**Files to touch:** `scripts/check-open-data.mjs`,
`scripts/build-open-data.mjs`, `src/components/DataPage.tsx`.

**Implementation:** In addition to console output, emit
`dist/data/conformance-report.json` and `dist/data/conformance-report.html`.
Include counts for total series, series with observations, series with
`validRange`, series with source byte hash, series with ONS geography, records
missing non-required but recommended governance fields, stale/aged sources, and
all warnings. Link this report from `/data` and `DataHealthStrip`.

**Acceptance criteria:** Anyone can inspect the deployed conformance state
without reading CI logs. The report should be stable enough to use as evidence
in the essay and benchmark suite.

### 8. Stop treating deployment fetch failures as acceptable for priority series

**Files to touch:** `.github/workflows/deploy.yml`,
`.github/workflows/data-check.yml`, `tools/loop/ci-reward.mjs`,
`scripts/build-data.mjs`, `docs/conformance/test-cases.json`.

**Implementation:** Keep best-effort fetching for exploratory series, but define
a frozen "priority set" covering the essay's accountability-tail cases and all
homepage/overview lead indicators. A deploy should fail if any priority series
fails to fetch, falls below a minimum point count, lacks `srcUrl`, lacks
`guard`, or is stale beyond its cadence-specific tolerance. Reuse the existing
fixture regression logic from the branch data-check workflow in the main deploy
workflow.

**Acceptance criteria:** The site cannot deploy with broken core evidence while
still claiming to be a reference implementation.

### 9. Strengthen the AI-ready series profile to v0.2 with governance fields

**Files to touch:** `docs/conformance/ai-ready-series-profile.md`,
`docs/conformance/ai-ready-series.schema.json`, `scripts/build-open-data.mjs`,
`src/components/data.ts`.

**Implementation:** Add recommended fields, initially warnings not hard
failures: `dataSteward`, `contact`, `accessClass`, `accessProcess`,
`legalBasis`, `dataProtection`, `riskOwner`, `qualityOwner`,
`methodologyUrl`, `revisionPolicyUrl`, `releaseCalendarUrl`,
`semanticTags`, `relatedSeries`, `sourceSystem`, `lineage`, `qualityStatement`,
`knownLimitations`, and `machineUseRestrictions`. Mark which fields are not
usually knowable by a downstream compiler and which should be required from a
primary publisher.

**Acceptance criteria:** The profile aligns with ODI governance criteria without
pretending Govviz can supply official stewardship facts it does not own.

### 10. Separate downstream compiler metadata from upstream publisher metadata

**Files to touch:** `scripts/build-open-data.mjs`,
`docs/conformance/ai-ready-series-profile.md`, `DATA-LICENCE.md`.

**Implementation:** Add an explicit `compiler` object to each record:
`name`, `url`, `compiledAt`, `pipelineCommit`, `sourceBytesHash`, and
`conformanceVersion`. Keep `producer` for the primary producer. Add a
`publisherClaim` or `upstreamConformance` field that defaults to
`not-asserted-by-primary-publisher`.

**Acceptance criteria:** No one can confuse Govviz's reference rendering with an
official producer publication. The distinction strengthens credibility with
GDS, ODI, OSR, and departments.

### 11. Replace guessed next-release dates with explicit provenance-safe release metadata

**Files to touch:** `scripts/build-open-data.mjs`, `src/components/data.ts`,
`docs/conformance/ai-ready-series.schema.json`.

**Implementation:** Current records set `nextReleaseEstimated: true`, but the
generated date can look authoritative. Change `nextRelease` to `null` unless a
source-specific release calendar is known. Add `expectedCadence`,
`latestObservedPeriod`, `latestFetchedAt`, `freshnessStatus`, and
`freshnessReason`. If estimating, put the estimate in `estimatedNextPeriod`, not
`nextRelease`.

**Acceptance criteria:** Metadata never implies official release knowledge that
Govviz does not have. Freshness remains visible and machine-readable.

### 12. Add source stewardship and feedback routes

**Files to add:** `docs/source-stewards.json`,
`src/components/SourceFeedbackLink.tsx` if needed.

**Implementation:** For each source family, record the producer, owner URL,
statistics contact or general contact, feedback route, licence page, release
calendar page if available, and known access constraints. Expose a "Report data
issue" link from each series record and modal. Where no official contact exists,
link to a GitHub issue template prefilled with the series id, source URL, and
record URL.

**Acceptance criteria:** Govviz implements the ODI requirement for identifiable
points of contact as far as a downstream compiler can, and clearly labels gaps
that only primary producers can close.

### 13. Add policy-as-code access metadata even for open public aggregates

**Files to add:** `docs/access-policy.json`, `docs/access-policy.md`.
**Files to touch:** `scripts/build-open-data.mjs`, `dist/data/profile.json`
generation.

**Implementation:** Define access classes: `open-public-aggregate`,
`open-registration-required`, `restricted-sensitive`, and
`not-published-by-source`. For Govviz data, set `open-public-aggregate` with no
API key, OGL/CC BY licence inheritance, CORS allowed, no personal data, and
reasonable automated use expectations. Include this policy URI in each record.

**Acceptance criteria:** The project can say it implements "agent-aware access
controls via policy-as-code" for its own data product, while acknowledging that
upstream restricted microdata is out of scope.

### 14. Build an executable version of the conformance suite

**Files to add:** `scripts/run-conformance-suite.mjs`.
**Files to touch:** `docs/conformance/test-cases.json`, `package.json`.

**Implementation:** The static JSON cases should become runnable checks with
modes:

- `--target=govviz` checks the deployed Govviz records.
- `--target=upstream` checks official source URLs where safe.
- `--offline` checks only local `dist/data`.

For each case, implement a probe that follows the pass criteria in
`test-cases.json` and emits JSON and Markdown results.

**Acceptance criteria:** `npm run conformance` produces a report showing which
cases Govviz renders in the target shape and which upstream producers still do
not.

### 15. Add a public "field notes" appendix for every war story

**Files to add:** `docs/evidence/README.md`,
`docs/evidence/<case-id>.md`.

**Implementation:** For each essay example, create a reproducible evidence note
with source URL, observed failure mode, the exact parser workaround in
`scripts/build-data.mjs`, the desired upstream pass criteria, screenshots or
small redacted snippets if useful, and a "last verified" date. Link these notes
from the essay and conformance cases.

**Acceptance criteria:** The essay becomes harder to dismiss as anecdote. Each
claim has a reproducible artefact and a code pointer.

### 16. Make the benchmark and conformance outputs first-class website pages

**Files to touch:** `src/components/DataPage.tsx`, `TopNav.tsx`,
`scripts/build-open-data.mjs`, CSS as needed.

**Implementation:** Add a "Conformance" or "Proof" link under Data, not a new
marketing page. The page should show:

- data health summary;
- conformance report;
- benchmark scores;
- source failure/staleness log;
- links to profile, schema, test cases, and MCP descriptor.

**Acceptance criteria:** A standards reviewer can inspect the live evidence
without cloning the repo.

### 17. Add semantic interlinkage and active cataloguing metadata

**Files to touch:** `src/components/data.ts`, `src/components/departments.ts`,
`scripts/build-open-data.mjs`, `docs/conformance/ai-ready-series.schema.json`.

**Implementation:** Add `semanticTags` and `subjectUris` to series definitions.
Use stable vocabularies where possible: ONS geography URIs, DCAT themes,
GSS/SDMX concepts, Wikidata only where appropriate, and GOV.UK organisation
URLs for producers. Generate a simple `dist/data/graph.jsonld` connecting
departments, producers, series, geographies, licences, and source datasets.

**Acceptance criteria:** Govviz moves from a catalogue of files to an initial
knowledge graph, aligning with ODI's active cataloguing and semantic
interlinkage criteria.

### 18. Improve the MCP layer from descriptor-only to tested agent contract

**Files to touch:** `tools/mcp/govviz-mcp.mjs`, `tools/mcp/README.md`,
`scripts/build-open-data.mjs`.

**Implementation:** Add JSON Schema input/output definitions for each MCP tool,
pagination for `list_series`, filtering by department/theme/cadence, and a
`validate_value` tool that checks a proposed value against `validRange`,
periodicity, and unit. Add a smoke test script that starts the MCP server and
calls `initialize`, `tools/list`, and each tool with a known series.

**Acceptance criteria:** The MCP layer is not only described, it is validated in
CI and useful for agents doing source-grounded work.

### 19. Add an OpenAPI or static REST contract beside MCP

**Files to add:** `dist/data/openapi.json` generation in
`scripts/build-open-data.mjs`, source template under `docs/conformance/`.

**Implementation:** Publish a small OpenAPI 3.1 document for static endpoints:
`/data/catalog.json`, `/data/series/index.json`,
`/data/series/{id}.json`, `/data/series/{id}/data.csv`, and
`/data/series/{id}/data.csv-metadata.json`. Include schemas or references to
the profile schema.

**Acceptance criteria:** Consumers who do not use MCP still get a formal,
tool-ingestible API contract.

### 20. Add observability history, not only point-in-time health

**Files to touch:** `scripts/build-data.mjs`, `scripts/build-open-data.mjs`,
`tools/loop/ci-reward.mjs`.

**Implementation:** Emit `dist/data/health-history.json` or a rolling
`docs/data-health-history.json` with build date, fetch status by source,
duration, HTTP status where available, point count, content hash, staleness, and
warnings. Keep the file bounded to avoid repo bloat. Surface aggregate trend
lines on the data proof page.

**Acceptance criteria:** Govviz can show whether data availability and freshness
are improving, degrading, or stable.

### 21. Add an AI-data feedback loop

**Files to add:** `.github/ISSUE_TEMPLATE/data-quality.yml`,
`docs/feedback-loop.md`.
**Files to touch:** `DataPage`, `TrendPanel` or modal code.

**Implementation:** Provide structured feedback links for:
wrong value, stale source, unclear definition, missing series, bad unit, bad
geography, and agent-consumption failure. Each link should prefill series id,
record URL, source URL, latest fetched date, and observed value. Document a
triage loop: issue opened, source verified, parser/profile fixed, conformance
case added if the failure is reusable.

**Acceptance criteria:** Govviz implements the ODI "AI-data feedback loop"
criterion in a transparent, open-source form.

### 22. Tighten the essay's tone for official readers

**Files to touch:** `docs/blog-open-data-for-ai.md`.

**Implementation:** Keep the vivid field evidence, but reduce phrases that make
the argument easier to reject as polemic. Replace "The agents are coming" with a
more concrete claim about current agent workflows and official-source fallback
risk. Consider replacing the final "graves" sentence with "the accountability
tail". Add a short concession that primary producers operate under real legal,
accessibility, statistical, and operational constraints.

**Acceptance criteria:** The essay remains forceful but reads like a serious
proposal a GDS, ODI, OSR, or departmental data leader can forward internally.

### 23. Shorten the war stories and move detail into evidence appendices

**Files to touch:** `docs/blog-open-data-for-ai.md`;
add files under `docs/evidence/`.

**Implementation:** Convert the long "museum of hostile shapes" section into a
compact table: case, trust score, current machine-readability score, failure
mode, desired conformant shape, evidence link. Move detailed narrative and
parser specifics into the evidence notes recommended above.

**Acceptance criteria:** The essay gets easier to read and cite, while the
evidence gets stronger rather than disappearing.

### 24. Publish a concrete ask for each institution

**Files to touch:** `docs/blog-open-data-for-ai.md`,
`docs/conformance/README.md`.

**Implementation:** Add a table:

- GDS/Data Standards Authority: adopt or fork the AI-ready series profile as a
  thin publishing profile.
- DSIT/NDL team: use the accountability-tail conformance suite as acceptance
  tests for priority series and kickstarter projects.
- ODI: compare Govviz cases against NDL-lite and the enterprise framework;
  contribute missing criteria or case studies.
- OSR/UKSA: treat machine-readability as part of Value and Quality assurance.
- Departments/ALBs: publish stable ids, tidy data, provenance, release
  calendars, and machine-readable suppression.

**Acceptance criteria:** A reader knows exactly what action is being requested
from them, rather than only agreeing with the diagnosis.

### 25. Answer the public sector data survey in repo form

**Files to add:** `docs/policy-submissions/public-sector-data-survey-2026.md`.

**Implementation:** Draft a submission using the survey's questions: which
public sector datasets matter for AI, what they would be used for, and how the
public sector should make them available. Prioritise the Govviz accountability
tail: NHS waiting lists, storm overflows, bathing water, courts backlog,
homelessness, asylum, HMRC service performance, major projects, local
government finance. Include links to the conformance cases.

**Acceptance criteria:** Govviz engages the live GDS/DSIT process, not only the
general debate.

### 26. Add official-source freshness checks to the essay before each deploy

**Files to add:** `scripts/check-policy-references.mjs` or
`docs/policy-watch.md`.
**Files to touch:** `.github/workflows/deploy.yml` if automated.

**Implementation:** Maintain a short list of volatile policy URLs: NDL progress
update, AI-ready data guidance, ODI NDL-lite, ODI enterprise framework,
Data and AI Ethics Framework, ATRS hub. At minimum, document a manual checklist
before major essay revisions. Better: write a script that fetches headers and
checks last-modified or page text for updates.

**Acceptance criteria:** The essay does not accidentally cite January 2026 as
the latest position if GDS, DSIT, or ODI publish a later update.

### 27. Add source-level quality dimensions from the Government Data Quality Framework

**Files to touch:** `docs/conformance/ai-ready-series-profile.md`,
`scripts/build-open-data.mjs`, `src/components/data.ts`.

**Implementation:** Add optional quality dimensions for accuracy, completeness,
uniqueness, consistency, timeliness, and validity. For downstream compiled
series, Govviz can supply timeliness, validity against range, completeness of
time periods, and parser consistency. It should not overclaim upstream accuracy.

**Acceptance criteria:** Govviz aligns with the Government Data Quality
Framework while keeping the boundary between source quality and compiler
quality clear.

### 28. Add algorithmic transparency and ethics alignment for Govviz's own scoring

**Files to add:** `docs/algorithmic-transparency.md`.
**Files to touch:** `src/components/overview.ts`, `AboutPage`.

**Implementation:** Document the RAG scoring algorithm, target versus own-range
fallback, uncertainty handling, momentum slope, spend sizing, limitations, and
known risks of misinterpretation. Cross-reference the Data and AI Ethics
Framework and ATRS. Govviz likely does not need an official ATRS record because
it is not a government decision tool, but it can voluntarily provide the same
transparency fields.

**Acceptance criteria:** The dashboard's own analytical layer is as transparent
as the data layer it advocates.

### 29. Add a reproducible local build path for real data

**Files to touch:** `README.md`, `CLAUDE.md`, `scripts/build-data.mjs`,
possibly `.env.example`.

**Implementation:** Document exactly how a contributor can fetch live data
locally, including required optional packages (`xlsx`, `fflate`), expected
runtime, network assumptions, and how to restore `src/generated/seriesData.ts`
to the empty committed form after testing. Add `npm run fetch-data -- --only=...`
examples for conformance cases.

**Acceptance criteria:** A new agent or contributor can reproduce a real-data
series without guessing the workflow or polluting the committed generated file.

### 30. Add a "primary producer target shape" page for each conformance case

**Files to add:** `docs/conformance/target-shapes/<case-id>.md`.

**Implementation:** For each hard case, publish the exact JSON record and CSV
shape that the upstream producer would need to publish for the case to pass.
Include field definitions, sample rows, valid ranges, suppression treatment, and
the current Govviz downstream rendering as a worked example.

**Acceptance criteria:** Departments and the NDL can act without reverse
engineering the essay. Each case has a concrete target artefact.

### 31. Mark generated reference records with conformance level and limitations

**Files to touch:** `scripts/build-open-data.mjs`,
`docs/conformance/ai-ready-series.schema.json`, `DataPage`.

**Implementation:** Add `conformanceLevel` such as `M4-reference-rendering` or
`M5-reference-rendering`, plus `limitations`: downstream compiler, not primary
publisher; source may not expose same structure; next release estimated; contact
not official; no policy-as-code upstream. Show these limitations in the data
portal.

**Acceptance criteria:** Govviz can claim strong reference conformance without
overstating upstream official compliance.

### 32. Make source-code evidence easier for external reviewers

**Files to touch:** `README.md`, `docs/conformance/README.md`,
`scripts/build-data.mjs`.

**Implementation:** Add comments or generated docs mapping each conformance case
to the exact fetcher code range. If line numbers are too brittle, add stable
function names and anchors in comments, then generate a `docs/source-map.md`
listing case id, series id, fetcher function, source URL, guard range, and
published record URL.

**Acceptance criteria:** A reviewer can go from essay claim to test case to
parser code to deployed data record in under a minute.

### 33. Add upstream issue templates and outreach packets

**Files to add:** `docs/outreach/README.md`,
`docs/outreach/<producer>-ai-ready-request.md`.

**Implementation:** For each priority producer, generate a concise request:
what is currently hard, the minimal target shape, why it aligns with GDS/DSIT
guidance, and the exact links to Govviz reference output. Keep the tone
collaborative and specific.

**Acceptance criteria:** The project can move from critique to practical
engagement with data publishers.

### 34. Add explicit non-goals to avoid scope creep

**Files to touch:** `README.md`, `docs/conformance/README.md`,
`docs/blog-open-data-for-ai.md`.

**Implementation:** State that Govviz does not seek to centralise primary data,
replace ONS/GSS methodology, publish restricted microdata, bypass disclosure
control, or certify official statistics. It demonstrates a thin publication
profile, downstream compiler, and conformance harness.

**Acceptance criteria:** The architecture is easier for government readers to
accept because it respects existing institutional boundaries.

### 35. Add a current-status badge block to the README

**Files to touch:** `README.md`.

**Implementation:** Add badges or a compact table for deployed data count,
latest build date, conformance status, priority source status, open-data
catalogue URL, profile version, and benchmark report URL. Generate these values
where possible to avoid manual drift.

**Acceptance criteria:** The repository landing page immediately supports the
claim that this is a live reference implementation.

### 36. Update the essay's references to include the enterprise AI-ready data framework

**Files to touch:** `docs/blog-open-data-for-ai.md`.

**Implementation:** Add the June 2026 ODI enterprise framework to the references
and explain why it matters: it turns AI-ready data from a dataset-format question
into a full data product, metadata, infrastructure, and governance question. Use
it to justify additions like active cataloguing, observability, policy-as-code,
named stewards, and feedback loops.

**Acceptance criteria:** The essay keeps pace with ODI's latest framework and
does not look frozen at the March 2026 NDL-lite moment.

### 37. Validate deployed URLs in CI after Pages deployment

**Files to touch:** `.github/workflows/deploy.yml`.
**Files to add:** `scripts/check-deployed-site.mjs`.

**Implementation:** After deployment, check public URLs:
`/`, `/overview`, `/blog`, `/blog.md`, `/data/catalog.json`,
`/data/series/index.json`, one priority series JSON, one CSV, one CSVW, and
`/data/mcp.json`. Assert expected HTTP status, content type, and a key string.
For GitHub Pages, this may need a follow-up workflow or a wait loop after deploy.

**Acceptance criteria:** The project catches the kind of `/overview` 404 found
during this critique automatically.

### 38. Add JSON-LD Dataset records to the open-data portal and overview

**Files to touch:** `scripts/build-open-data.mjs`, overview prerender script.

**Implementation:** The catalogue already uses DCAT. Also emit schema.org
Dataset JSON-LD in static pages for broader crawler and AI-search compatibility.
Include `name`, `description`, `creator`, `publisher`, `license`,
`isAccessibleForFree`, `distribution`, `dateModified`, `spatialCoverage`,
`temporalCoverage`, and `measurementTechnique`.

**Acceptance criteria:** The site is discoverable by general search, AI search,
and data-catalog tooling, not only DCAT-aware consumers.

### 39. Make the data portal searchable by policy problem, not only series title

**Files to touch:** `src/components/DataPage.tsx`,
`src/components/data.ts`, `src/components/departments.ts`,
`scripts/build-open-data.mjs`.

**Implementation:** Add tags for missions and policy problems: waiting lists,
housing supply, sewage, productivity, migration, courts backlog, schools,
energy bills, climate, public finance. Include those tags in `series/index.json`
and the UI filter.

**Acceptance criteria:** A user or agent can find relevant series using the
language of DSIT/GDS survey questions and NDL kickstarter projects, not only
internal series titles.

### 40. Create a "minimum viable producer implementation" guide

**Files to add:** `docs/producer-guide.md`.

**Implementation:** Write a practical guide for a department that wants to make
one series AI-ready in a week: stable id, metadata JSON, tidy CSV, CSVW,
licence, suppression codes, provenance, release calendar, validation range,
contact, and static hosting. Include copy-paste examples and a checklist. Make
it additive to existing GOV.UK publication workflows.

**Acceptance criteria:** The project offers a route to adoption, not only a
critique of current practice.
