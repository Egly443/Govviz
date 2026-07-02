# Agentic Open Data — Conformance Suite

A small, **adversarial** test set for "AI-ready" public statistics, drawn from real
UK government datasets that a downstream integrator had to consume to build the
[Govviz](../../README.md) dashboard. It is the practical companion to the essay
[*Agentic Open Data*](../blog-open-data-for-ai.md) and to the GDS/DSIT
*Guidelines and best practices for making government datasets ready for AI*
(Jan 2026) and the ODI's *NDL-Lite* prototype.

The machine-readable cases live in [`test-cases.json`](./test-cases.json).

Run the executable Govviz reference check with:

```bash
npm run conformance
```

Use `node scripts/run-conformance-suite.mjs --target=govviz --offline` to check
local `dist/data` instead of the deployed site. When `dist/data` exists, the
runner writes `dist/data/conformance-suite-report.json` and
`dist/data/conformance-suite-report.md`.

Reviewer aids:

- [Conformance source map](../source-map.md)
- [Priority evidence notes](../evidence/README.md)
- [Primary producer target shapes](./target-shapes/)
- [Producer outreach packets](../outreach/README.md)

## Crosswalk to current AI-ready data frameworks

| Govviz evidence | GDS/DSIT four-pillar alignment | ODI enterprise criteria alignment | Current status |
|---|---|---|---|
| AI-ready series profile, JSON schema, long CSV and CSVW | Technical optimisation; data and metadata quality | Appropriate formats; machine-readable metadata | Implemented by the generated open-data product. |
| `provenance`, source URL, source hashes, `compiler`, pipeline commit | Organisation and infrastructure context | Provenance; versioned assets; version control | Implemented as downstream evidence. |
| `catalog.json`, `series/index.json`, `graph.jsonld`, MCP descriptor | Technical optimisation; data and metadata quality | Data product access; API-like static URLs; active cataloguing | Implemented as static artefacts under `/data/`. |
| Build gates for schema shape, `validRange`, source fingerprints and generated records | Technical optimisation; metadata quality | Monitoring checkpoints | Implemented in local/CI checks where the scripts run. |
| `semanticTags`, `subjectUris`, policy-problem tags | Data and metadata quality | Semantic interlinkage; discovery metadata | Initial conservative tagging generated from known metadata. |
| `qualityDimensions` | Data and metadata quality | Quality evidence | Warning-level downstream evidence aligned to the Government Data Quality Framework. |
| `dataSteward`, `contact`, `accessProcess`, `legalBasis`, `riskOwner`, `qualityOwner` | Organisation and infrastructure context; legal, security and ethical compliance | Governance | Recommended fields in the profile/schema, not hard required for Govviz because primary publishers own those facts. |

Govviz currently satisfies the file-format, machine-readable metadata,
provenance, versioned-asset, static data product, version-control and build-gate
parts of the GDS/DSIT and ODI guidance for its own downstream reference build.
It does **not** claim to satisfy upstream policy-as-code access controls, named
official data stewards, primary-publisher access processes, complete official
cataloguing, a government knowledge graph, or a closed AI-data feedback loop.
Those remain explicit gaps or recommended warning fields.

## Why this exists

Aggregation prototypes (rightly) start with tractable sources. But "AI-ready" has
to be measured **at the accountability tail** — sewage, NHS waiting times,
homelessness, bathing water — because that is where public scrutiny concentrates
and where the data is worst. This suite codifies those hard cases so a producer,
the National Data Library, or an assurance reviewer can check **"is this actually
readable by a fifteen-line script / a citizen's agent?"** rather than self-asserting
readiness against a checklist.

## How a case is scored (two axes)

- **T (Trust & governance, T0–T3)** — is it badged, with methodology, revisions
  policy, disclosure control and a named producer? *Never lower the T score.*
- **M (Machine-readability, M0–M5)** — from M0 (PDF/HTML-only) to M5
  (standards-native, catalogued, automation-friendly, open agent interface).

A dataset is **AI-ready at M4+ without lowering T**. M4–M5 corresponds to passing
the GDS/DSIT four-pillar self-assessment (technical optimisation, metadata,
governance, access); the probes here are the **externally-auditable** form of that
self-assessment. The highest-value work is the **high-T, low-M** quadrant —
trusted National Statistics still trapped in PDFs and transposed workbooks.

## Non-goals

The suite does not certify official statistics, replace producer methodology,
centralise primary data, publish restricted microdata, or bypass disclosure
control. It tests whether already-published public aggregates can be consumed
through a thin, inspectable machine profile.

## The enforcement point

The Jan-2026 guidance is best-practice plus a *voluntary* self-assessment.
Voluntary data-quality initiatives under-deliver without a gate. The ask:
**make passing this suite (for a prioritised set of high-T, low-M series) a
release-assurance gate, co-owned with accessibility, with procurement teeth.**

## A reference harness already exists

This is not theory. [`scripts/build-data.mjs`](../../scripts/build-data.mjs) is a
**working harness that exercises every source in the suite against the live
endpoints in CI** — including the awkward tail. Reuse it directly:

- **The `SOURCES` manifest is a portable conformance record.** Each entry already
  carries an `id`, a machine-readable **plausible-range guard (`min`/`max` + scale)**,
  and a `get()` fetcher. The guard is a working prototype of the *in-band plausible
  range* the essay asks producers to publish; it is exactly what stops a
  "successful" fetch of the wrong table from showing wrong data.
- **The fetchers are executable documentation** of how to read each hostile shape:
  the TA1 quarterly carry-forward, the transposed LT120, the ONS Contents-sheet
  disambiguation (median vs lower-quartile), the EDM `.zip`→unzip→sum, the
  random-suffix landing-page scrape. These are the "proven source patterns" in
  [`CLAUDE.md`](../../CLAUDE.md) and the negative space of what a conformant
  endpoint would make unnecessary.
- **Provenance capture** (`setSrc` → `srcUrl` → `realSourceUrl`) is a working
  prototype of the *provenance-travels-with-the-data* requirement.
- **The honesty gate + `realPoints`/`realLine`** demonstrate the safe default:
  show real sourced data where it exists, a clearly-labelled placeholder where it
  does not — never a fabricated number.

In other words, the things this suite asks *government* to publish (stable ids,
guards, provenance, tidy data) already exist here as a consumer-side workaround.
The goal is to move them upstream so consumers stop having to rebuild them.

## Status legend (per case)

- `pass` — already AI-ready enough to consume cleanly (positive controls).
- `parseable-with-bespoke-logic` — obtainable, but only with custom per-source code.
- `ambiguous` — parseable but **semantically unsafe** (a plausible wrong answer).
- `reconstruction-required` — a previously-published figure now only derivable.
- `intermittent` — fetch succeeds only when an endpoint is not rate-limiting.
- `blocked` — embargoed by format, or blocked to automated clients.

## Contributing / reuse

The cases are deliberately source-agnostic in their pass criteria. If you run a
statistical platform or the NDL, the useful loop is: take a high-T/low-M case,
publish a version that satisfies its `pass_criteria`, and the corresponding
Govviz fetcher should collapse to "resolve id → GET tidy data." When that happens
for a case, its `M` score has genuinely moved. Licence follows the repository.

For a minimum viable producer route, see the
[producer implementation guide](../producer-guide.md). For reported data-quality
or agent-consumption failures, use the [feedback loop](../feedback-loop.md).
