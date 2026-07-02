# Target Shape: Temporary Accommodation

Case id: `homelessness-temporary-accommodation`  
Series id: `mhclg-temp-accommodation`  
Producer route: MHCLG

## Record Fields

```json
{
  "id": "https://producer.example/data/series/mhclg-temp-accommodation.json",
  "title": "Households in temporary accommodation, England",
  "unit": "households",
  "geography": "E92000001",
  "periodicity": "P3M",
  "latest": "https://producer.example/data/series/mhclg-temp-accommodation/data.csv",
  "provenance": {
    "source": "Statutory homelessness live tables, TA1",
    "methodology": "https://www.gov.uk/government/statistical-data-sets/live-tables-on-homelessness",
    "derivation": "England households in temporary accommodation at quarter end"
  },
  "validRange": { "min": 30000, "max": 250000, "unit": "households" }
}
```

## CSV Shape

```csv
period,value,unit,unit_multiplier,status
2026-Q1,126000,households,0,provisional
```

The quarter and year must be explicit in each row; no carry-forward inference
from spreadsheet layout should be required.

Worked Govviz example:
https://egly443.github.io/Govviz/data/series/mhclg-temp-accommodation.json
