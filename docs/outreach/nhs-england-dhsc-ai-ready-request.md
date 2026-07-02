# NHS England / DHSC AI-Ready Data Request

## Request

Please publish national RTT headline series as stable monthly machine-readable
records, starting with incomplete pathways within 18 weeks.

## Current Friction

Govviz currently reconstructs the national 18-week percentage from monthly
provider workbooks. This is possible but fragile, and it makes a high-profile
official headline harder for automated public-interest reuse than it needs to be.

## Minimal Target Shape

- Stable record: `/data/series/rtt-18-week.json`
- Latest CSV alias: `/data/series/rtt-18-week/data.csv`
- CSV columns: `period,value,unit,unit_multiplier,status`
- Unit: `percent`
- Guard range: `40-100 percent`
- Provenance fields: RTT collection URL, method, revision status, licence

Target shape:
../conformance/target-shapes/nhs-rtt-incomplete-within-18-weeks.md

Govviz reference record:
https://egly443.github.io/Govviz/data/series/rtt-18-week.json

## Policy Fit

This is a low-risk publishing improvement: the aggregate exists conceptually, and
the change makes the trusted official figure easier for scripts, crawlers, and
assurance tools to consume.
