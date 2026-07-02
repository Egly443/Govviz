# The "AI-ready series" profile (v0.2)

A minimal, normative profile for publishing a single public statistical **series**
so that an agent — or a fifteen-line script — can consume it without scraping,
hash-chasing, tab-guessing, or silently picking the wrong measure. It is the
implementable form of the [*Agentic Open Data*](../blog-open-data-for-ai.md) essay
and the acceptance target behind the [conformance suite](./test-cases.json).

This is intentionally **thin**. It does not replace SDMX, DCAT-AP, CSVW, the
Code of Practice for Statistics, or the GDS/DSIT AI-ready guidance — it composes
them into the smallest set of obligations that makes a series machine-consumable
and machine-*safe*, and it crosswalks to each so adoption is additive, not a rebuild.

## Design rules

1. **Machine-first, human-rendered.** The canonical artifact is the machine series;
   the human page, PDF and accessible workbook are generated *from* it.
2. **Stable identity, versioned assets.** A permanent series id resolves to a
   `latest` pointer; individual files may keep cache-busting names.
3. **Semantics travel in-band.** Unit, coverage, periodicity, revision status,
   suppression scheme, plausible range, provenance and licence ship with the data.
4. **Disclosure control is encoded, not erased.** Suppression is a declared code
   with declared meaning — never a bare letter, a blank, or a silently-dropped row.
5. **Safe by construction.** A consumer must not be able to fetch a plausible
   *wrong* measure: each distinct measure is its own identified series with a
   machine-readable description, and a published validation range lets a consumer
   reject a wrong-but-plausible value.

## Crosswalk to 2026 AI-ready data criteria

| Govviz profile or build gate | GDS/DSIT pillar | ODI enterprise category | Status in Govviz reference build |
|---|---|---|---|
| Long CSV, CSVW, stable `latest` URL, content-versioned twin | Technical optimisation | Dataset properties | Satisfied for each generated series. |
| `id`, `title`, `description`, `measure`, `unit`, `geography`, `periodicity`, `semanticTags`, `subjectUris` | Data and metadata quality | Metadata | Satisfied or conservatively inferred downstream; primary publishers should assert canonical concepts upstream. |
| `provenance`, `compiler`, `sourceBytesHash`, `pipelineCommit`, `upstreamConformance` | Organisation and infrastructure context | Surrounding infrastructure | Satisfied for Govviz as a downstream compiler; not an upstream producer assertion. |
| `licence`, `suppressionScheme`, `accessClass`, `machineUseRestrictions`, `dataProtection`, `legalBasis` | Legal, security and ethical compliance | Governance | Recommended warning fields. Govviz can state open aggregate reuse; primary publishers own legal and stewardship claims. |
| `dataSteward`, `contact`, `riskOwner`, `qualityOwner`, `accessProcess`, `releaseCalendarUrl` | Organisation and infrastructure context | Governance | Recommended warning fields, usually not knowable by a downstream compiler. |
| Build checks for schema shape, `validRange`, source hashes and generated artefacts | Technical optimisation; data and metadata quality | Surrounding infrastructure | Satisfied as a local reference gate; should become a producer release gate for official publication. |
| `graph.jsonld`, `catalog.json`, `series/index.json` tags | Data and metadata quality | Active cataloguing / semantic interlinkage | Initial implementation; not a complete government knowledge graph. |

Known gaps against the ODI enterprise criteria: policy-as-code access controls
for upstream services, named upstream data stewards, a primary-publisher access
process, active official cataloguing, a full semantic knowledge graph, and a
closed AI-data feedback loop. Govviz records those as recommended fields or
limitations rather than inventing official facts.

## Required fields (the metadata record)

`GET {series-id}` → JSON. Required unless marked optional.

| Field | Type | Meaning | Crosswalk |
|---|---|---|---|
| `id` | URI | Permanent, resolvable series identifier | DCAT `dcat:Dataset`/`dct:identifier` |
| `title` | string | Human title of the series | `dct:title` |
| `description` | string | **Disambiguating** description (e.g. "*median* house price ÷ *median* earnings") | `dct:description` |
| `producer` | string/URI | Named accountable primary producer | `dct:publisher` |
| `statisticType` | enum | e.g. National Statistic / Official Statistic / Management Information | OSR Code of Practice |
| `measure` | string | What one observation counts | SDMX `measure` |
| `unit` | string/URI | Unit of measure (e.g. `hours`, `percent`, `ratio`, `households`) | SDMX `UNIT_MEASURE`; CSVW `unit` |
| `geography` | code | Coverage (e.g. ONS code `E92000001` = England) | SDMX `REF_AREA` |
| `periodicity` | ISO 8601 duration | e.g. `P1Y`, `P3M`, `P1M` | SDMX `FREQ` |
| `validRange` | `{min,max}` | **Published plausible-range guard** — consumers reject values outside it | (novel; the safety field) |
| `suppressionScheme` | URI | Vocabulary defining the SDC codes used in the data | Code of Practice / data-protection |
| `revisionStatus` | enum | `provisional` / `revised` / `final` | SDMX `OBS_STATUS` |
| `licence` | URI | e.g. Open Government Licence v3 | `dct:license` |
| `provenance` | object | `{source, methodology, derivation}` for the upstream data | PROV-O; `dct:source` |
| `compiler` | object | Downstream compiler metadata: `{name,url,compiledAt,pipelineCommit,sourceBytesHash,conformanceVersion}` | PROV-O activity/agent |
| `upstreamConformance` | enum | Whether the primary producer asserts this profile upstream; default `not-asserted-by-primary-publisher` | — |
| `expectedCadence` | enum | Observed/declared cadence used for freshness checks (`monthly`, `quarterly`, `annual`) | `dct:accrualPeriodicity` |
| `latestObservedPeriod` | string/null | Latest period present in the data file | SDMX `TIME_PERIOD` |
| `latestFetchedAt` | string/null | Compiler-side fetch evidence timestamp/date | PROV-O |
| `freshnessStatus` | enum | `current`, `aged`, or `unknown`, derived from observed period and cadence | — |
| `freshnessReason` | string | Human-readable explanation for `freshnessStatus` | — |
| `estimatedNextPeriod` | string/null (optional) | Compiler-side cadence projection; not an official release date | — |
| `nextRelease` | date/null (optional) | Official next release date only when a source-specific release calendar is known; otherwise `null` | release calendar |
| `conformanceLevel` | enum | Govviz reference-rendering level, e.g. `M5-reference-rendering`; not an upstream producer score | conformance suite |
| `limitations` | array | Caveats preventing overclaiming upstream or official compliance | — |
| `latest` | URL | Stable pointer to the current data file | DCAT `dcat:distribution` |
| `csvw` | URL (optional) | CSVW table schema for the data file | CSVW |
| `agent` | URL (optional) | Open agent interface (e.g. MCP) over this series | — |
| `semanticTags` | array (recommended) | Conservative policy-problem, theme and unit tags for discovery | DCAT `keyword`; ODI active cataloguing |
| `subjectUris` | array (recommended) | Stable identifiers for departments, geographies, source pages or concepts | schema.org `about`; linked-data interlinkage |
| `qualityDimensions` | object (recommended) | Accuracy, completeness, uniqueness, consistency, timeliness and validity evidence | Government Data Quality Framework |
| `dataSteward` | string/object (recommended) | Named upstream steward where the primary publisher declares one | ODI governance |
| `contact` | string/object (recommended) | Contact or feedback route for source questions | ODI governance |
| `accessClass` | enum (recommended) | `open-public-aggregate`, `open-registration-required`, `restricted-sensitive`, or `not-published-by-source` | GDS/DSIT access context |
| `accessProcess` | string/URL (recommended) | How a user or agent obtains access | ODI access process |
| `legalBasis` | string (recommended) | Legal basis or public-task basis for publication where declared | Legal/ethical compliance |
| `dataProtection` | string (recommended) | Personal-data and disclosure-control statement | Legal/security/ethical compliance |
| `riskOwner` | string/object (recommended) | Owner of misuse, interpretation or operational risk | ODI governance |
| `qualityOwner` | string/object (recommended) | Owner of upstream quality assurance | Government Data Quality Framework |
| `methodologyUrl` | URL (recommended) | Canonical methodology page | Code of Practice / quality |
| `revisionPolicyUrl` | URL (recommended) | Canonical revisions policy | Code of Practice |
| `releaseCalendarUrl` | URL (recommended) | Official release-calendar page | Timeliness |
| `relatedSeries` | array (recommended) | Machine links to numerator, denominator or comparable series | Semantic interlinkage |
| `sourceSystem` | string (recommended) | Named upstream system or dataset family | Lineage |
| `lineage` | string/object (recommended) | Machine-readable derivation chain beyond the short provenance text | PROV-O |
| `qualityStatement` | string (recommended) | Publisher quality statement or compiler caveat | Government Data Quality Framework |
| `knownLimitations` | array (recommended) | Source-specific gaps or interpretation limits | Quality and ethics |
| `machineUseRestrictions` | array/string (recommended) | Reuse constraints for automated consumers beyond the licence | Legal/security/ethical compliance |

The recommended governance fields are warning-level in the Govviz reference
build. A primary publisher should be expected to supply them for authoritative
publication; a downstream compiler should not invent named stewards, legal bases
or release calendars.

## Quality dimensions

`qualityDimensions` aligns to the Government Data Quality Framework. Govviz can
usually provide compiler-side evidence for:

| Dimension | Downstream evidence Govviz can provide | Boundary |
|---|---|---|
| Accuracy | Pointer to upstream methodology and any published caveat | Upstream statistical accuracy is not re-certified. |
| Completeness | Observation count and missing-local-data status | Source coverage is the producer's responsibility. |
| Uniqueness | One observation per `period`/`ref_area` key | Source duplicate handling remains source-specific. |
| Consistency | Same parser and CSVW profile for each emitted series | Does not prove cross-source conceptual consistency. |
| Timeliness | `latestObservedPeriod`, fetch date and freshness reason | Not an official release-calendar assertion. |
| Validity | `validRange` pass/fail where available | Derived or unavailable series may lack a guard. |

## The data file

`GET {series-id → latest}` → long-format, **one observation per row**, typed.
Minimum columns: `period`, `value`, `unit`, `status`. Suppressed cells carry a
status code from `suppressionScheme` — never a blank or a bare marker.

```csv
period,value,unit,status
2020,3100000,hours,final
2021,2670000,hours,final
2022,1750000,hours,final
2023,3610000,hours,final
2024,3614000,hours,final
```

Where a national total cannot be published without breaching disclosure control,
the record says so in `provenance`/`measure` rather than leaving a consumer to
re-derive a number that should not exist.

## Worked example (metadata record)

```jsonc
// GET https://data.gov.uk/series/defra/storm-overflow-spill-hours
{
  "id": "https://data.gov.uk/series/defra/storm-overflow-spill-hours",
  "title": "Storm overflow spill duration, England",
  "description": "Total annual duration of spills from all EDM-monitored storm overflows in England.",
  "producer": "Environment Agency",
  "statisticType": "Official Statistic",
  "measure": "Sum of annual spill duration across all monitored storm overflows",
  "unit": "hours",
  "geography": "E92000001",
  "periodicity": "P1Y",
  "validRange": { "min": 500000, "max": 6000000 },
  "suppressionScheme": "https://data.gov.uk/def/sdc/v1",
  "revisionStatus": "final",
  "licence": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  "provenance": {
    "source": "EA Event Duration Monitoring annual returns",
    "methodology": "https://www.gov.uk/government/publications/storm-overflows-edm-methodology",
    "derivation": "Sum of per-asset 'Total Duration (hours)' across all water-company returns"
  },
  "compiler": {
    "name": "Govviz",
    "url": "https://egly443.github.io/Govviz",
    "compiledAt": "2026-07-02T12:00:00.000Z",
    "pipelineCommit": "4cef88484da5",
    "sourceBytesHash": "sha256:...",
    "conformanceVersion": "ai-ready-series-profile-v0.2"
  },
  "upstreamConformance": "not-asserted-by-primary-publisher",
  "expectedCadence": "annual",
  "latestObservedPeriod": "2024",
  "latestFetchedAt": "2026-07-02",
  "freshnessStatus": "current",
  "freshnessReason": "Latest observed period 2024 is within the expected annual cadence.",
  "estimatedNextPeriod": "2025-12-31",
  "nextRelease": null,
  "conformanceLevel": "M5-reference-rendering",
  "limitations": [
    "Govviz is a downstream compiler, not the primary publisher.",
    "No upstream policy-as-code conformance assertion has been made by the primary producer."
  ],
  "latest": "https://data.gov.uk/series/defra/storm-overflow-spill-hours/data.csv",
  "csvw": "https://data.gov.uk/series/defra/storm-overflow-spill-hours/data.csv-metadata.json"
}
```

That single record collapses the worst case in the conformance suite — a
zip-of-workbooks with no national total, behind a 403-prone host — into
`resolve id → GET tidy data`. Every other case reduces the same way.

## Conformance

A series **conforms at M4** when it satisfies every required field above and its
data file is long-format with encoded suppression; it reaches **M5** when it is
catalogued (DCAT), served from automation-friendly infrastructure, exposes a
formal static endpoint contract, and exposes an open agent interface. A downstream
reference rendering must say so explicitly with `compiler`, `upstreamConformance`
and `limitations`: it can demonstrate the target machine shape without raising
the primary producer's upstream score. A series must never drop its **T**
(trust/governance) score to raise **M** — the profile is additive to the Code of
Practice, not a substitute.

*v0.2 — a starting point for discussion, not a finished standard. Issues and pull
requests welcome; see the conformance suite README for how to extend it.*
