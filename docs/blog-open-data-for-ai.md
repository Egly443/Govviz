# Agentic Open Data: how to get public statistics to the point where the machine just works

*We are heading, fast, for a world where most people meet government data through an AI agent acting on their behalf. That is not a prediction to argue about; it is a deployment curve. The strategic question is no longer "will citizens use LLMs to read public data" — it is "how do we get our public data to the point where the LLM just works?" This is a field report on why we are not there yet, and a costed, defensible route to getting there.*

---

## The premise that should be trivial

In 2026, this ought to be a weekend project: point a capable model at a basket of long-run UK government performance indicators — NHS waiting times, the courts backlog, housebuilding, sewage spills, the tax burden, recycling rates — and have it assemble an honest, sourced dashboard. Real numbers, reputable sources, refreshed automatically, never fabricated.

The data is *already public*. It has *already* been collected, cleaned, quality-assured and published, at public expense, by statisticians who did excellent work. The "last mile" — getting it from a published page into a chart — is the only thing between a citizen (or their agent) and an answer.

I built exactly that dashboard: roughly ninety real series across ten departments, single-handed, in a few weeks. So let me be precise about what I am and am not claiming. **The ecosystem is navigable** — I navigated it. **The publishers are not incompetent** — the awkwardness I hit is mostly the visible residue of real obligations: accessibility law, statistical disclosure control, the independence of the statistical system, abuse management, and decades of legacy production. And **there is no single villain**, because there is no single owner to blame — which turns out to be central to the diagnosis.

What I *am* claiming is narrower and harder to wave away: the navigability is bought with skilled, expensive, manual effort that scales badly precisely as AI makes everything else cheap; that cost is invisible on every producer's balance sheet and lands entirely on the public and the tools built for them; and it is heaviest in exactly the high-accountability tail — sewage, waiting lists, homelessness, the courts — where public scrutiny matters most. That is a strategy gap, and the good news is that it is fixable without re-platforming anything.

---

## A museum of hostile shapes (the war stories)

The friction is real, and worth seeing in detail, because the detail is what tells you the fix is cheap.

**The gold standard, which proves the rest could be easy.** ONS time series are exposed as a clean JSON endpoint keyed by a short code (a "CDID"). You ask for `D7G7`, you get inflation back, typed, with history. When the system looks like this, the work is trivial. A large share of my ninety series were this easy. The gold standard already exists inside government; it is just not the norm.

**The "accessible" workbook that is anything but — and the lesson hidden in it.** gov.uk's accessibility guidance has produced thousands of ODS files where the data is *transposed*: periods run across columns and the metric you want is one row buried halfway down, beneath a "Source:" caption your naïve matcher grabs first. I lost an iteration discovering that the row I needed was labelled "**Total** net additional dwellings," not "Net additional dwellings." It would be cheap to mock these files — but they exist to serve screen-reader users under the Public Sector Accessibility Regulations, a duty I share. The honest lesson is the opposite of mockery: a transposed multi-table workbook is *also* poor for a blind user. **Both audiences are failed by the same root cause** — there is no canonical machine-readable source to render *from*.

**The quarterly carry-forward sheet.** Homelessness table TA1 puts the year in column 0 *only on the first quarter*, blank for Q2–Q4 (carry it forward), the quarter in column 1, the value in a third column. No machine reads that without bespoke logic.

**The believably-wrong workbook.** The ONS house-price-to-earnings ratio is a multi-sheet workbook containing *both* the median and the lower-quartile ratio on differently-named tabs — and **both pass any plausible sanity check**, so a wrong-tab fetch yields a credible, wrong chart. The only safe path was to parse the "Contents" sheet, read the human-language table descriptions, and disambiguate. An LLM is genuinely good at that. It should never have to be.

**The national headline that exists nowhere as a number.** The Environment Agency's storm-overflow (sewage) data is published as annual `.zip` archives, each containing one workbook per water company, each with thousands of per-asset rows. To get the single figure that makes the news — total spill hours — you download the zip, unpack it, open every workbook, find the "Total Duration (hours)" column (whose header *also* mentions counting, defeating a careless filter), and sum across all of it. The headline number is real, public, quoted by ministers — and not published anywhere a machine can simply read it.

**Format as embargo.** Bathing-water classifications — the "% of beaches rated Good or Excellent" that is a live public concern — are published as PDFs and HTML prose. There is no machine-readable classification table at all. The data exists; the *format* fences it off.

**The number that used to be published.** NHS England discontinued the consolidated national RTT (referral-to-treatment) waiting-times series. What remains is ~9 MB monthly per-organisation workbooks; the national "% within 18 weeks" must now be *reconstructed* by summing hundreds of providers across waiting-time bands. A figure that used to be free is now merely derivable, at cost.

**Identity that decays on contact.** NHS files live at paths with random monthly suffixes (`…-May-2026-wlgnE2.xls`), so you must scrape the landing page every month to find the current link. (To be fair, random suffixes are legitimate cache-busting — I rely on the same trick myself; the missing piece is just a stable `latest` alias *alongside* the versioned file.) Yearly releases get new URL slugs annually, so any hard-coded path rots within twelve months.

**Walls, and walls disguised as weather.** Some public data sits behind authentication — DWP's Stat-Xplore wants a free, self-service API key. That is *fine*; a two-minute key is basic API hygiene, and the only sensible ask is *one* key across the estate rather than a different credential per department. The indefensible variant is different: `digital.nhs.uk` returns 403 to automated clients even with a browser-like user agent, for workforce statistics that are otherwise wholly public; the EA's download endpoint rate-limits unpredictably, so my pipeline was non-deterministic. The point is not "remove all protection" — uncontrolled bot traffic degrades the service for humans and costs real egress money. The point is that **blanket-blocking every script is not the same as managing abuse**, and open statistics should be served from infrastructure built for automated access with published, generous limits — not behind a wall that can't tell a citizen's agent from a denial-of-service.

And one constraint worth stating plainly, because a serious proposal must respect it: the suppression markers I had to handle (`w`, `x`, `z`, `[c]`) are not formatting noise — they are **statistical disclosure control**, protecting individuals in small cells under the Code of Practice for Statistics and data-protection law. The goal is never "publish everything as a value." It is to make the *suppression itself* machine-readable.

---

## Why this is now strategically unavoidable

For twenty years these were analyst grumbles, tolerable because a scarce, skilled human absorbed the cost once, slowly. Two things have changed.

**The bottleneck has moved.** Analysis is now cheap and instant: a model reads a workbook, infers a chart, writes the prose, reasons about caveats, in seconds. The *only* expensive step left is the mechanical one — acquisition and normalisation. We have automated the hard part and left the easy part manual, so the friction we used to hide inside a salary is now the rate-limiting step for an entire category of public-interest tools: citizen dashboards, fact-checkers, accountability trackers, local-journalism aids, policy simulators.

**The interface is becoming the agent.** Increasingly the reader is not an analyst but an assistant acting *for* a citizen. If that assistant cannot reliably read official statistics, it will do what assistants do: fall back on whatever it *can* read — secondary commentary, stale aggregators, or its own training data — and the authoritative source loses the room to the convenient one. "LLMs will just work with this data" is therefore not a nice-to-have; it is how the official figure stays the figure of record.

There is also an **equity** dimension, and it cuts to value for money. Badly-published open data is, in practice, *closed* to anyone without an engineering budget — a school governor, a parish council, a single reporter, a citizen with a question. "Open" should mean open to a fifteen-line script and an everyday AI, not just to those who can afford the archaeology. And the archaeology is deepest exactly where the public most needs to dig.

---

## The honest diagnosis

Strip out the rhetoric and the problem is sharp and defensible:

> The UK produces world-class primary statistics across many independent and arm's-length bodies, but has **no coordinating, machine-first publishing standard and no domestic harmonisation layer** across that estate. So every consumer — increasingly an agent acting for a citizen — privately rebuilds discovery, identity, normalisation, semantics and provenance, per source, by hand. That private cost is invisible to producers and falls entirely on the public, heaviest in the high-accountability tail.

A note on the source I praised. The cleanest dataset I touched was the World Bank's — but that is *survivorship bias*, and the correction matters. The World Bank is a downstream *aggregator* that ingests national outputs (often the ONS's), harmonises them, and re-publishes them — stale and smoothed — after someone else did the hard part. The lesson is not "every primary publisher should look like the World Bank." It is: **a harmonisation layer is what makes data usable, the World Bank proves it can exist, and the UK has no domestic equivalent for its own statistics.** We currently outsource the usability of our own data to a foreign aggregator. The proposal is to build that thin layer once, at home, over the timely primary outputs we already produce — without touching their timeliness or methodology.

---

## The value-for-money case

The fair objection to any "fix it all" essay is: *who pays, and is it worth it?* So put the economics first.

We are **already paying the larger bill** — we just never see the invoice. Every consumer of UK statistics, public and private, rebuilds the same plumbing: discovery, link-chasing, format wrangling, unit inference, provenance. Multiply that across every dashboard, newsroom, think-tank, regulator and citizen tool, forever. The aggregate is enormous and entirely deadweight. A thin national publish-and-harmonise layer is not new spending versus zero; it is **buying down a recurring, economy-wide cost** with a one-off, mostly-policy investment.

And it must be sequenced so that **value lands before the big money is spent**, riding existing pipelines rather than rebuilding them. The expensive fantasy — re-platforming the whole statistical estate to a heavyweight standard in one go — is exactly what kills programmes like this, and exactly what I am *not* proposing. The first, cheapest moves remove most of the pain.

---

## The strategy: machine-first, human-rendered, governed like accessibility

One doctrine change drives everything: today we publish **human-first, machine-maybe**. Invert it to **machine-first, human-rendered** — publish the canonical machine artifact, and generate the human page, the PDF, *and the accessible workbook* from it. This is the move that makes accessibility and machine-readability allies instead of rivals: the blind citizen and the citizen's agent are served from the same governed source.

Sequenced cheapest-value-first:

**Phase 0 — Make the rules (months; near-zero build).** Amend the publishing standard and assurance process so machine-readability is a release gate, *co-owned with accessibility, not against it*. The principle: publish a canonical machine artifact; render everything else from it. Policy is cheap and it starts shaping every new and updated release immediately.

**Phase 1 — Stable identity + a `latest` alias (low cost, high relief).** Give every series a persistent, resolvable identifier with a stable pointer to its current versioned asset, plus a minimal **DCAT** catalogue record. Keep cache-busting on the files. This alone kills slug-drift, hash-chasing and hidden editions — the single biggest source of integration rot — and it is routing and metadata, not new pipelines. Prioritise by traffic and accountability value, not alphabetically.

**Phase 2 — Canonical tidy data + in-band semantics, incrementally (medium cost, phased).** For each prioritised series, publish a long-format, one-observation-per-row dataset (CSV/Parquet) described by **CSVW** — escalating to **SDMX** only where the statistical model genuinely needs it, never as a big-bang adoption (the rock that SDMX programmes habitually founder on). Carry in-band: unit, scale, period, geographic coverage, revision status, **machine-readable suppression codes**, plausible range, source lineage, licence, next-release date. This is a *derived publish step over existing outputs*, generated by the producer's own pipeline — not a rebuild. Where a national total can be safely published, publish it as a value; where disclosure control forbids it, *declare that in metadata* rather than leaving consumers to re-derive a number that should not exist.

**Phase 3 — A national front door, automation-friendly (medium cost).** Expose the catalogue and datasets through one discoverable endpoint, served from infrastructure built for automated bulk access, with published generous rate limits, an identifying-header convention, and abuse controls that target *behaviour*, not "is this a browser?". One free estate-wide key for higher-volume use; no key for routine public aggregates; the single consistent gate reserved for genuinely restricted microdata.

**Phase 4 — An open-standard agent interface (low cost).** Expose the same catalogue and data through **MCP — now an open, multi-vendor industry standard, not a proprietary bet** — as a layer *over* the open data-standards foundation from Phases 1–3. Because the data underneath is independently usable via DCAT/CSVW/SDMX, the agent layer carries no lock-in: if the protocol landscape shifts, you swap the interface, not the data. The rule is *standards under standards*: open agent standard on top, open data standards beneath.

---

## What "good" looks like, end to end

A conformant series lets an agent — or a fifteen-line script — do this and nothing more:

1. **Resolve** `data.gov.uk/series/{domain}/{series}` → JSON metadata: title, unit, period, coverage, licence, revision status, suppression scheme, plausible range, a `data` link, and the next-release date.
2. **GET** the `data` link → long-format CSV/Parquet with CSVW context: one observation per row, typed, provisional/revised flagged, suppression machine-readable.
3. **Read** `provenance` → upstream source, methodology link, publication dates.
4. Optionally, **introspect** the same thing over the official MCP endpoint in one typed call.

No HTML scraping. No hash-chasing. No zip-spelunking. No tab-guessing. No 403 roulette. The agent spends its cycles on analysis and caveats — what it is uniquely good at — not archaeology.

---

## A maturity model that rewards governance *and* readability

Convenience is not quality, so score on **two independent axes** — and never let a properly-governed statistic be insulted for its format.

**Trust & governance (T0–T3):** badged status, methodology, revisions policy, disclosure control, a named producer. A National Statistic is T3 regardless of format.

**Machine-readability (M0–M5):**
- **M0** Embargoed-by-format (PDF/HTML only) — *bathing water today.*
- **M1** Scrape-only (file exists; discoverable only via unstable human links) — *NHS A&E/RTT today.*
- **M2** Awkward machine file (stable download, bespoke/transposed shape) — *most "accessible" ODS today.*
- **M3** Clean endpoint, semantics out-of-band — *many ONS/World Bank series; already a big step up.*
- **M4** Self-describing (stable ID + canonical tidy data + in-band CSVW/SDMX + machine-readable SDC + provenance).
- **M5** Standards-native access (M4 plus catalogued, automation-friendly serving, open agent interface).

A trusted National Statistic published as a PDF is **T3/M0** — governance excellent, machine-readability absent — and the model says exactly that. The programme's job is to lift the M score **without ever lowering the T score**. Accessibility isn't a competing axis; it is a *beneficiary* of M4+, because the accessible rendering is generated from the same canonical source.

---

## The pan-national note, without the fantasy

Cross-jurisdiction comparability is a decades-long methodological achievement, not a config setting — different statutory definitions, disclosure regimes, revision conventions and languages make it genuinely hard, and SDMX harmonisation across the OECD and Eurostat is still partial. I won't pretend a citizen's agent will soon ask one question across all countries. The realistic, valuable move is narrower: adopting CSVW/SDMX/DCAT in an internationally-aligned way means our outputs **slot into the existing international harmonisation machinery instead of being re-keyed by hand** — the same machinery the World Bank and OECD already run. We make ourselves *ingestible*, and let comparability accrete where the methodology genuinely supports it.

---

## How to start on Monday

The trap is to commission a strategy and build nothing. The antidote is to ship Phase 0 and Phase 1 on the highest-value, highest-scrutiny series first:

- Pick the twenty most-used and most-contested series (waiting lists, sewage, homelessness, the courts backlog, the tax burden…).
- Give each a stable identifier and a `latest` alias, and a DCAT record. (Weeks, not years.)
- Publish one canonical tidy CSV per series with CSVW metadata, generated from the existing pipeline.
- Add the machine-readability gate to assurance for those series, co-signed with accessibility.

That is enough to prove the model, retire the worst of the archaeology where it hurts most, and make the value-for-money case with evidence rather than slides.

---

## The bottom line

We produce world-class public statistics through independent, accountable institutions discharging real duties — accessibility, privacy, methodological integrity. None of that should change. What is missing is a **thin, standard, machine-first publishing and harmonisation layer** over those outputs: governed like accessibility, sequenced cheapest-value-first, respecting disclosure control by making it machine-readable rather than ignoring it, and built on open standards end to end — open *data* standards (DCAT/CSVW/SDMX) as the foundation, with an open *agent* standard (MCP) as the access layer on top.

The agents are coming whether we prepare or not. If we prepare, the authoritative figure stays authoritative, the disabled citizen and the citizen's AI are served from the same source, and "open" finally means open to a fifteen-line script. If we don't, the public's machines will route around the public's data — and we will keep paying, invisibly and forever, the larger bill.

I built the dashboard. The point was never that it was impossible. The point is that it shouldn't have required an archaeologist — and that the dig is hardest over the graves we most need to read.

---

*If you publish official statistics and want to know what your release scores on the two-axis model — and the cheapest path to lifting the M score without touching the T score — that is the conversation worth having.*
