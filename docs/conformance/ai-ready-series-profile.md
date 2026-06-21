# The "AI-ready series" profile (v0.1)

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

## Required fields (the metadata record)

`GET {series-id}` → JSON. Required unless marked optional.

| Field | Type | Meaning | Crosswalk |
|---|---|---|---|
| `id` | URI | Permanent, resolvable series identifier | DCAT `dcat:Dataset`/`dct:identifier` |
| `title` | string | Human title of the series | `dct:title` |
| `description` | string | **Disambiguating** description (e.g. "*median* house price ÷ *median* earnings") | `dct:description` |
| `producer` | string/URI | Named accountable producer | `dct:publisher` |
| `statisticType` | enum | e.g. National Statistic / Official Statistic / Management Information | OSR Code of Practice |
| `measure` | string | What one observation counts | SDMX `measure` |
| `unit` | string/URI | Unit of measure (e.g. `hours`, `percent`, `ratio`, `households`) | SDMX `UNIT_MEASURE`; CSVW `unit` |
| `geography` | code | Coverage (e.g. ONS code `E92000001` = England) | SDMX `REF_AREA` |
| `periodicity` | ISO 8601 duration | e.g. `P1Y`, `P3M`, `P1M` | SDMX `FREQ` |
| `validRange` | `{min,max}` | **Published plausible-range guard** — consumers reject values outside it | (novel; the safety field) |
| `suppressionScheme` | URI | Vocabulary defining the SDC codes used in the data | Code of Practice / data-protection |
| `revisionStatus` | enum | `provisional` / `revised` / `final` | SDMX `OBS_STATUS` |
| `licence` | URI | e.g. Open Government Licence v3 | `dct:license` |
| `provenance` | object | `{source, methodology, derivation}` | PROV-O; `dct:source` |
| `nextRelease` | date | When the next edition is due (or `discontinued`) | `dct:accrualPeriodicity` |
| `latest` | URL | Stable pointer to the current data file | DCAT `dcat:distribution` |
| `csvw` | URL (optional) | CSVW table schema for the data file | CSVW |
| `agent` | URL (optional) | Open agent interface (e.g. MCP) over this series | — |

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
  "nextRelease": "2027-03-31",
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
catalogued (DCAT), served from automation-friendly infrastructure, and exposes an
open agent interface. A series must never drop its **T** (trust/governance) score
to raise **M** — the profile is additive to the Code of Practice, not a substitute.

*v0.1 — a starting point for discussion, not a finished standard. Issues and pull
requests welcome; see the conformance suite README for how to extend it.*
