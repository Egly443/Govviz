# Unblock `defra-bathing-water` via the EA Bathing Water Quality API

A ready-to-run **data task** for a new session, outer (CI) reward tier — same
shape as `data-waiting-list.md`. Goal: move `defra-bathing-water` from
`status: "blocked"` (see `CLAUDE.md` and `docs/conformance/test-cases.json`,
case `bathing-water-quality`) to `ok`.

## Why this is worth trying now

The existing fetcher in `scripts/build-data.mjs` (`id: "defra-bathing-water"`,
~line 861) only tries gov.uk `government/statistics/bathing-water-quality-statistics`
editions, which are PDF/HTML — it throws `"bathing: no data file in editions"`.
`CLAUDE.md` additionally asserts "the EA Bathing Water Data Explorer API is on
the same 403-prone `environment.data.gov.uk` host" as the rate-limited EDM
sewage endpoint, and treats that as a reason not to try it.

That assumption was never tested against this specific API. The EA's **Bathing
Water Quality API** is a distinct, documented service:
- Landing page: `https://environment.data.gov.uk/bwq/` (data + API links)
- API reference: `https://environment.data.gov.uk/bwq/doc/api-reference-v0.6.html`
  — supports JSON, XML, **CSV**, and Turtle output formats
- Catalogue entry: `https://www.api.gov.uk/ea/bathing-water/`

It is plausible this is a *different* endpoint/rate-limit policy than the EDM
file-download API that's been observed 403-ing (`environment.data.gov.uk/api/file/download`
for storm-overflow zips). It needs an actual CI fetch to find out — don't
re-assert the blocker from priors, test it.

## The series

- **id:** `defra-bathing-water` (Defra/EA). % of designated bathing waters in
  England classified Good or Excellent, annual.
- **Current fetcher:** `scripts/build-data.mjs` `id: "defra-bathing-water"`
  (~line 858-914) — gov.uk editions scrape, currently fails.
- **Guard:** `min: 40, max: 100` (percent) — already correct, keep it.
- **Conformance case:** `docs/conformance/test-cases.json` →
  `bathing-water-quality` (update `current.M` and `failure_modes` once this
  lands or is conclusively re-tested and still fails).

## Inner-loop Done (structural — verifiable in-sandbox)

- The `defra-bathing-water` `get()` tries the EA `bwq` API first (e.g. a
  classification-results endpoint scoped to England, summed/derived to %
  Good-or-Excellent per year), falling back to the existing gov.uk-editions
  scrape if the API call fails or is empty.
- `node tools/loop/eval.mjs --series=defra-bathing-water --allow=scripts/build-data.mjs --skip-build`
  → PASS (manifest + typecheck). This cannot prove the fetch works — no
  internet in-sandbox — only that it's structurally wired.

## Outer-loop Done (real reward)

1. Push the branch → `data-check.yml` runs the fetcher against the live EA API.
2. Pull the "Fetch live data" log via `mcp__github__get_job_logs`, pipe to
   `node tools/loop/ci-reward.mjs --series=defra-bathing-water` → exit 0 (`ok`)
   with a plausible value in `[40, 100]`.
3. If it lands: freeze via `node tools/loop/ci-reward.mjs --freeze --log=fetch.log`,
   update `docs/conformance/test-cases.json` (`bathing-water-quality.current.M`
   and drop the stale `failure_modes`), and correct the `defra-bathing-water`
   line in `CLAUDE.md`'s blocker table.
4. If it's *also* 403/rate-limited: that confirms the existing assumption —
   log the finding in a new `docs/backlog-research/defra-bathing-water.md`
   (same pattern as `nhs-rtt.md`) so the next attempt doesn't re-test it blind,
   and leave the conformance case as `blocked` (don't claim a fix that didn't
   land).

## Iterate

The exact shape of the EA API response (endpoint path, query params for
England + a given year, field names for classification) is unknown until a
diagnostic CI run reveals it — add `console.log` of the raw response/status
code, push, read the log, refine. Start with the CSV output format (simplest
to parse without an XML/JSON schema lookup) per the API reference doc.
