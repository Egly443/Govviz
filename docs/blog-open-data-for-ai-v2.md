# Agentic Open Data: making public statistics readable by the machines acting for citizens

*A revised proposal. The first draft of this argument drew a sharp internal rebuttal from people who actually run statistical platforms — on accessibility law, disclosure control, arm's-length governance, cost, and my choice of "gold standard." They were right on several points. This version concedes what should be conceded, and is stronger for it.*

---

## Start with the steel, not the straw

It is easy to write a viral complaint about government data: pick the ten worst files, narrate the pain, demand a revolution. I did some of that. The trouble is that the people who publish these statistics are not incompetent and the awkwardness is not arbitrary. Most of it is the visible residue of real obligations — accessibility law, statistical disclosure control, independence of the statistical system, abuse management, and decades of legacy production. Any proposal that doesn't start there will be, rightly, dismissed by the only people who can act on it.

So let me start there, and build a proposal that survives contact with the people running the platforms.

**What I am *not* claiming:**

- I am not claiming the system is unusable. I built a ten-department, ~90-series public dashboard, alone, in weeks, on existing free APIs. The ecosystem is navigable.
- I am not claiming the publishers are at fault. Where the data is hard to read, it is usually because they are discharging a duty I also care about.
- I am not claiming there is one villain. There is no single "open data strategy" to blame, and that is itself part of the diagnosis.

**What I am claiming:** the *navigability* is bought with skilled, expensive, manual effort that scales badly precisely as AI makes everything else cheap; the cost falls hardest on exactly the high-accountability tail (waiting lists, sewage, the courts backlog); and the absence of a *coordinating publishing standard across a multi-owner estate* is now the rate-limiting step for a whole category of public-interest tools. That is a strategy gap, and it is fixable cheaply if we are honest about constraints.

---

## Conceding the strongest objections up front

### "You succeeded, so it isn't broken."

I succeeded at high, skilled cost — and that *is* the problem, not the refutation of it. "A funded engineer can do it in weeks" is not the test for public data. The test is whether a school governor, a parish councillor, a local reporter, or a citizen's everyday AI assistant can. The friction I hit lives disproportionately in the **tail** — and the tail is where public accountability concentrates. The clean sources (ONS CDID, World Bank) are the routine economic aggregates; the hostile ones were sewage spill hours, NHS waiting-time reconstruction, bathing-water quality, the temporary-accommodation count. The system is easiest exactly where scrutiny matters least and hardest exactly where it matters most. That inversion is the story.

### "The World Bank 'just works' because it's an aggregator — that's survivorship bias."

Correct, and I should have said so. The World Bank is a downstream harmoniser that ingests national outputs — often the ONS's — and re-publishes them normalised, *stale and smoothed*, after someone else did the hard part. It is the worst source for timeliness and the best for tidiness. The right lesson is not "every primary publisher should look like the World Bank." It is: **the harmonisation layer is what makes data usable, the World Bank proves it can exist, and the UK has no domestic equivalent for its own statistics.** We outsource our own data's usability to an external aggregator. The proposal below is, in essence, to build that thin harmonisation layer *once, nationally*, over the primary outputs we already produce — without touching their timeliness or methodology.

### "The 'accessible' workbooks you mocked are a legal disability obligation."

This is the objection I got most wrong, and it actually *strengthens* my case once corrected. Those transposed ODS files exist to satisfy the Public Sector Bodies Accessibility Regulations and WCAG. I should never have framed an accessibility duty as an annoyance. But here is the thing: a transposed, multi-table workbook is **also poor** for a screen-reader user. The real fix serves both audiences at once. **Publish a canonical machine-readable dataset, and generate the accessible human rendering *from* it** — so the disabled citizen and the citizen's agent are served from the same governed source, and neither is an afterthought. Machine-first publishing is not the enemy of accessibility; done properly it is the *engine* of it. My v1 set the two in opposition; that was the error.

### "Suppression markers are disclosure control protecting people's privacy — not a formatting nuisance."

Also correct, and I withdraw the flippancy. `w / x / z / [c] / [low]` are statistical disclosure control under the Code of Practice for Statistics and data-protection law: small cells suppressed so a patient or a single claimant cannot be re-identified. The ask is therefore *not* "publish everything as a value." It is narrower and entirely compatible with SDC: **make the suppression itself machine-readable** — a declared code with declared semantics in the metadata, not a bare letter a parser has to guess at — and, where a headline national total *can* be safely published, publish it as a value; where it genuinely cannot without disclosure, **say so, in metadata**, rather than leaving consumers to re-derive a number that should not exist. Respecting SDC and being machine-readable are not in tension. Today we often achieve neither cleanly.

### "Random filename hashes are cache-busting — and your own deployment notes rely on them."

Fair hit. Versioned asset names are correct engineering; stable filenames cause stale-edge-cache failures, and I have been bitten by exactly that. So I withdraw "hashes are incompetence." The precise, cheap ask is a **stable `latest` alias that resolves to the current versioned asset** — keep cache-busting on the file, add a permanent pointer to the series. That is a few lines of routing, not a re-platforming.

### "Banning anti-automation defences is operationally illiterate — and incoherent with your own 'publish a rate limit.'"

Guilty of overreach. Uncontrolled bot traffic degrades the service for humans and costs real egress money. The defensible position is not "remove all protection," it is: **open statistics should be served from infrastructure designed for automated bulk access** — object storage / CDN / a documented API with published, generous rate limits and an identifying-header convention — with abuse controls that target *behaviour* (volumetric, abusive patterns), not a blanket 403 to anything that isn't a browser. The failure mode I actually hit was the latter: well-behaved, low-volume, scheduled requests blocked outright. That is distinguishable from DDoS protection, and the standard should distinguish them. "Manage abuse" and "don't block all scripts" are not contradictory; v1's phrasing made them sound so.

### "A free self-service API key isn't friction — and you said so yourself."

Right. Stat-Xplore's key is fine; basic API hygiene is good. I am not asking for zero auth. I am asking for **one key across the estate instead of a different credential per department per dataset**, and for routine *already-public* aggregates to be fetchable without a key while genuinely restricted microdata sits behind that single consistent gate.

### "An 'official MCP server' is vendor lock-in to this year's fashion."

The strongest strategic objection, and I accept it. Mandating government infrastructure around one AI vendor's 2024 protocol is exactly the moving-target lock-in I would warn anyone else against. So I am **dropping the MCP mandate.** The durable layer is **standards-based and protocol-neutral**: plain HTTP, with **DCAT** for the catalogue, **CSVW** for tabular semantics, and **SDMX** where the statistical model warrants it. An agent-protocol adapter (MCP today, whatever succeeds it tomorrow) should be a **thin, swappable shim over that standard layer**, ideally community-maintained — never the foundation.

---

## The actual diagnosis, restated honestly

With the cheap shots removed, the real problem is sharper and more defensible:

> The UK produces excellent primary statistics across many independent and arm's-length bodies, but it has **no coordinating, machine-first publishing standard and no domestic harmonisation layer** across that estate. So every consumer — increasingly an AI agent acting for a citizen — must privately rebuild discovery, identity, normalisation, semantics and provenance, per source, by hand. That private cost is invisible on the producer's balance sheet and lands entirely on the public and the public-interest tools built for them. It is heaviest in the high-accountability tail.

Note what this does *not* say. It does not say "rip out the production pipelines." It does not say "abolish disclosure control." It does not say "one department is to blame." It says: **add a thin, standard, machine-first publishing and harmonisation layer over what we already produce, and govern it.**

---

## The proposal — costed, sequenced, constraint-aware

I am not proposing a nine-figure re-platforming. That was the fair criticism of v1: no cost, no sequence, no priorities. Here is the sequence, cheapest and highest-value first. The whole point is that each phase ships value independently and rides existing outputs.

### Phase 0 — Make the rules (months, near-zero build cost)

Amend the **publishing standard and the assurance process** so that machine-readability is a release gate, the way accessibility already is — and explicitly co-owned with accessibility, not against it. Add a single principle: *publish a canonical machine artifact; generate human and accessible renderings from it.* Nothing is built yet; the gate just starts applying to new and updated releases. This is policy, and policy is cheap.

### Phase 1 — Stable identity and a `latest` alias (low cost, high relief)

Give every published series a **persistent, resolvable identifier** with a **stable `latest` pointer** to its current versioned asset, plus a minimal **DCAT** catalogue record. Keep cache-busting on the files. This alone kills slug-drift, hash-chasing, and the hidden-edition problem — the single biggest source of integration rot — and it is routing and metadata, not new pipelines. **Prioritise by traffic and accountability value**, not alphabetically: the most-used and most-scrutinised series first.

### Phase 2 — Canonical tidy data + in-band semantics, incrementally (medium cost, phased)

For each prioritised series, publish a **long-format, one-observation-per-row** dataset (CSV/Parquet) described by **CSVW** (escalating to **SDMX** only where the statistical model genuinely needs it — not as a big-bang adoption, which is where SDMX programmes have historically foundered). Carry in-band: unit, scale, period, geographic coverage, revision status, **machine-readable suppression codes**, plausible range, source lineage, licence, and next-release date. Crucially this is a **derived publish step over existing outputs**, generated by the producer's pipeline — not a rebuild of the pipeline. Where a headline total can be safely published, publish it; where SDC forbids it, declare that in metadata.

This is the phase that eliminates the bespoke-parser tax — and it is exactly the work the World Bank does *for* us, brought in-house and done once.

### Phase 3 — A national front door and bulk/automation-friendly serving (medium cost)

Expose the DCAT catalogue and the canonical datasets through **one discoverable national endpoint**, served from infrastructure built for automated bulk access, with **published generous rate limits, an identifying-header convention, and abuse controls targeted at behaviour**. One free, estate-wide key for higher-volume use; no key for routine public aggregates; the single consistent gate reserved for restricted microdata.

### Phase 4 — A thin, swappable agent adapter (low cost, community-friendly)

A **protocol-neutral** adapter that lets an agent introspect the catalogue and pull typed data — delivered as a shim over the standard layer, replaceable as agent protocols evolve. Government owns the standards layer; the agent shim can be community-maintained. No lock-in.

### The cost-benefit the critics rightly demanded

Phases 0–1 are policy and routing: weeks to months, minimal spend, and they remove the *majority* of integration rot. Phase 2 is incremental and rides existing pipelines, so it can be funded per-domain and prioritised by public value rather than as one monolith. The honest comparison is not "this programme vs nothing"; it is "a thin publish-and-harmonise layer vs the *aggregate* cost, paid invisibly across the whole economy, of every consumer rebuilding the same plumbing forever." We currently pay the larger sum; we just never see the invoice.

---

## A maturity model that rewards governance, not just convenience

The fair critique of my first maturity model was that it rewarded *parse-ability* and penalised *accountability* — ranking a context-free JSON blob above a fully-governed National Statistic. That was a real flaw. So score on **two independent axes**, not one:

**Trust & governance (T0–T3):** is it badged, with methodology, revisions policy, disclosure control, and a named producer? A National Statistic is T3 regardless of format.

**Machine-readability (M0–M5):**
- **M0** Embargoed-by-format (PDF/HTML only).
- **M1** Scrape-only (file exists; discoverable only via unstable human links).
- **M2** Awkward machine file (stable download, bespoke/transposed shape).
- **M3** Clean endpoint, semantics out-of-band.
- **M4** Self-describing (stable ID + canonical tidy data + in-band CSVW/SDMX + machine-readable SDC + provenance).
- **M5** Standards-native access (M4 plus catalogued, automation-friendly serving via open standards).

The goal is **high on both axes**. A trusted National Statistic published as a PDF is T3/M0 — *governance excellent, machine-readability absent* — and the model now says exactly that, instead of insulting the statisticians who earned the T3. The work is to lift the M score without ever lowering the T score. Accessibility is not a third axis fighting the others; it is a *beneficiary* of M4+, because the accessible rendering is generated from the same canonical source.

---

## The pan-national note, with the naivety removed

Cross-jurisdiction comparability is a decades-long methodological achievement, not a config setting — different statutory definitions, disclosure regimes, revision conventions and languages make it genuinely hard, and SDMX harmonisation across the OECD/Eurostat is still partial. I won't pretend a citizen's agent will soon "ask one question across all countries." The realistic, valuable move is narrower: **the UK adopting CSVW/SDMX/DCAT in an internationally-aligned way means our outputs slot into the existing international harmonisation machinery instead of being re-keyed by hand** — the same machinery the World Bank and OECD already run. We make ourselves *ingestible*, and let comparability accrete where the methodology genuinely supports it. That is incremental and true, not utopian.

---

## The bottom line, earned this time

The honest version of this argument is less dramatic and far harder to dismiss:

We produce world-class public statistics through independent, accountable institutions discharging real duties — accessibility, privacy, methodological integrity. None of that should change. What is missing is a **thin, standard, machine-first publishing and harmonisation layer** over those outputs, governed like accessibility is, sequenced cheapest-value-first, respecting disclosure control by making it machine-readable rather than ignoring it, and protocol-neutral rather than chained to this year's agent framework.

Do that, and the disabled citizen, the citizen's AI, the local reporter and the funded engineer are all served from the same governed source. Fail to, and "open" data stays open only to those who can afford the archaeology — and the archaeology is deepest exactly where the public most needs to see.

I built the dashboard. The point was never that it was impossible. The point is that it shouldn't have required an archaeologist — and that the dig is hardest over the graves we most need to read.

---

*Corrections and dissent from people who run these platforms made this draft better. If you publish official statistics and want to know what your release scores on the two-axis model — and the cheapest path to lifting the M score without touching the T score — that is the conversation worth having.*
