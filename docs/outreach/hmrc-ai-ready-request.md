# HMRC AI-Ready Data Request

## Request

Please publish average speed of answer as a single stable monthly series with a
declared numeric duration unit.

## Current Friction

The monthly performance reports are separate publications. Across editions, the
wait-time value can appear as an Excel time serial, display-like text, or decimal
number. Consumers can therefore parse a plausible but wrong duration.

## Minimal Target Shape

- Stable record: `/data/series/hmrc-call-wait.json`
- Latest CSV alias: `/data/series/hmrc-call-wait/data.csv`
- CSV columns: `period,value,unit,unit_multiplier,status`
- Unit: `minutes` or `seconds`, declared in-band
- Guard range if minutes: `1-40 minutes`
- Provenance fields: collection URL, derivation note, revision status, licence

Target shape:
../conformance/target-shapes/hmrc-average-speed-of-answer.md

Govviz reference record:
https://egly443.github.io/Govviz/data/series/hmrc-call-wait.json

## Policy Fit

This is a small metadata and publication-shape change that would remove
ambiguous spreadsheet semantics while keeping the current official reports.
