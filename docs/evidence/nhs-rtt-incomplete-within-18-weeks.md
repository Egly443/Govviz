# NHS RTT 18-Week Performance

Case id: `nhs-rtt-incomplete-within-18-weeks`  
Series id: `rtt-18-week`  
Producer: DHSC / NHS England  
Last verified: 2026-07-02

## Source

NHS England RTT waiting times:
https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/

## Failure Mode

The consolidated national series is not exposed as a simple current endpoint.
Govviz reconstructs it from monthly provider workbooks by summing incomplete
pathway totals and within-18-week bands across organisations.

## Pass Criteria

- Restore a published monthly national percentage series.
- Declare the stable series id, cadence, unit, revision status, and provenance.
- Avoid requiring consumers to aggregate provider files.

## Govviz Record

- Record: https://egly443.github.io/Govviz/data/series/rtt-18-week.json
- CSV: https://egly443.github.io/Govviz/data/series/rtt-18-week/data.csv
- CSVW: https://egly443.github.io/Govviz/data/series/rtt-18-week/data.csv-metadata.json

## Parser Pointer

See `docs/source-map.md` entry `nhs-rtt-incomplete-within-18-weeks`. The parser
path is `rttFileList`, `rttParseProvider`, `parseRtt`, and `rttData` in
`scripts/build-data.mjs`.
