# Access Policy

Govviz data products are intended to be usable by people, scripts, crawlers, and
agents without a registration step. The machine-readable policy is
[`access-policy.json`](./access-policy.json).

## Default Class

Govviz's own published records and CSV distributions use
`open-public-aggregate`:

- no login, API key, or click-through gate;
- no personal data and no restricted microdata;
- aggregate official-source values only;
- inherited open licence terms, normally OGL v3 or CC BY 4.0;
- same-origin static files suitable for automated retrieval;
- CORS is allowed where the host supports it;
- automated use is allowed when clients cache sensibly, respect HTTP behaviour,
  and do not imply endorsement.

This is intentionally narrower than "all public sector data". Govviz is a
downstream compiler of open aggregates. It does not create access rights to
controlled research data, operational case data, unpublished management
information, or sensitive microdata.

## Access Classes

| Class | Meaning | Govviz use |
|---|---|---|
| `open-public-aggregate` | Published aggregate statistics available without registration. | Default for Govviz catalogue, metadata records, CSVs, and CSVW. |
| `open-registration-required` | Open aggregate data that needs a free account, API key, token, or click-through. | Used only to describe upstream sources if encountered. |
| `restricted-sensitive` | Sensitive, confidential, personal, or disclosive data requiring controlled access. | Out of scope for Govviz publication. |
| `not-published-by-source` | A desired series or value is not officially published in reusable form. | Used to explain placeholders and conformance gaps. |

## Implementation Contract

When profile generation supports access metadata, each series record should carry
the policy URI and class:

```json
{
  "accessPolicy": "https://egly443.github.io/Govviz/data/access-policy.json",
  "accessClass": "open-public-aggregate"
}
```

Consumers can treat `open-public-aggregate` as permission to fetch and reuse the
data under the named upstream licence. They must still cite the primary producer,
preserve provenance, and check the record-level licence because Govviz inherits
source terms rather than replacing them.

## Operational Expectations

For Govviz maintainers:

- publish stable record URLs and tidy CSV URLs;
- keep provenance, source URL, licence, fetched date, and validation range with
  the data;
- never fill a missing official value with an illustrative estimate;
- route suspected access, licence, or data-quality problems through the
  [feedback loop](./feedback-loop.md).

For automated consumers:

- cache catalogue and series files where practical;
- avoid tight polling loops against GitHub Pages or upstream sources;
- treat `not-published-by-source` as a stop sign, not an invitation to infer an
  official statistic;
- surface uncertainty, revision status, and provenance in downstream analysis.

