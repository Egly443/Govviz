# HMRC Average Speed Of Answer

Case id: `hmrc-average-speed-of-answer`  
Series id: `hmrc-call-wait`  
Producer: HMRC  
Last verified: 2026-07-02

## Source

HMRC monthly performance reports:
https://www.gov.uk/government/collections/hmrc-monthly-performance-reports

## Failure Mode

Each month is a separate publication. The average-speed-of-answer cell appears
in inconsistent spreadsheet encodings across editions: Excel time serial,
display-like text, or decimal value. A naive parser can return credible but
wrong values.

## Pass Criteria

- Publish the monthly series as a single machine-readable series.
- Use an unambiguous numeric unit such as seconds or decimal minutes.
- Include stable id, latest alias, unit, coverage, and provenance in-band.

## Govviz Record

- Record: https://egly443.github.io/Govviz/data/series/hmrc-call-wait.json
- CSV: https://egly443.github.io/Govviz/data/series/hmrc-call-wait/data.csv
- CSVW: https://egly443.github.io/Govviz/data/series/hmrc-call-wait/data.csv-metadata.json

## Parser Pointer

See `docs/source-map.md` entry `hmrc-average-speed-of-answer`. The parser path
is `hmrcCallWaitEditions`, `hmrcParseAsa`, `hmrcFindAsaInSheet`, and
`hmrcCallWait` in `scripts/build-data.mjs`.
