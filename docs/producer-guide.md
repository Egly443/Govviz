# Minimum Viable Producer Implementation Guide

This guide is for a public-sector team that wants to make one published
statistical series AI-ready in about a week without rebuilding its publication
platform. It is additive to existing GOV.UK, statistics, accessibility, and
disclosure-control workflows.

## Deliverables

Publish four stable assets:

1. a metadata JSON record;
2. a tidy CSV with one observation per row;
3. a CSVW schema for the CSV;
4. a human landing page that links to all three.

The goal is that a consumer can do:

```text
resolve stable id -> fetch metadata JSON -> fetch tidy CSV -> validate rows
```

without scraping a page, guessing a workbook tab, or reverse-engineering units.

## Week Plan

| Day | Work | Output |
|---|---|---|
| 1 | Choose one high-value series and assign an owner. | Stable id, owner, source publication. |
| 2 | Write the metadata record. | JSON with title, definition, unit, geography, licence, provenance. |
| 3 | Export tidy CSV. | `period,value,unit,status` rows. |
| 4 | Add CSVW and validation range. | Machine schema and plausible min/max. |
| 5 | Publish static files and test with a script. | Public URLs and a smoke test. |
| 6-7 | Review accessibility, disclosure, licence, and release calendar. | Sign-off and feedback route. |

## Stable Id

Use a permanent URL that names the measure, not the latest file:

```text
https://example.gov.uk/data/series/nhs/rtt-waiting-list-england
```

Avoid ids that include a year, random CMS suffix, or workbook filename.

## Metadata JSON

Minimum viable record:

```json
{
  "id": "https://example.gov.uk/data/series/nhs/rtt-waiting-list-england",
  "title": "Referral to treatment waiting list, England",
  "description": "Number of incomplete referral to treatment pathways waiting at month end in England.",
  "producer": "NHS England",
  "statisticType": "Official Statistic",
  "measure": "Incomplete RTT pathways waiting at month end",
  "unit": "pathways",
  "geography": "E92000001",
  "periodicity": "P1M",
  "validRange": { "min": 0, "max": 15000000 },
  "suppressionScheme": "https://example.gov.uk/def/suppression/v1",
  "revisionStatus": "provisional",
  "licence": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  "provenance": {
    "source": "Monthly RTT waiting times return",
    "methodology": "https://example.gov.uk/methodology/rtt",
    "derivation": "England total from published provider-level monthly return"
  },
  "nextRelease": "2026-08-14",
  "latest": "https://example.gov.uk/data/series/nhs/rtt-waiting-list-england/data.csv",
  "csvw": "https://example.gov.uk/data/series/nhs/rtt-waiting-list-england/data.csv-metadata.json",
  "contact": "mailto:statistics@example.gov.uk"
}
```

## Tidy CSV

Use one observation per row:

```csv
period,value,unit,status
2026-01,7423000,pathways,provisional
2026-02,7391000,pathways,provisional
2026-03,7368000,pathways,provisional
```

Rules:

- do not merge multiple measures into one value column;
- do not encode units in headings;
- do not use colour, notes, or cell position to carry meaning;
- include suppressed rows with a status code instead of deleting them;
- keep period formats consistent.

## CSVW

Example:

```json
{
  "@context": "http://www.w3.org/ns/csvw",
  "url": "data.csv",
  "tableSchema": {
    "columns": [
      { "name": "period", "datatype": "string", "required": true },
      { "name": "value", "datatype": "number", "required": false },
      { "name": "unit", "datatype": "string", "required": true },
      { "name": "status", "datatype": "string", "required": true }
    ],
    "primaryKey": "period"
  }
}
```

## Suppression And Disclosure

If a value is suppressed:

- publish the row with a null value and a declared status code;
- publish the suppression code vocabulary;
- do not rely on blank cells, `c`, `x`, or `..` without definitions;
- do not publish a derived total if disclosure control says it should not exist.

## Validation Range

Publish a broad plausible range for the measure. It is not a target and not a
quality claim. It helps consumers reject the wrong table, wrong unit multiplier,
or wrong geography.

Examples:

- a percentage may be `{ "min": 0, "max": 100 }`;
- a count may use an intentionally broad upper bound;
- a ratio may include realistic negative values if the method allows them.

## Release Calendar

The metadata record should say when the next update is due. If the date is not
fixed, publish a clear rule such as `second Thursday each month` on the human
page and use the best machine date available in metadata. Do not guess silently.

## Hosting

Static hosting is enough:

```text
/data/series/{series-id}.json
/data/series/{series-id}/data.csv
/data/series/{series-id}/data.csv-metadata.json
```

Set cache headers appropriate to the update cycle and keep a `latest` URL stable
even if content-versioned files are also published.

## Checklist

- Stable id resolves over HTTPS.
- Metadata JSON has title, definition, producer, unit, geography, periodicity,
  licence, provenance, revision status, release date, and validation range.
- CSV is long format with one row per observation.
- CSVW validates the columns.
- Suppression codes are explicit.
- Licence and attribution are clear.
- Contact route exists for data-quality and agent-consumption failures.
- A simple script can fetch the JSON and CSV without a browser.

