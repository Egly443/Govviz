# Target Shape: House-Price-To-Earnings Median Ratio

Case id: `house-price-to-earnings-median`  
Series id: `mhclg-affordability`  
Producer route: ONS / MHCLG

## Record Fields

```json
{
  "id": "https://producer.example/data/series/mhclg-affordability.json",
  "title": "Median house-price-to-earnings ratio, England",
  "description": "Median house price divided by median workplace-based annual earnings",
  "unit": "ratio",
  "geography": "E92000001",
  "periodicity": "P1Y",
  "latest": "https://producer.example/data/series/mhclg-affordability/data.csv",
  "provenance": {
    "source": "ONS ratio of house price to workplace-based earnings",
    "methodology": "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian",
    "derivation": "Median ratio table, not lower-quartile ratio"
  },
  "validRange": { "min": 3, "max": 15, "unit": "ratio" }
}
```

## CSV Shape

```csv
period,value,unit,unit_multiplier,status
2025,8.4,ratio,0,final
```

Median and lower-quartile ratios should be separate series with separate ids and
definitions.

Worked Govviz example:
https://egly443.github.io/Govviz/data/series/mhclg-affordability.json
