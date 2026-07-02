# Temporary Accommodation

Case id: `homelessness-temporary-accommodation`  
Series id: `mhclg-temp-accommodation`  
Producer: MHCLG  
Last verified: 2026-07-02

## Source

MHCLG live tables on homelessness:
https://www.gov.uk/government/statistical-data-sets/live-tables-on-homelessness

## Failure Mode

The desired England quarterly total is in an ODS workbook where year and quarter
are split across columns. The year appears only on Q1 rows and must be carried
forward for Q2-Q4 before a consumer can construct dates.

## Pass Criteria

- Publish long-format rows with date, value, unit, and status.
- Keep the stable series id separate from the workbook file name.
- Declare quarterly cadence and provenance in-band.

## Govviz Record

- Record: https://egly443.github.io/Govviz/data/series/mhclg-temp-accommodation.json
- CSV: https://egly443.github.io/Govviz/data/series/mhclg-temp-accommodation/data.csv
- CSVW: https://egly443.github.io/Govviz/data/series/mhclg-temp-accommodation/data.csv-metadata.json

## Parser Pointer

See `docs/source-map.md` entry `homelessness-temporary-accommodation`. The
current workaround is the `mhclg-temp-accommodation` source block in
`scripts/build-data.mjs`.
