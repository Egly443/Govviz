# Storm-Overflow Spill Hours

Case id: `edm-storm-overflow-spill-hours`  
Series id: `defra-sewage-hours`  
Producer: Defra / Environment Agency  
Last verified: 2026-07-02

## Source

`data.gov.uk` package: EDM Storm Overflows Annual Returns
(`19f6064d-7356-466f-844e-d20ea10ae9fd`).

## Failure Mode

The annual figures are published as zip archives with one workbook per water
company. A national total is not directly published; a consumer must download
every workbook and sum `Total Duration (hours)` across thousands of overflow
rows. Automated access to the environment download endpoint has also produced
non-deterministic `403` responses.

## Pass Criteria

- Publish a stable series id with a `latest` alias.
- Publish one national annual total per year with unit `hours`.
- Serve a low-volume scripted client with HTTP 200.
- Include unit, coverage, provenance, and method in-band.

## Govviz Record

- Record: https://egly443.github.io/Govviz/data/series/defra-sewage-hours.json
- CSV: https://egly443.github.io/Govviz/data/series/defra-sewage-hours/data.csv
- CSVW: https://egly443.github.io/Govviz/data/series/defra-sewage-hours/data.csv-metadata.json

## Parser Pointer

See `docs/source-map.md` entry `edm-storm-overflow-spill-hours`. The current
workaround is the `defra-sewage-hours` source block in `scripts/build-data.mjs`,
which resolves the CKAN package, filters yearly zip files, extracts workbooks,
and sums the spill-duration column.
