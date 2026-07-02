# Target Shape: Storm-Overflow Spill Hours

Case id: `edm-storm-overflow-spill-hours`  
Series id: `defra-sewage-hours`  
Producer route: Defra / Environment Agency

## Record Fields

```json
{
  "id": "https://producer.example/data/series/defra-sewage-hours.json",
  "title": "Storm-overflow spill hours, England",
  "unit": "hours",
  "geography": "E92000001",
  "periodicity": "P1Y",
  "latest": "https://producer.example/data/series/defra-sewage-hours/data.csv",
  "provenance": {
    "source": "EDM Storm Overflows Annual Returns",
    "methodology": "https://www.gov.uk/government/statistics/storm-overflow-spill-data",
    "derivation": "National total of Total Duration (hours)"
  },
  "validRange": { "min": 500000, "max": 6000000, "unit": "hours" }
}
```

## CSV Shape

```csv
period,value,unit,unit_multiplier,status
2024-12-31,3600000,hours,0,final
```

Suppressed values should use a non-numeric blank `value` plus a machine-readable
`status`; public national totals are expected to be publishable without
suppression.

Worked Govviz example:
https://egly443.github.io/Govviz/data/series/defra-sewage-hours.json
