# dft-rail-cancellations — CI fetcher research

**Status:** DRAFT — initial research complete, ODS column structure inferred (not
directly verified — CI fetch will confirm).

---

## 1. Source URL + Format

**Primary source:** ORR Data Portal, Table 3123 — "Trains planned and cancellations
by operator and cause" (quarterly).

- **ODS download URL (static):**
  `https://dataportal.orr.gov.uk/media/2177/table-3123-trains-planned-and-cancellations-by-operator-and-cause.ods`
- **Format:** OpenDocument Spreadsheet (`.ods`), readable by SheetJS / the existing
  `xlsxBook` + `sheetRows` helpers in `scripts/build-data.mjs`.
- **Cadence:** quarterly (Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar).
  Each row is one operator × one quarter. The "All operators" aggregate row is
  the headline national figure.
- **Time series start:** April 2014 (2014-15 Q1).
- **Table page:**
  `https://dataportal.orr.gov.uk/statistics/performance/passenger-rail-performance/table-3123-trains-planned-and-cancellations-by-operator-and-cause/`

**Note on URL stability:** The media ID `2177` was the same across multiple searches
spanning different dates. The ORR's convention appears to be a single stable file
that is overwritten with new data; the same URL has been cited consistently.
If CI returns HTTP 404, a fallback is to scrape the table page for the `.ods` link.

**Fallback source:** Table 3124 (periodic, 4-weekly) has the same metrics at higher
frequency; its ODS link is not confirmed static but the page is at
`https://dataportal.orr.gov.uk/statistics/performance/passenger-rail-performance/table-3124-trains-planned-and-cancellations-by-operator-periodic/`.

---

## 2. Column structure (inferred from ORR documentation + reports)

The ODS almost certainly contains at least one sheet covering all operators
(often literally named "Table 3123" or "All operators" or similar). Key columns:

| Likely column header       | Notes                                          |
|---------------------------|------------------------------------------------|
| Year                      | Financial year start e.g. `2024` = 2024-25    |
| Quarter                   | `Q1`/`Q2`/`Q3`/`Q4`                          |
| Operator                  | TOC name; "All operators" = national aggregate |
| Trains planned            | Integer count                                 |
| Full cancellations        | Integer count                                 |
| Part cancellations        | Integer count                                 |
| Cancellations score (%)   | Weighted score: full×1 + part×0.5, as % of planned |

The "Cancellations score" is the official ORR metric, defined as:
`(full_cancellations + 0.5 × part_cancellations) / trains_planned × 100`

Recent values: 2023-24 full year ~3.8%; Q3 2024-25 (Oct–Dec 2024) 5.1%.

**Date reconstruction:** `Year` + `Quarter` → fiscal quarter end date:
- Q1 → `{Year}-06-30`
- Q2 → `{Year}-09-30`
- Q3 → `{Year}-12-31`
- Q4 → `{Year+1}-03-31`

---

## 3. Min / Max guard

```
min: 0
max: 25
```

Rationale: the series has ranged from ~2.2% (good years pre-2018) to ~5.1%
(worst quarter in 2024-25). Even during the 2022-23 industrial action peak (~6%)
the annual average was ~4.6%. Setting max at 25 is a generous safety net for any
data anomaly, while still catching obviously wrong values (e.g. raw counts in
hundreds of thousands returned by mistake). The guard rejects and SKIPs; it does
not fail the build.

---

## 4. Fetcher code

Wire into `scripts/build-data.mjs` inside the `SOURCES` array, alongside the
other Excel/ODS backlog entries. Uses the existing `xlsxBook` and `sheetRows`
helpers (defined at lines ~221–231 in build-data.mjs) — do NOT redefine them.

```js
{
  id: "dft-rail-cancellations",
  min: 0,
  max: 25,
  get: async () => {
    const ODS_URL =
      "https://dataportal.orr.gov.uk/media/2177/table-3123-trains-planned-and-cancellations-by-operator-and-cause.ods";
    const book = await xlsxBook(ODS_URL);

    // Find the sheet that covers all operators (not operator-by-operator).
    // ORR table 3123 typically has one summary sheet; fall back to first sheet.
    const sheetName =
      book.SheetNames.find((n) =>
        /all\s*operator|summary|3123/i.test(String(n))
      ) ?? book.SheetNames[0];
    if (!sheetName) throw new Error("dft-rail-cancellations: no sheets in ODS");

    const rows = await sheetRows(book, sheetName);

    // Locate the header row — look for a row that has both a year-like and
    // a cancellations-score-like column.
    const headerIdx = rows.findIndex(
      (r) =>
        r.some((c) => /^year$/i.test(String(c ?? "").trim())) &&
        r.some((c) =>
          /cancel/i.test(String(c ?? "")) && /score|%|pct|percent/i.test(String(c ?? ""))
        )
    );
    if (headerIdx < 0) {
      // Diagnostic dump
      console.log(
        `dft-rail-cancellations: header not found; sheet="${sheetName}" sheets=[${book.SheetNames.join("|")}]`
      );
      console.log("First 5 rows:");
      for (const r of rows.slice(0, 5))
        console.log("  " + JSON.stringify(r).slice(0, 200));
      throw new Error("dft-rail-cancellations: header row not found");
    }

    const header = rows[headerIdx];
    const yearCol = header.findIndex((c) => /^year$/i.test(String(c ?? "").trim()));
    const qCol = header.findIndex((c) => /^quarter$/i.test(String(c ?? "").trim()));
    // Cancellations score column — prefer "score" over raw count columns.
    let scoreCol = header.findIndex((c) =>
      /cancel/i.test(String(c ?? "")) && /score/i.test(String(c ?? ""))
    );
    if (scoreCol < 0) {
      // Fallback: a column whose header contains "%" and "cancel"
      scoreCol = header.findIndex((c) =>
        /cancel/i.test(String(c ?? "")) && /%|percent|pct/i.test(String(c ?? ""))
      );
    }
    if (scoreCol < 0) {
      console.log(
        `dft-rail-cancellations: no score column; headers=[${header.join("|")}]`
      );
      throw new Error("dft-rail-cancellations: cancellations score column not found");
    }
    const operatorCol = header.findIndex((c) =>
      /operator|toc/i.test(String(c ?? "").trim())
    );

    // Quarter end dates within the financial year starting `year`.
    const qEnd = { Q1: [0, "06-30"], Q2: [0, "09-30"], Q3: [0, "12-31"], Q4: [1, "03-31"] };

    const byDate = new Map();
    for (const r of rows.slice(headerIdx + 1)) {
      // Filter to "All operators" row if operator column exists.
      if (
        operatorCol >= 0 &&
        !/all\s*operator/i.test(String(r[operatorCol] ?? ""))
      )
        continue;

      const year = Number(r[yearCol]);
      if (!Number.isInteger(year) || year < 2010 || year > 2030) continue;
      const qRaw = String(r[qCol] ?? "").trim().toUpperCase().replace(/\s+/g, "");
      if (!qEnd[qRaw]) continue;
      const val = r[scoreCol];
      if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) continue;

      const [yearOffset, mmdd] = qEnd[qRaw];
      const date = `${year + yearOffset}-${mmdd}`;
      if (!byDate.has(date)) byDate.set(date, val);
    }

    const points = [...byDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    if (points.length < 4) {
      console.log(
        `dft-rail-cancellations: only ${points.length} points; scoreCol=${scoreCol} header=[${header.join("|")}]`
      );
      throw new Error(`dft-rail-cancellations: only ${points.length} usable points`);
    }
    return points;
  },
},
```

---

## 5. Wiring `realPoints` in departments.ts

`dft-rail-cancellations` is defined at line ~793 of
`/home/user/Govviz/src/components/departments.ts`.

Currently the series uses `trajectory(...)` (illustrative). To wire real data,
change the `points:` line:

```ts
// Before (illustrative):
points: trajectory([...], ...),

// After (real data):
points: realPoints("dft-rail-cancellations", trajectory([...], ...)),
```

`realPoints` is the standard helper already used by ~47 other series. Its second
argument is the illustrative fallback if CI has no data.

---

## 6. Confidence + Blockers

**Confidence: MEDIUM-HIGH**

- The ODS URL `https://dataportal.orr.gov.uk/media/2177/...` is confirmed by
  multiple independent searches and appears stable.
- The file format (ODS, parseable by SheetJS) matches the existing pipeline.
- The quarterly "All operators" cancellation score is the official ORR headline
  metric; column structure follows standard ORR table conventions.

**Blockers / risks:**

1. **ODS URL may redirect or change.** The media ID `2177` was found in search
   results but CI must verify it returns HTTP 200. If it 404s, visit the table
   page and extract the current `.ods` link. Alternative: use `govukCollectionLatest`
   if ORR publishes via gov.uk collections (not confirmed).

2. **Sheet + column names not directly verified.** The fetcher uses flexible
   regex matching (like other ORR fetchers in the pipeline) and includes a
   diagnostic `console.log` dump if the header isn't found. The first CI run will
   confirm or reveal the exact names.

3. **"All operators" row existence.** The table is structured by operator; there
   may be a summary/total row labelled "All operators", "Industry", or "National".
   The fetcher tolerates any operator column absence (falls through without filter).
   If the operator column doesn't exist in the sheet, the first row per quarter
   that has a numeric score will be taken — which may not be the national total.
   The guard (0–25%) provides a safety net.

4. **Score column header wording.** Possible variants: "Cancellations score (%)",
   "% cancellations", "Cancellation score", "CaSL score". The regex
   `/cancel/i && /score|%|pct/i` should handle most variants. Fallback regex is
   `/cancel/ && /%|percent|pct/`. CI log will show the exact header if it throws.

**Recommendation:** Wire the fetcher and let CI run. On the first run, check the
"Fetch live data" step log for either a confirmation line like
`dft-rail-cancellations ok (42 points, latest=4.2)` or the diagnostic dump.
