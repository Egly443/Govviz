# Agentic Open Data: getting public statistics to the point where the machine just works

AI agents are becoming a significant new route into government data. They will
not replace GOV.UK, statistical bulletins, dashboards, spreadsheets, media
reporting, FOI, parliamentary scrutiny or professional analysis. But they are
already becoming one of the ways people ask questions about waiting lists,
sewage spills, house prices, migration, tax, court backlogs or homelessness, and
the assistant decides where to look.

If the official source is easy to find, easy to read, and safe to interpret, the
official figure can remain the figure of record. If it is buried in a PDF, a
transposed workbook, a zip of workbooks, a JavaScript-only page, a URL that
changes every month, or a public endpoint that blocks scripts, the assistant
will often fall back to whatever is easier: news articles, commercial
aggregators, stale copies, or its own training data.

That is the core public-interest problem. UK public statistics are often
excellent on trust, methodology and professional governance, but poor on the
last mile to a machine. The fix is not to collect more data. It is to publish a
thin, standard, machine-first layer over the outputs government already
produces: stable identifiers, tidy data, machine-readable metadata, provenance,
suppression codes, access policy, conformance tests, and optional agent
adapters over open files.

This essay is paired with a working reference implementation:

- the live dashboard: [Govviz](https://egly443.github.io/Govviz/overview)
- the open data portal: [egly443.github.io/Govviz/data/](https://egly443.github.io/Govviz/data/)
- the AI-ready series profile: [docs/conformance/ai-ready-series-profile.md](https://github.com/Egly443/Govviz/blob/main/docs/conformance/ai-ready-series-profile.md)
- the executable conformance suite: [docs/conformance/](https://github.com/Egly443/Govviz/tree/main/docs/conformance)
- an optional agent adapter: [tools/mcp/](https://github.com/Egly443/Govviz/tree/main/tools/mcp)

The point is not that Govviz is the national answer. It is a small downstream
compiler and proof surface. Its purpose is to make the next step testable:
whether a public series can be resolved, fetched, understood, validated and
used by a normal script or agent without private archaeology.

## The current policy moment

This is no longer a speculative argument from one dashboard.

GDS and DSIT's guidance on making government datasets ready for AI sets out a
four-pillar frame: technical optimisation, data and metadata quality,
organisation and infrastructure context, and legal, security and ethical
compliance. DSIT's National Data Library progress update makes clear that a
domestic data access and discovery layer is now a live institutional priority.
The ODI's prototype AI-ready National Data Library showed, at scale, that agents
often ignore official data when it is badly labelled, stale, invisible, or hard
to access. The ODI's enterprise AI-ready data framework widens the question
again: AI-readiness is not just a file-format question, but a data product,
metadata, infrastructure, governance, monitoring and feedback-loop question.

That is exactly the right direction. The remaining practical question is how to
turn guidance, prototypes and institutional intent into a repeatable assurance
method. In other words: how do we know whether a dataset is actually usable by
an agent today?

Govviz offers one answer: use an accountability-tail test suite, not an average
case. Take the public series where scrutiny matters and where current
publication is awkward: storm-overflow spill hours, NHS waiting times, bathing
water, homelessness, house-price affordability, HMRC call-waiting times. Define
the target shape. Publish a reference rendering. Run a probe. Track whether the
producer or a National Data Library layer can pass.

This makes "AI-ready" something more than a self-assessment. It becomes a
question a release can answer:

> Can a fifteen-line script or ordinary agent find the series, fetch the data,
> identify the unit, geography, licence, provenance, freshness and suppression
> status, reject a plausible wrong value, and cite the source?

If yes, the area has moved forward. If no, the failure is specific enough to
fix.

## What the fieldwork showed

I built Govviz to test this against real UK public performance data: 124
published series across seventeen departments, with the dashboard, open-data
artefacts and conformance tests generated from the same underlying series
registry.

The fieldwork has two layers. The broad catalogue tests whether the downstream
compiler can publish a consistent open-data product across departments. The
conformance suite then takes a smaller adversarial sample of twelve cases where
the source is important, public and awkward enough to expose failure modes.

In that conformance sample, eleven of the twelve cases are T3 on trust and
governance, and the remaining case is T2. None is low-trust data. On the
machine-readability axis, five are M1, five are M2 and two are M3. In other
words, the problem found by the fieldwork is not that the data lacks official
status. It is that high-trust sources still often require scraping,
reconstruction, bespoke workbook parsing, semantic guesswork or fragile
automated access before a user can safely reuse one public series.

| Fieldwork layer | Scope | What it tests | Observed result |
|---|---:|---|---|
| Govviz catalogue | 124 series, 17 departments | Can a downstream compiler publish stable records, tidy data, CSVW and catalogue entries across the estate? | Yes, as a downstream reference rendering with explicit limitations. |
| Conformance suite | 12 high-accountability cases | Can the primary source or a harmonisation layer pass an agent-safe publication test? | 0 at M4/M5 upstream; 10 at M1/M2; 2 at M3. |
| Trust profile of suite | 12 cases | Is the problem low-quality or unofficial data? | 11 at T3 and 1 at T2, so the issue is mostly machine usability, not statistical legitimacy. |

The data was not absent. In most cases it was public, quality-assured and
published by serious producers. The difficulty was the route from public release
to safe machine consumption.

| Case | Current shape | Why it matters | Target shape |
|---|---|---|---|
| ONS time series | Stable JSON endpoint keyed by CDID | Shows the good version already exists inside the UK system | Keep as positive control |
| Net additional dwellings | Accessible ODS workbook, transposed, with the useful row easy to miss | The same release can be awkward for screen readers and machines when there is no canonical source underneath | Stable series id plus tidy CSV/CSVW generated from the canonical source |
| Temporary accommodation | Quarterly workbook with year carried forward across rows | Needs bespoke stateful parsing for a simple national series | One observation per period with explicit geography and unit |
| House-price-to-earnings ratio | Multi-sheet workbook where median and lower-quartile ratios both look plausible | The risk is semantic safety, not just parsing | Human-readable measure description plus machine-readable disambiguation and validation range |
| Storm-overflow spill hours | Annual zip files, one workbook per water company, no published national total | A headline accountability number is public but not directly published as a series | One national series record plus tidy annual observations and provenance |
| Bathing-water classifications | Headline collection points elsewhere; underlying counts are in per-year ODS files with shifting layouts | Discoverability and layout drift make the official data less likely to be used | Stable identifier, clear source relation, standard table shape |
| NHS RTT waiting times | National series must be reconstructed from per-provider workbooks | A figure that used to be easy becomes merely derivable | National series published alongside provider detail |
| HMRC average speed of answer | "mm:ss" values stored across editions as Excel time, mistyped time, string or decimal | A naive parser can produce wildly wrong but plausible values | Explicit unit, duration encoding and validation range |
| Public endpoints blocking scripts | Some otherwise public data rejects automated clients or behaves unpredictably under load | A citizen's agent is not the same thing as abuse traffic | Automation-friendly access policy with sensible rate limits |

The lesson is not that publishers are careless. They work under real
constraints: accessibility regulations, disclosure control, professional
independence, operational cost, legacy systems, release timetables and abuse
management. The lesson is that those obligations are not best met by making
every consumer reverse-engineer the same release.

A canonical machine-readable artefact helps everyone. The accessible workbook,
the web table, the PDF, the chart and the agent endpoint should be renderings of
the same governed source, not competing hand-crafted outputs.

## The diagnosis

The UK has world-class primary statistics, but it does not yet have a consistent
machine-first publication standard for individual public series, nor a
production domestic harmonisation layer that resolves those series for agents
and scripts.

As a result, every consumer privately rebuilds the same plumbing: discovery,
identity, link following, normalisation, unit inference, semantics, provenance,
freshness and error handling. That cost is invisible to each producer, but it is
real across the economy. It falls on journalists, researchers, civic
technologists, regulators, local groups, analysts and citizens. It is heaviest
in the accountability tail, where public scrutiny is most valuable.

There is an equity point here as well. Data that is technically public but
requires a specialist parser, a browser session, and days of checking is not
meaningfully open to most people. In the agent era, "open" should mean open to a
normal script, an assistive technology workflow, and an everyday AI assistant.

## Machine-first, human-rendered

The doctrine change is simple:

> Publish the canonical machine artefact first. Render the human page,
> accessible workbook, PDF and any agent adapter from it.

For a statistical series, the minimum useful shape is small:

```json
{
  "id": "https://example.gov.uk/series/defra/storm-overflow-spill-hours",
  "title": "Storm overflow spill duration, England",
  "description": "Total annual duration of spills from EDM-monitored storm overflows.",
  "producer": "Environment Agency",
  "statisticType": "Official Statistic",
  "unit": "hours",
  "geography": "E92000001",
  "periodicity": "P1Y",
  "validRange": { "min": 500000, "max": 6000000 },
  "suppressionScheme": "https://example.gov.uk/def/sdc/v1",
  "revisionStatus": "final",
  "licence": "OGL-v3",
  "provenance": {
    "source": "EA EDM annual returns",
    "derivation": "sum of per-asset Total Duration (hours)"
  },
  "latest": "https://example.gov.uk/series/defra/storm-overflow-spill-hours/data.csv"
}
```

```csv
period,value,unit,status
2023,3610000,hours,final
2024,3614000,hours,final
```

Govviz implements this pattern as a downstream reference rendering. Each record
separates the primary `producer` from the downstream `compiler`, marks
`upstreamConformance` as not asserted by the primary publisher, carries
freshness metadata without inventing official release dates, and publishes
limitations so the claim is not overstated.

The important part is not Govviz's exact schema. It is the design discipline:
stable identity, tidy observations, in-band semantics, provenance, licence,
suppression, freshness, access policy, validation range, and a formal contract
beside the data. That discipline maps directly onto the GDS/DSIT pillars and
ODI enterprise criteria.

This is not intended to be a new grand standard. The durable base should remain
the existing standards stack: DCAT for cataloguing, CSVW for tabular metadata,
SDMX concepts where they fit statistical series, schema.org or JSON-LD where
useful for discovery, OpenAPI for ordinary web contracts, and the Code of
Practice for Statistics for trust. The useful novelty is the thin executable
profile on top: package those obligations at the level of one named public
series, add an explicit semantic-safety guardrail, and test the result with a
probe that reflects a real user task. The conformance tests are as important as
the fields.

## Trust and machine-readability are different axes

Convenience is not quality. A clean CSV with no methodology is not better than
a well-governed National Statistic in a poor format. The right model scores two
things separately.

**Trust and governance (T0-T3):**

- T0: unclear source or status
- T1: named producer and basic provenance
- T2: methodology, revision status and licence
- T3: official or National Statistic quality, disclosure control and clear
  accountability

**Machine-readability (M0-M5):**

- M0: human-only publication, such as PDF or HTML table
- M1: scrape-only, with unstable links or browser-dependent discovery
- M2: machine file exists, but bespoke layout or semantic ambiguity remains
- M3: clean endpoint, with semantics partly out of band
- M4: stable id, tidy data, CSVW or equivalent metadata, suppression and
  provenance in-band
- M5: M4 plus cataloguing, automation-friendly serving, monitoring and an
  optional open agent adapter

Many of the most important UK statistics are high-T and low-M. That is the
opportunity. The aim is to lift M without weakening T.

This also makes accessibility easier to reason about. Accessibility and
machine-readability should not be treated as rival audiences. If the accessible
workbook is generated from the same canonical source as the tidy data, both the
screen-reader user and the citizen's agent benefit from the same governance.

## The conformance suite is the lever

The most useful contribution Govviz can make is not another opinion about open
data. It is a set of tests.

The conformance suite in `docs/conformance/` takes hard public cases and gives
each one:

- a current Trust x Machine-readability score
- the observed failure mode
- pass criteria for the producer or harmonisation layer
- a target JSON and CSV shape
- evidence notes and source-code pointers
- a runnable probe against Govviz's reference rendering

That matters because it changes the conversation from "is this dataset
AI-ready?" to "which check fails?"

Used well, the suite can help several groups at once:

- For a primary publisher, it gives a concrete acceptance test for one series:
  publish the target shape and the parser disappears.
- For the National Data Library, it gives awkward-tail onboarding cases for
  priority public series, rather than only tractable sources.
- For GDS and the Data Standards Authority, it gives executable examples for a
  thin AI-ready series profile.
- For ODI, it gives cases that can be mapped against the enterprise framework:
  metadata, infrastructure, governance, monitoring and feedback.
- For OSR and UKSA, it gives an auditable way to discuss machine-readability as
  part of value and quality without disturbing statistical independence.
- For civic technologists and journalists, it gives a repeatable benchmark:
  time-to-first-chart, semantic safety, provenance, freshness and automation
  access.

The tests are deliberately adversarial. They include sewage spills, NHS waiting
times, bathing-water quality, temporary accommodation, house-price
affordability and HMRC call-waiting times precisely because these are not the
easy average. If the tail improves, the rest of the estate becomes much easier.

The tail should not become a set of anecdotes. A defensible sample would choose
cases against published criteria: high public value, clear official producer,
high reuse demand, real risk of misinterpretation, awkward current publication
shape, cross-department coverage, varied cadence and at least one positive
control. That is why the suite includes cases that are blocked by access
controls, cases that require reconstruction, cases that are semantically
ambiguous, cases that are merely awkward to parse, and cases that already work
reasonably well. The purpose is not to shame the worst releases. It is to make
the acceptance test hard enough that passing it means something.

## What Govviz now demonstrates

Govviz is a downstream compiler, not an official publisher. That boundary is
important. It does not certify the upstream source, replace producer
methodology, centralise primary data, publish restricted microdata, or bypass
disclosure control.

What it does demonstrate is a working shape:

- `catalog.json`: a DCAT-style catalogue of every series
- `series/{id}.json`: stable AI-ready metadata records
- `series/{id}/data.csv`: tidy observations
- `data.csv-metadata.json`: CSVW metadata
- `graph.jsonld`: semantic interlinkage between series, departments, producers,
  geographies and source concepts
- `openapi.json`: a static REST contract
- `conformance-report.html`: a generated public conformance report
- `health-history.json`: rolling build-time health snapshots
- `access-policy.json`: policy-as-code for the open public aggregate product
- source stewards, feedback routes, benchmark cases and producer guidance
- `mcp.json` and `tools/mcp/`: an optional agent adapter over the same open
  files

This matters for the essay's claim. The argument is not just "government should
do better". It is "here is a small, inspectable implementation of the shape we
are asking for, including its limitations".

The implementation is intentionally static. A folder of files on GitHub Pages
can provide stable ids, data downloads, metadata, JSON-LD, conformance reports,
health history and API contracts. That is useful because it lowers the perceived
cost. A department does not need to start with a grand platform programme to
make one high-value series AI-ready.

## A cheapest-useful sequence

The programme should be sequenced so value appears before heavy spending.

**1. Stable identity and latest aliases.** Give each priority series a
persistent identifier and a stable pointer to the latest versioned asset. Keep
cache-busting versioned files as well. This alone removes a large amount of
integration rot.

**2. Canonical tidy data for priority series.** Start with the top public
interest and high-use series: waiting lists, storm overflows, homelessness,
courts, migration, HMRC service performance, major projects, housing
affordability, public finance and local government finance.

**3. In-band metadata and validation.** Publish unit, geography, periodicity,
revision status, licence, provenance, suppression codes and a plausible value
range. The validation range is not a statistical claim; it is a safety rail
against a wrong-tab or wrong-unit read.

**4. Automation-friendly access.** Public aggregate statistics should be served
with documented rate limits and a policy that distinguishes normal automated
reuse from abuse. Where registration is needed, a single simple route across
the estate would be much easier than one-off credentials.

**5. Conformance and monitoring.** Run the accountability-tail tests on every
release. Publish the report. Track freshness, failures, source hashes and
agent-consumption issues over time.

**6. Optional agent interface on top.** MCP or any future agent protocol should
sit above open data standards, not replace them. The data must remain usable by
a curl command if the agent layer changes.

The hard part of this sequence is not only technical. A producer also has to
fit the extra artefacts into release sign-off, accessibility checking,
statistical governance, disclosure review, cyber and abuse-management policy,
CMS constraints, supplier contracts, release calendars and user support. That is
why the first adoption unit should be one high-value series, not a platform
rewrite. A minimum viable pilot needs a named data owner, a named technical
publisher, a release checklist, a feedback route and an agreement that the
machine artefact is part of the official release package rather than an
afterthought maintained by one analyst.

## Adoption model

The ownership model should be explicit.

| Function | Practical role |
|---|---|
| GDS / Data Standards Authority | Convene the thin publishing profile, maintain cross-government examples, and make conformance test results reusable across services. |
| DSIT / National Data Library team | Use priority accountability-tail cases as onboarding and acceptance tests for discovery, resolution and harmonisation services. |
| ONS / UKSA / OSR | Align the trust side with the Code of Practice, statistical quality expectations, release practice and public value discussions. |
| Departmental chief data officers and heads of profession | Nominate priority series, assign owners, and make the machine artefacts part of the publication workflow. |
| Data.gov.uk / catalogue operators | Provide stable discovery, persistent identifiers, catalogue metadata and links to current and versioned assets. |
| ODI and civic-data partners | Provide independent challenge, user research, reuse evidence and feedback-loop patterns. |

The first realistic programme would be small: select perhaps twenty priority
series across five to seven producers; publish stable identifiers, metadata,
tidy CSV and CSVW for each; run the conformance probes in public; and document
the cost, failure modes and producer effort. If that pilot works, procurement
and publishing guidance can require the same shape for new or refreshed
high-value aggregate statistics.

The tone matters. Producers are not starting from zero, and many awkward formats
exist for defensible historical reasons. The practical question is how to give
those producers a cheap, incremental path to a better release shape, with enough
central support that each team is not asked to invent the same pattern alone.

## How we would know it is working

This should be measured in public.

- **Tail conformance:** percentage of priority accountability-tail series at
  M4 or M5.
- **Time to first chart:** how long a standard script or agent takes to go from
  a series name to a correct sourced value and chart.
- **Semantic safety:** number of plausible wrong-value incidents, such as wrong
  tab, wrong unit, wrong geography or stale edition.
- **Official-source fallback:** how often agents answer from news, commercial
  data or model memory when an official series exists.
- **Freshness and reliability:** source fetch success, point count, content
  hash, source byte hash and staleness by build.
- **Feedback closure:** number of data-quality or agent-consumption issues
  opened, verified, fixed and converted into reusable tests.
- **Cost avoided:** sampled cost saved for repeated consumers who no longer need
  bespoke parsers for the same public series.

These are useful because they make progress visible. A publisher can improve
one series and see the M score move. The NDL can onboard a hard case and show
the probe passing. A framework owner can see whether guidance is changing the
actual user journey.

## Risks worth handling up front

There are several ways to do this badly.

**Overclaiming.** A downstream compiler must not imply that a primary producer
has certified a shape it has not published. Govviz separates compiler metadata
from producer metadata for this reason.

**Disclosure mistakes.** Statistical disclosure control is not formatting
noise. Suppression markers must be machine-readable, but the underlying
protection remains a professional statistical responsibility.

**Clean but untrusted data.** Machine-readability does not replace methodology,
revisions policy, provenance or statistical status. The two-axis model is there
to prevent a neat file being mistaken for a trustworthy statistic.

**A prototype mistaken for production.** ODI's NDL prototype is valuable partly
because it shows feasibility. The production work is the slower part: coverage,
refresh, monitoring, governance, user support and awkward sources.

**Agent lock-in.** The agent interface must be optional. DCAT, CSVW, SDMX,
schema.org, OpenAPI and ordinary static files are the foundation. MCP is a
useful access layer, not the standard underneath the standard.

**Context collapse.** A correct value can still be used in the wrong context.
Machine-readable releases need definitions, caveats, geography, units,
methodology and revision status close to the data so an agent is less likely to
compare unlike measures or turn a provisional operational number into a
settled policy conclusion.

**Overconfident automated answers.** Agents may cite the right URL while
answering the wrong question. Conformance should therefore test not only fetch
success but semantic safety: whether a consumer can distinguish median from
lower-quartile affordability, England from UK, percentage from percentage
points, and current release from stale edition.

**Weak feedback and redress.** If an agent or script discovers a bad unit,
stale source or misleading definition, there must be a visible route to report
it, triage it and turn the fix into a reusable test. Otherwise the same error
will be privately rediscovered by every consumer.

**Misuse of easy data.** Making public aggregates easier to consume does not
remove the need for stewardship. High-friction access is a poor way to manage
risk, but low-friction access should be paired with clear licence terms,
machine-use restrictions where needed, monitoring, rate limits and named owners
for interpretation risk.

## Why this is worth doing

The value-for-money case is straightforward. The larger bill is already being
paid, but it is paid invisibly and repeatedly by every consumer who has to chase
links, interpret layouts, infer units, find provenance, handle stale releases
and guard against plausible wrong values.

A thin publication profile buys down that repeated cost once. It also improves
public accountability because the authoritative source becomes the easiest
source to use. That matters more as agents become the interface through which
many people ask questions about government performance.

There is also a public-service dignity to it. A citizen should not need an
engineering budget to ask whether homelessness is rising, whether waiting lists
are improving, how much sewage was discharged, or how long people wait for HMRC
to answer the phone. Nor should an official statistic lose influence merely
because a less authoritative source is easier for a machine to read.

## The bottom line

UK public statistics are strong on trust. The next task is to make them strong
on agent-safe usability.

The practical route is not a giant central data lake. It is a standard and a
testable publication shape: machine-first, human-rendered, open by default for
public aggregates, explicit about governance, respectful of disclosure control,
and measured at the accountability tail.

Govviz is a small attempt to show the shape in public. It publishes the essay,
the dashboard, the data product, the conformance suite, the benchmark, the
health report, the feedback loop and the optional agent adapter together, so the
claim can be inspected rather than merely agreed with.

If the official source is the easiest safe source for an agent to use, the
public wins twice: citizens get better answers, and the authoritative statistic
stays authoritative.

---

## Frequently asked questions

### Why can't AI agents reliably read UK government open data?

Some can, sometimes. The problem is reliability. Many releases are published as
PDFs, transposed spreadsheets, zip files, unstable URLs, browser-dependent
pages, or workbooks whose semantics are obvious to a human but ambiguous to a
machine. Agents then fall back to easier but less authoritative sources.

### What does "agentic open data" mean?

It means publishing public data so that AI agents acting for people can find,
read, validate and cite it safely. In practice that means stable identifiers,
tidy data, machine-readable metadata, provenance, licence, suppression status,
freshness, access policy and, where useful, an optional agent adapter over the
same open files.

### How is this different from existing open data work?

It builds on existing open data standards rather than replacing them. The
difference is the test: can an ordinary script or agent complete the user task
without private reverse engineering, and without silently choosing a plausible
wrong value?

### Does this conflict with accessibility?

It should do the opposite. If the canonical machine-readable source is well
structured, the accessible workbook and human page can be generated from the
same source. That gives screen-reader users and agents a shared, governed
foundation.

### Does this weaken statistical disclosure control?

No. Suppression should be encoded, not bypassed. If a value is suppressed, the
machine-readable output should carry the suppression code and meaning rather
than inventing or exposing a value.

### What is the conformance suite for?

It turns AI-readiness into an executable check. Each case defines the current
problem, the desired target shape and a probe. A producer, NDL service or
downstream compiler can run the test and see exactly what remains to fix.

### How does this relate to the National Data Library?

The National Data Library is the natural place for discovery, resolution and
harmonisation. The Govviz contribution is narrower: a set of awkward-tail cases,
a thin series profile and a reference implementation that can help define what
"works" means for individual public performance series.

---

## References

- Govviz live reference implementation: [overview](https://egly443.github.io/Govviz/overview), [open data portal](https://egly443.github.io/Govviz/data/), [catalogue](https://egly443.github.io/Govviz/data/catalog.json), [conformance report](https://egly443.github.io/Govviz/data/conformance-report.html), [health history](https://egly443.github.io/Govviz/data/health-history.json), [MCP descriptor](https://egly443.github.io/Govviz/data/mcp.json).
- Govviz companion artefacts: [AI-ready series profile](https://github.com/Egly443/Govviz/blob/main/docs/conformance/ai-ready-series-profile.md), [conformance suite](https://github.com/Egly443/Govviz/tree/main/docs/conformance), [benchmark cases](https://github.com/Egly443/Govviz/tree/main/docs/benchmarks), [producer guide](https://github.com/Egly443/Govviz/blob/main/docs/producer-guide.md), [feedback loop](https://github.com/Egly443/Govviz/blob/main/docs/feedback-loop.md).
- GDS and DSIT, *Guidelines and best practices for making government datasets ready for AI* (19 January 2026): [gov.uk](https://www.gov.uk/government/publications/making-government-datasets-ready-for-ai/guidelines-and-best-practices-for-making-government-datasets-ready-for-ai).
- DSIT, *National Data Library: progress update, January 2026* (26 January 2026): [gov.uk](https://www.gov.uk/government/publications/national-data-library-progress-update-january-2026).
- ODI, *Prototyping an AI-ready National Data Library* (March 2026): [theodi.org](https://theodi.org/insights/reports/prototyping-an-ai-ready-national-data-library/).
- ODI, *A framework for AI-ready enterprise data* (June 2026): [PDF](https://theodi.hacdn.io/media/documents/A_framework_for_AI-ready_enterprise_data.pdf).
- UK Government, *The Government Data Quality Framework*: [gov.uk](https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework).
- UK Government, *Data Ethics Framework*: [gov.uk](https://www.gov.uk/government/publications/data-ethics-framework).
- UK Government, *Algorithmic Transparency Recording Standard Hub*: [gov.uk](https://www.gov.uk/government/collections/algorithmic-transparency-recording-standard-hub).
