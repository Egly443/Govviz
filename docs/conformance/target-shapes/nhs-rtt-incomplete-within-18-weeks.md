# Target Shape: NHS RTT 18-Week Performance

Case id: `nhs-rtt-incomplete-within-18-weeks`  
Series id: `rtt-18-week`  
Producer route: NHS England / DHSC

## Record Fields

```json
{
  "id": "https://producer.example/data/series/rtt-18-week.json",
  "title": "Incomplete RTT pathways within 18 weeks, England",
  "unit": "percent",
  "geography": "E92000001",
  "periodicity": "P1M",
  "latest": "https://producer.example/data/series/rtt-18-week/data.csv",
  "provenance": {
    "source": "RTT waiting times",
    "methodology": "https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/",
    "derivation": "National incomplete pathways within 18 weeks divided by total incomplete pathways"
  },
  "validRange": { "min": 40, "max": 100, "unit": "percent" }
}
```

## CSV Shape

```csv
period,value,unit,unit_multiplier,status
2026-05,58.9,percent,0,provisional
```

The conformant output is the national monthly series; consumers should not need
to aggregate provider files to obtain it.

Worked Govviz example:
https://egly443.github.io/Govviz/data/series/rtt-18-week.json
