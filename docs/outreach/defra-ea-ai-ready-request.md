# Defra / Environment Agency AI-Ready Data Request

## Request

Please publish storm-overflow spill hours as a stable national annual series
alongside the existing EDM annual-return workbooks.

## Current Friction

The current publication requires consumers to resolve annual zip archives,
extract water-company workbooks, and sum `Total Duration (hours)` across many
asset rows. Automated clients have also seen intermittent `403` responses from
the download path.

## Minimal Target Shape

- Stable record: `/data/series/defra-sewage-hours.json`
- Latest CSV alias: `/data/series/defra-sewage-hours/data.csv`
- CSV columns: `period,value,unit,unit_multiplier,status`
- Unit: `hours`
- Guard range: `500000-6000000 hours`
- Provenance fields: source package, methodology URL, derivation method, licence

Target shape:
../conformance/target-shapes/edm-storm-overflow-spill-hours.md

Govviz reference record:
https://egly443.github.io/Govviz/data/series/defra-sewage-hours.json

## Policy Fit

This aligns with the GDS/DSIT AI-ready data guidance by improving technical
optimisation and data/metadata quality without changing the official statistic
or weakening governance.
