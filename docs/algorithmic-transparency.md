# Algorithmic Transparency

Govviz adds a thin analytical layer on top of official-source data: RAG colour,
momentum, department block sizing, and uncertainty labels. This document makes
that layer inspectable. It is written in the spirit of the UK Data Ethics
Framework and Algorithmic Transparency Recording Standard, while noting that
Govviz is not a government decision tool and does not make eligibility,
enforcement, funding, or operational decisions.

## Purpose

The scoring layer helps users scan long-run public-service performance. It is a
navigation and interpretation aid, not an official rating of departments,
ministers, civil servants, or policy programmes.

## Inputs

Govviz uses:

- official-source time series fetched in CI;
- series metadata: unit, geography, periodicity, producer, source URL,
  revision status, and validation range;
- declared target or service standard where one exists;
- historical observed range where no external target exists;
- department spending weights used only for treemap area.

No personal data, restricted microdata, or individual-level records are used.

## RAG Colour

Each tile receives a red, amber, or green colour from the latest sourced value.
The preferred scoring route is an external published benchmark:

- **Target-backed score:** where a target, standard, or threshold exists, green
  means the latest value is at or beyond that benchmark, red means materially
  away from it, and amber is the transition band.
- **Own-range fallback:** where no external benchmark exists, Govviz compares
  the latest value with that series' own observed history. These tiles are
  deliberately desaturated and labelled so they do not read as an official
  verdict.
- **Unsourced or missing:** if no official source is wired, the tile is grey and
  no score is inferred.

Direction matters. For some series higher is better; for others lower is better.
That direction is part of the series definition and must be checked before a
colour is interpreted.

## Momentum

Momentum is a short-run slope over recent observations. It is intended to answer
"is this moving in a better or worse direction recently?", not "what caused the
change?" Momentum is weaker evidence when:

- observations are sparse or irregular;
- the latest point is provisional;
- a definition changed;
- the series has a step change from revision or methodology.

Momentum must not override the latest-value RAG score. A poor service can be
improving, and a good service can be deteriorating.

## Spend Sizing

Department blocks are sized by broad public-spending responsibility so the
overview does not visually equate a small function with a very large one. Spend
sizing is approximate context, not a value-for-money judgement. It does not mean
every indicator is caused by that department's controllable spend.

## Uncertainty Handling

Govviz currently handles uncertainty conservatively:

- it preserves revision status and provenance where available;
- it refuses fabricated fallback data;
- it greys out missing source data;
- it uses validation ranges to catch wrong-but-plausible parses;
- it labels own-range scoring separately from target-backed scoring.

Current limitations:

- many producer sources do not publish machine-readable confidence intervals;
- some series are management information rather than National Statistics;
- historical breaks and definition changes may not be fully encoded;
- the UI does not yet show a numeric confidence score.

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| A colour is treated as a complete departmental grade. | Do not publish a single league-table score; show series-level provenance and charts. |
| Own-range scoring is mistaken for target performance. | Desaturate and label own-range tiles. |
| Spending area is read as causal attribution. | Document that sizing is contextual and approximate. |
| A parser selects a plausible wrong table. | Use source-specific parsing, provenance, and validation ranges. |
| Provisional data is overinterpreted. | Preserve revision status and source links. |
| Missing official data is filled with guesses. | Show explicit missing-source placeholders instead. |

## Voluntary ATRS-Style Summary

| Field | Govviz position |
|---|---|
| Owner | Open-source Govviz maintainers. |
| Tool type | Public dashboard and static open-data compiler. |
| Decision impact | No automated decisions; no eligibility or service allocation. |
| Data type | Open public aggregate statistics. |
| Model type | Deterministic scoring and visual encoding, not machine learning. |
| Human oversight | Maintainer review through source checks and GitHub issues. |
| Appeal route | Data-quality issue template and source-level correction route. |

