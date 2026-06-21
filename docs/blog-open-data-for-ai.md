# The public paid for this data. Why is it so hard for a machine to read it?

*Field notes from building an AI-assisted dashboard of UK government performance — and a strategic proposal for making public data agent-ready.*

---

## The premise that should have been true

We set out to do something that, in 2026, ought to be a weekend project: point a capable AI model at a basket of long-run UK government performance indicators — NHS waiting times, the courts backlog, housebuilding, sewage spills, the tax burden, recycling rates — and have it assemble an honest, sourced dashboard. Real numbers, from reputable sources (ONS, World Bank, gov.uk, the NHS, the Environment Agency), refreshed automatically, never fabricated.

The data is *already public*. It has *already been collected*, cleaned, quality-assured and published, at public expense, by statisticians who did excellent work. The "last mile" — getting it from a published page into a chart — is the only thing standing between a citizen (or their AI agent) and an answer.

That last mile turned out to be a swamp. What follows is an honest inventory of every kind of friction we hit, why each one is more damaging in the age of LLM agents than it was in the age of human analysts, and a concrete, technically specific proposal for fixing it — for the UK first, and for national statistical systems generally.

This is not a complaint about the people who publish the data. It is a complaint about the *interface* they are forced to publish through, and the absence of a strategy that treats machine readers as first-class citizens.

---

## What we actually built, and how we measured the pain

The dashboard ("Govviz") bakes roughly ninety real series across ten departments. The architecture is deliberately defensive because the sources are so unreliable:

- A build-time script fetches each series in CI and writes a generated data file. Every fetch is wrapped in its own `try/catch`; **a failing source never breaks the build** — it simply falls back to a clearly-labelled "no source yet" placeholder. An "honesty gate" blanks any series we could not source, so the dashboard can never show an invented number.
- Every series has a **guard**: a published `min`/`max`. A fetched value outside the plausible range is rejected. This exists *solely* because the sources are so fragile that a "successful" fetch of the wrong table is a real and constant risk.

We were able to count the effort, because every source needed its own bespoke parser and several rounds of trial-and-error against live data. The honest tally: **dozens of CI iterations**, many of them spent not on analysis but on reverse-engineering the *shape* of a spreadsheet, discovering that a URL had a random suffix this month, or finding out that an endpoint silently returns HTTP 403 to anything that looks like a script.

When the marginal cost of adding one public indicator to a public dashboard is "an afternoon of forensic work," the system is broken — and it is broken in a way that scales badly precisely as AI makes everything else cheap.

---

## A taxonomy of friction

The problems sort cleanly into seven families. None is exotic. All are fixable.

### 1. Discovery: you cannot fetch what you cannot find

There is no single, queryable, machine-readable catalogue of "every official UK statistical series and where its data lives." There are several overlapping ones — the gov.uk Search and Content APIs, the ONS time-series explorer, DfE's Explore Education Statistics catalogue, data.gov.uk's CKAN index, departmental statistics collections — and they disagree about what exists, what is current, and what the canonical download is.

In practice, discovery meant **using a web search engine to find a human-readable landing page, then reverse-engineering the machine path from it.** That is the wrong way round. The machine path should be the front door; the human page should be a rendering of it.

### 2. Identity: nothing has a stable address

A statistical series is a *thing that persists* — "households in temporary accommodation, England, quarterly" is a concept with a 25-year history. But almost nothing in the UK system gives that concept a **stable, resolvable identifier**.

Instead we found:

- **Asset URLs with random hashes that change every release.** The NHS A&E and RTT files, for example, live at paths ending in `...-May-2026-wlgnE2.xls` — the suffix is regenerated each month, so you must scrape the HTML landing page every single time to discover the current link. There is no "latest" alias.
- **Slugs that drift.** A yearly statistical release is republished under a new URL slug each year, so a hard-coded path rots within twelve months. We had to follow "newest edition in a collection by publication date" just to stay pointed at the right file.
- **Editions hidden as attachments.** For some collections the yearly editions appear as HTML *attachments* of a parent page rather than as documents in the API's document list — so the obvious traversal finds nothing and you have to dig through a second structure.

The cost of unstable identity is that **every integration is born already decaying.** A human notices and fixes a dead link once a year; an automated pipeline must be engineered, up front, to rediscover the moving target on every run.

### 3. Format: a museum of incompatible shapes

This was the single biggest time sink. "It's published as a spreadsheet" hides a startling diversity of hostile shapes:

- **The CDID time series** (ONS) — genuinely good: a clean JSON endpoint keyed by a short code. When the whole system looks like this, the work is trivial. It is the gold standard and it proves the rest *could* be this easy.
- **The "accessible" workbook that is anything but.** gov.uk's accessibility guidance has produced thousands of ODS files where the data is *transposed* — periods run across columns and the metric you want is a single row buried halfway down, beneath a "Source:" caption that your naïve row-matcher will grab first. We lost an entire iteration to discovering that the row we wanted was labelled "Total net additional dwellings," not "Net additional dwellings," and that an *unanchored* match was silently selecting the source-citation line instead.
- **The quarterly carry-forward sheet.** Homelessness table TA1 puts the year in column 0 *only on the first quarter*, leaving it blank for Q2–Q4 (you must carry it forward), the quarter in column 1, and the value in a third column. No machine can read that without bespoke logic.
- **The dataset-workbook-that-is-not-a-CDID.** The ONS house-price-to-earnings ratio is a multi-sheet workbook, not a time series endpoint. Worse: it contains *both* the median and the lower-quartile ratio, on differently-named tabs, and **both pass any plausible sanity check.** A wrong-tab fetch produces a believable-but-wrong chart. The only safe path was to parse the workbook's "Contents" sheet, read the human-language table descriptions, and disambiguate "median house price to median earnings" from "lower quartile…". An LLM is actually *good* at that — but it should never have to.
- **The ZIP-of-spreadsheets.** The Environment Agency's storm-overflow (sewage) Event Duration Monitoring data is published as annual `.zip` archives, each containing one workbook per water company, each with thousands of per-asset rows. To get a single national number — total spill hours — you must download the zip, unpack it (a second library), open every workbook, find the "Total Duration (hours)" column (whose header *also mentions counting*, defeating a careless keyword filter), and sum across all of it. The national headline figure that makes the news exists nowhere as a machine-readable value.
- **PDF-only and HTML-only.** Bathing-water classifications — the "% of beaches rated Good or Excellent" that is a genuine public concern — are published as PDFs and HTML prose. There is no machine-readable classification table at all. The data exists; the *format* embargoes it.
- **The per-provider split with no national total.** NHS England discontinued the consolidated national RTT (referral-to-treatment) waiting-times series. What remains is a set of ~9 MB monthly per-organisation workbooks; the national "% within 18 weeks" must be *reconstructed* by summing hundreds of providers across waiting-time bands. A number that used to be published is now merely *derivable, at cost.*

### 4. Access: walls, and walls disguised as weather

Some public data is behind authentication. Some is behind anti-automation defences. The two are different problems and both are damaging.

- **Explicit auth.** DWP's Stat-Xplore (PIP clearance times, work-coach ratios, Universal Credit mandatory reconsiderations) requires a free API key and a `POST` with a bearer token. This is *fine* as a model — it's documented, it's free, it's a single front door — but it means an agent cannot get the data without a human first registering for a credential and storing it as a secret. For genuinely sensitive or rate-sensitive data that is reasonable; for routine published statistics it is friction.
- **Anti-automation defences on public statistics.** This is the indefensible one. `digital.nhs.uk` sits behind a CDN that returns 403 to automated clients *even with a browser-like user agent* — for workforce-turnover statistics that are otherwise entirely public. The Environment Agency's `environment.data.gov.uk` download endpoint rate-limits and 403s automated requests: in our runs the *first* zip would sometimes succeed and the rest would be blocked, making the pipeline non-deterministic. **We are spending public money to actively prevent the public's machines from reading the public's data.** Bot defences exist to stop abuse; applied bluntly to open statistics they simply stop *use*.

### 5. Semantics: the data doesn't carry its own meaning

Even when you get the bytes, the meaning is out-of-band. Units, scale factors, the difference between a level and a rate, the geographic coverage (England vs UK), the vintage, whether a value is provisional or revised, what the suppression markers (`w`, `x`, `z`, `[c]`, `[low]`) mean — almost all of this lives in human-readable notes, cover sheets, or nowhere. We had to encode plausible ranges by hand for every single series, as a backstop, because the data would not tell us what "normal" looked like.

A machine reader needs the **semantics to travel with the data**: a declared unit, a declared period, a declared coverage, a declared revision status, ideally a declared plausible range. SDMX and CSV-on-the-Web (CSVW) already define how to do this. Almost nobody uses them end-to-end.

### 6. Provenance: trust has to be reconstructed, not asserted

For a public dashboard, "where exactly did this number come from?" is not optional. But the sources rarely hand you a clean provenance trail, so we had to *capture* it ourselves — recording the exact fetched file URL for every series at fetch time and threading it through to a download link in the UI. The system should emit provenance; instead every consumer rebuilds it.

### 7. Tooling fragmentation: every door has a different key

Finally, the integration surface itself is fragmented. Working through an AI agent, we touched multiple, unrelated access mechanisms — a GitHub data/automation server, the gov.uk Content and Search APIs, the ONS time-series API, the World Bank API, DfE's EES, CKAN, bespoke HTML scrapes, and a zip-unpacking path — each with its own shape, auth, pagination and failure mode. There is no common protocol, no shared capability description, no uniform way for an agent to ask "what can I get, in what shape, under what licence?"

---

## Why this is suddenly urgent

None of these problems are new. Analysts have grumbled about them for twenty years. So why does it matter *now*?

Because **LLM agents change the economics of data use, and the bottleneck has moved.** Until recently, the expensive, scarce resource was the human analyst who could find, clean and interpret a dataset. Publishing data in awkward formats was tolerable because a skilled human would absorb the cost, once, slowly.

Now the analysis is cheap and instantaneous. A model can read a workbook, infer a chart, write the prose and reason about caveats in seconds. The *only* remaining expensive step is the mechanical one: **acquisition and normalisation.** We have automated the hard part and left the easy part manual. The result is that the friction we used to hide inside a human's salary is now the rate-limiting step for an entire category of public-interest tools — citizen dashboards, fact-checkers, accountability trackers, local-journalism aids, policy simulators.

There is also an **equity** dimension. Large institutions can afford to throw engineers at scraping and reverse-engineering. A school governor, a parish council, a local reporter, a single citizen with a question cannot. Badly-published open data is, in practice, *closed* data for everyone without an engineering budget. "Open" should mean open to a fifteen-line script, not just to a funded team.

---

## The strategic fix: treat machines as a primary audience

The root cause is a doctrine problem, not a technology problem. UK open data is published **human-first, machine-maybe.** Every fix below flows from inverting that to **machine-first, human-rendered** — publish the canonical machine artifact, and generate the human page (and the PDF, and the "accessible" workbook) *from* it.

Concretely, we propose seven commitments. Together they would turn our weeks of forensic work into the weekend project it should have been.

### 1. A single national data front door with stable, resolvable identifiers

Mandate a **persistent identifier** for every published statistical series — a resolvable URI (and, for citable releases, a DOI), e.g. `https://data.gov.uk/series/mhclg/temporary-accommodation`. Resolving it returns machine-readable metadata and a `latest` data link that *never changes shape*. Editions get their own sub-identifiers; the series identifier always points a machine at the current data without scraping. Kill the random-hash, slug-drift, hidden-attachment patterns at a stroke: the identifier is the contract, the file path is an implementation detail behind it.

### 2. One canonical, tidy, machine-readable representation per dataset — by duty

Adopt a **"tidy data duty"**: every statistical release must publish, as its *primary* artifact, a long-format, one-observation-per-row dataset (CSV/Parquet) described by **CSVW or SDMX** metadata. Transposed "accessible" workbooks, PDFs and bespoke layouts may continue to exist — but as *derived renderings*, generated automatically from the canonical machine form, never as the only copy. The national headline figure (total spill hours, % within 18 weeks, England median ratio) must be published as a value, not left as something each consumer must re-derive by summing thousands of rows.

This single change would have eliminated the majority of our bespoke parsers.

### 3. Semantics and provenance that travel with the data

The canonical representation must carry, in-band: **unit, scale, period, geographic coverage, revision status, suppression-marker definitions, plausible range, source lineage, and licence.** If the data declared its own units and coverage, we would not have needed a hand-built guard on every series, and a wrong-table fetch would be self-detecting rather than silently believable.

### 4. Open by default; keys by exception, through one gate

Routine published statistics should be **fetchable without authentication**, full stop. Where rate-limiting is genuinely needed, offer a **single, free, self-service API key that works across the whole estate** — not a different credential per department per dataset. Reserve real auth for genuinely restricted microdata, and put that behind one consistent, documented mechanism (Stat-Xplore is a reasonable template) rather than ten bespoke ones.

### 5. A ban on anti-automation defences for public statistics

Make it **policy** that open statistical endpoints must not deploy CDN bot-blocking, browser-fingerprint challenges, or punitive rate limits against well-behaved automated clients. Publish a generous, documented rate limit and an identifying header convention instead. Spending public money to block the public's machines from the public's data is an own goal; it should be explicitly prohibited in the publishing standard and checked in assurance.

### 6. An agent-native access layer (and an MCP-style standard)

Beyond raw endpoints, expose the catalogue and data through a **uniform, capability-described protocol** an agent can introspect: "what series exist, in what shape, under what licence, with what freshness?" The Model Context Protocol and similar agent standards are the natural delivery vehicle. One **official government MCP server** over the canonical catalogue — discovery, metadata, and typed data access in one place — would replace the dozen incompatible doors we had to learn. Crucially this should be a *thin, standard* layer over the front door of (1), not yet another bespoke silo.

### 7. Machine-readability as a procurement and assurance lever

None of the above sticks without governance. Bake it into the **publishing standard, the assurance process, and procurement.** No statistical release passes assurance unless it ships the canonical machine artifact with conformant metadata and a stable identifier. New data-platform contracts must require it. Treat "is this readable by a fifteen-line script?" as a release gate, the same way accessibility is — because machine-readability *is* an accessibility requirement for the agent era.

---

## What "good" looks like, technically

A conformant series, end to end, would let an agent do this and nothing more:

1. **Resolve** `data.gov.uk/series/{domain}/{series}` → JSON metadata: title, unit, period, coverage, licence, revision status, plausible range, and a `data` link.
2. **GET** the `data` link → long-format CSV/Parquet with CSVW context: one observation per row, typed, with provisional/revised flags.
3. **Read** `provenance` → the upstream source, methodology link, and publication/next-release dates.
4. Optionally, **introspect** the same thing through the official MCP server with a single typed call.

No HTML scraping. No hash-chasing. No zip-spelunking. No tab-guessing. No 403 roulette. The agent spends its cycles on *analysis and caveats* — the things it is uniquely good at — not on archaeology.

---

## The pan-national dimension

This is not only a UK problem, and the UK should not solve it in isolation. **SDMX** already exists as an ISO standard for statistical data and metadata exchange, used by the OECD, Eurostat, the IMF, the ECB and the World Bank — and, tellingly, the World Bank's clean, uniform API was the *easiest* source in our entire project, the one that simply worked, every time, for every indicator, across countries. International comparability — "the UK versus France versus Germany on the same indicator, same methodology" — is the hardest thing for anyone to massage and the most valuable thing for the public to see, and it is only possible when statistical offices share a standard.

The strategic prize is a **federation of national statistical front doors** speaking a common protocol (SDMX for the data model, plus an agent-native discovery layer), so that a citizen's agent can ask one question and get a like-for-like answer across jurisdictions. The UK adopting the seven commitments above in an internationally-aligned way is the contribution that makes the federation possible.

---

## A maturity model you can hold a publisher to

To make this assessable rather than aspirational, score every release 0–5:

- **0 — Embargoed-by-format:** PDF/HTML only. (Bathing water today.)
- **1 — Scrape-only:** data in a file, but discoverable only via a human page with unstable links. (NHS A&E/RTT today.)
- **2 — Awkward machine file:** stable-ish download, but transposed/bespoke shape needing custom parsing. (Most "accessible" ODS today.)
- **3 — Clean endpoint, no semantics:** uniform API, but units/coverage/revision out-of-band. (Many ONS/World Bank series — already a huge step up.)
- **4 — Self-describing:** stable identifier + canonical tidy data + in-band CSVW/SDMX metadata + provenance.
- **5 — Agent-native:** everything in level 4, plus capability-described access through a standard protocol, open by default, no anti-automation defences.

Today the UK estate is a scatter from 0 to 3. The goal is a floor of 4 and a ceiling of 5 within a defined programme, gated by assurance.

---

## The bottom line

We built an honest dashboard of public data, and the hard part was never the analysis, the design, or the AI. The hard part was that the data — collected, cleaned and published at public expense — is shipped in a way that quietly assumes the only reader will be a human with infinite patience and a spreadsheet. That assumption is now false. The reader is increasingly an agent acting *for* a citizen, and every transposed tab, random URL hash, zip-of-workbooks, PDF-only release and 403-to-scripts is a small act of enclosure around data we have already paid for.

The fix is not heroic. It is a doctrine — *machine-first, human-rendered* — backed by stable identifiers, a tidy-data duty, in-band semantics, open-by-default access, a ban on blocking the public's machines, an agent-native protocol, and the procurement teeth to enforce all of it. The World Bank and the CDID time-series API already prove the easy path exists. We should make the easy path the *only* path.

Public data should be open to a fifteen-line script and a citizen's AI, not just to those who can afford the archaeology. Anything less isn't really open at all.

---

*If you publish official statistics and want to know what your release scores on the maturity model above — or what a conformant version would look like — that is exactly the conversation we should be having.*
