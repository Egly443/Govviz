# MHCLG / ONS AI-Ready Data Request

## Request

Please publish stable long-format series records for temporary accommodation and
median house-price-to-earnings affordability.

## Current Friction

The temporary-accommodation table requires spreadsheet layout inference because
year and quarter are split across cells. The affordability workbook is
semantically risky because median and lower-quartile ratios both produce
plausible values unless the parser reads human-language sheet metadata.

## Minimal Target Shape

- Temporary accommodation record: `/data/series/mhclg-temp-accommodation.json`
- Affordability record: `/data/series/mhclg-affordability.json`
- Latest CSV aliases under each series id
- CSV columns: `period,value,unit,unit_multiplier,status`
- Explicit unit, geography, cadence, provenance, and measure definition

Target shapes:

- ../conformance/target-shapes/homelessness-temporary-accommodation.md
- ../conformance/target-shapes/house-price-to-earnings-median.md

Govviz reference records:

- https://egly443.github.io/Govviz/data/series/mhclg-temp-accommodation.json
- https://egly443.github.io/Govviz/data/series/mhclg-affordability.json

## Policy Fit

The request preserves the official workbook publications while adding a thin
AI-ready layer: stable ids, tidy rows, in-band metadata, and clear provenance.
