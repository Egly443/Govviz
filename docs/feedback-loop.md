# AI Data Feedback Loop

Govviz needs a visible route for data users and agents to report failures that a
human dashboard might miss: wrong values, stale sources, ambiguous definitions,
bad units, geography mismatches, missing series, and machine-consumption
failures.

Use the structured GitHub issue template:
[`data-quality.yml`](../.github/ISSUE_TEMPLATE/data-quality.yml).

## What To Report

| Failure type | Example | Required evidence |
|---|---|---|
| Wrong value | Latest CSV value disagrees with the named official source. | Series id, record URL, source URL, observed value, expected value. |
| Stale source | Govviz still shows an older release after the producer published a new one. | Series id, upstream release URL, release date, fetched date. |
| Unclear definition | The record description does not distinguish similar measures. | Ambiguous wording and the competing interpretation. |
| Missing series | A high-value accountability series has no Govviz record. | Producer, source URL, why it matters, likely periodicity. |
| Bad unit | Percent, percentage point, pounds, index, or multiplier is wrong. | Record URL, CSV row, source table reference. |
| Bad geography | UK, GB, England, local authority, or department coverage is wrong. | Geography in source and geography in Govviz. |
| Agent failure | A script or model cannot discover, fetch, parse, or validate the record. | Tool/model, request URL, error text, expected contract. |

## Triage Loop

1. **Issue opened.** Reporter supplies the structured fields. If an agent opened
   the issue, it must include the exact URL it fetched and the failure mode.
2. **Scope check.** Maintainer labels the issue as `compiler`, `upstream-source`,
   `profile`, `conformance`, or `documentation`.
3. **Source verification.** Compare the Govviz record and CSV against the
   primary official source. Do not use secondary commentary as the deciding
   source for numeric corrections.
4. **Fix route.**
   - Parser or metadata bug: fix the Govviz source mapping and profile output.
   - Upstream ambiguity: document the limitation and link to the primary
     producer contact or public issue.
   - Missing reusable pattern: add or update a conformance case so the failure is
     reusable by producers and assurance reviewers.
5. **Validation.** Re-run the narrowest available data check for the affected
   series, then the open-data conformance check if build files changed.
6. **Close with evidence.** The closing comment should link to the changed file,
   the source checked, and the validation command/result.

## Labels

Recommended issue labels:

- `data-quality`
- `wrong-value`
- `stale-source`
- `definition`
- `missing-series`
- `unit`
- `geography`
- `agent-consumption`
- `upstream-source`
- `conformance`

## Maintainer Rules

- Do not patch a value manually when the source fetcher can be corrected.
- Do not infer a missing official statistic from a related table unless the
  record clearly marks it as a Govviz derivation.
- Do not lower trust/governance expectations to make a dataset easier to parse.
- If the same failure appears in more than one source, add a conformance case or
  producer-guide note rather than handling it as a one-off.

