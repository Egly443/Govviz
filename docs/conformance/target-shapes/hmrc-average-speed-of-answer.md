# Target Shape: HMRC Average Speed Of Answer

Case id: `hmrc-average-speed-of-answer`  
Series id: `hmrc-call-wait`  
Producer route: HMRC

## Record Fields

```json
{
  "id": "https://producer.example/data/series/hmrc-call-wait.json",
  "title": "HMRC average speed of answer",
  "unit": "minutes",
  "geography": "K02000001",
  "periodicity": "P1M",
  "latest": "https://producer.example/data/series/hmrc-call-wait/data.csv",
  "provenance": {
    "source": "HMRC monthly performance reports",
    "methodology": "https://www.gov.uk/government/collections/hmrc-monthly-performance-reports",
    "derivation": "Average adviser answer wait expressed as decimal minutes"
  },
  "validRange": { "min": 1, "max": 40, "unit": "minutes" }
}
```

## CSV Shape

```csv
period,value,unit,unit_multiplier,status
2026-05,22.6,minutes,0,provisional
```

The value must be a declared numeric duration. Spreadsheet display formats such
as `mm:ss` should not be the semantic source of truth.

Worked Govviz example:
https://egly443.github.io/Govviz/data/series/hmrc-call-wait.json
