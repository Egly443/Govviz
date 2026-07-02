# Policy Watch

Govviz cites live UK data and AI policy. Before major essay or conformance
revisions, refresh the policy position instead of assuming that an earlier
snapshot is still current.

## Automated check

Run:

```bash
npm run check-policy-references
```

The script checks the volatile policy references named in the recommendations:
National Data Library progress, AI-ready data guidance, ODI NDL-lite, ODI
enterprise data framework, the Data Ethics Framework, and the Algorithmic
Transparency Recording Standard hub.

The default mode is informational. It prints HTTP status plus available
`last-modified`/`etag` metadata and does not fail CI. Use strict mode locally
when you want a failing exit code for unreachable references:

```bash
npm run check-policy-references -- --strict
```

## Manual review

For an essay or public-submission update:

1. Run the checker and save any changed metadata in the PR notes.
2. Open each changed or unreachable page in a browser.
3. Confirm the newest publication date, guidance title, and owning body.
4. Update citations only from the current official or producer page.
5. If a policy page has moved, update `scripts/check-policy-references.mjs`.

## Data health history

The open-data build writes `dist/data/health-history.json`. Each entry records
the build timestamp, pipeline commit, total series, observation coverage,
valid-range coverage, freshness buckets, and per-series source/hash/freshness
warnings.

GitHub Pages is static, so CI seeds the next build from the currently deployed
`/data/health-history.json` before appending the new snapshot. Locally, pass a
previous file explicitly when you want to preserve history:

```bash
GOVVIZ_HEALTH_HISTORY_IN=old-health-history.json npm run build
```

The MCP `get_data_health` tool returns the current catalogue summary plus the
latest health-history entries.
