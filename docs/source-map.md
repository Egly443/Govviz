# Conformance Source Map

This map links each conformance case to its Govviz series id, parser/source
pattern, guard, and deployed record. Line numbers in `scripts/build-data.mjs`
move; function names and source ids are the stable review anchors.

| Case id | Series id | Parser/source pattern | Guard | Deployed record |
| --- | --- | --- | --- | --- |
| `edm-storm-overflow-spill-hours` | `defra-sewage-hours` | `SOURCES` entry `defra-sewage-hours`; CKAN package `19f6064d-7356-466f-844e-d20ea10ae9fd`; zip -> workbook -> sum duration column | 500000-6000000 hours | https://egly443.github.io/Govviz/data/series/defra-sewage-hours.json |
| `bathing-water-quality` | `defra-bathing-water` | `SOURCES` entry `defra-bathing-water`; ENV17 workbook parser; `Class_Summary` England row | 40-100 percent | https://egly443.github.io/Govviz/data/series/defra-bathing-water.json |
| `nhs-rtt-incomplete-within-18-weeks` | `rtt-18-week` | `rttFileList` -> `rttParseProvider` -> `parseRtt` -> `rttData().pctPts` | 40-100 percent | https://egly443.github.io/Govviz/data/series/rtt-18-week.json |
| `nhs-rtt-incomplete-total` | `waiting-list` | `rttFileList` -> `rttParseProvider` -> `parseRtt` -> `rttData().totalPts`; scaled to millions | 1-12 millions | https://egly443.github.io/Govviz/data/series/waiting-list.json |
| `nhs-workforce-turnover` | `turnover` | `SOURCES` entry `turnover`; Digital NHS/data.gov.uk source blocked to automated clients in prior fetch evidence | No guard in case file | https://egly443.github.io/Govviz/data/series/turnover.json |
| `homelessness-temporary-accommodation` | `mhclg-temp-accommodation` | `SOURCES` entry `mhclg-temp-accommodation`; MHCLG homelessness live tables TA1 sheet; quarter/year carry-forward | 30000-250000 households | https://egly443.github.io/Govviz/data/series/mhclg-temp-accommodation.json |
| `house-price-to-earnings-median` | `mhclg-affordability` | `SOURCES` entry `mhclg-affordability`; `onsLandingXlsx`; Contents-sheet disambiguation for median ratio | 3-15 ratio | https://egly443.github.io/Govviz/data/series/mhclg-affordability.json |
| `net-additional-dwellings` | `mhclg-net-dwellings` | `SOURCES` entry `mhclg-net-dwellings`; Live Table 120; transposed financial-year columns | 80000-400000 dwellings | https://egly443.github.io/Govviz/data/series/mhclg-net-dwellings.json |
| `nhs-ae-four-hour-performance` | `ae-performance` | `SOURCES` entry `ae-performance`; NHS England A&E landing-page discovery for random-suffix workbook | 40-100 percent | https://egly443.github.io/Govviz/data/series/ae-performance.json |
| `hmrc-average-speed-of-answer` | `hmrc-call-wait` | `hmrcCallWaitEditions` -> `hmrcParseAsa` -> `hmrcFindAsaInSheet` -> `hmrcCallWait` | 1-40 minutes | https://egly443.github.io/Govviz/data/series/hmrc-call-wait.json |
| `ons-cdid-timeseries` | `hmt-cost-of-living` | `ons(...)` CDID time-series helper; positive control | No guard in case file | https://egly443.github.io/Govviz/data/series/hmt-cost-of-living.json |
| `world-bank-indicator` | `life-expectancy` | `wb(...)` World Bank indicator helper; positive control | No guard in case file | https://egly443.github.io/Govviz/data/series/life-expectancy.json |

## Priority Evidence Links

- [Storm-overflow spill hours](./evidence/edm-storm-overflow-spill-hours.md)
- [NHS RTT 18-week performance](./evidence/nhs-rtt-incomplete-within-18-weeks.md)
- [Temporary accommodation](./evidence/homelessness-temporary-accommodation.md)
- [House-price-to-earnings median ratio](./evidence/house-price-to-earnings-median.md)
- [HMRC average speed of answer](./evidence/hmrc-average-speed-of-answer.md)
