# House-Price-To-Earnings Median Ratio

Case id: `house-price-to-earnings-median`  
Series id: `mhclg-affordability`  
Producer: MHCLG / ONS  
Last verified: 2026-07-02

## Source

ONS ratio of house price to workplace-based earnings, lower quartile and median:
https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian

## Failure Mode

The workbook contains both median and lower-quartile measures. Both produce
plausible values within the sanity range, so a parser can silently choose the
wrong tab unless it reads the human-language Contents sheet and anchors the
target measure.

## Pass Criteria

- Publish median and lower-quartile ratios as distinct machine-readable series.
- Include a machine-readable definition that disambiguates the measures.
- Include unit, geography, method, and provenance in-band.

## Govviz Record

- Record: https://egly443.github.io/Govviz/data/series/mhclg-affordability.json
- CSV: https://egly443.github.io/Govviz/data/series/mhclg-affordability/data.csv
- CSVW: https://egly443.github.io/Govviz/data/series/mhclg-affordability/data.csv-metadata.json

## Parser Pointer

See `docs/source-map.md` entry `house-price-to-earnings-median`. The parser path
is the `mhclg-affordability` source block in `scripts/build-data.mjs`, including
the Contents-sheet disambiguation step.
