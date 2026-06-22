# NHS RTT Waiting Times — Research Notes

**Series:** `waitingList` (id `waiting-list`) and `rtt18Week` (id `rtt-18-week`) in
`src/components/data.ts`.

**Status:** ✅ DONE (2026-06-22) — both series fetch `ok` in CI and are frozen.

## FINAL APPROACH (what actually shipped)
The national "Overview Timeseries" file is **gone** — a CI inventory of the RTT
year/landing pages (198 files) found only stale archives (`...to-Dec-2014...`,
`Annual-Report-2019-20-timeseries...`). The live data is only the per-month,
per-provider `Incomplete-Provider-MmmYY` workbooks (~9 MB each; 24 months listed,
2024-04..2026-03). `scripts/build-data.mjs` `parseRtt()` therefore:
1. scrapes the year/landing pages for every `Incomplete-Provider-*.xlsx`, dedups by
   month, takes the newest `RTT_MONTHS` (default 18);
2. for each workbook sums the **"Provider"** (NHS) + **"IS Provider"**
   (independent-sector) sheets — header row 10, treatment-function name col 4, "Total
   number of incomplete pathways" col 110, "Total within 18 weeks" col 111 — over the
   rows whose treatment function is `Total` (one per provider; excludes the
   `with DTA` alternative-measure sheets, which are not additive);
3. `waiting-list` = Σ total; `rtt-18-week` = Σ within18 / Σ total × 100.

Latest Mar-2026 = **7.01M** list / **65.3%** within 18 weeks — consistent with NHS's
published 7.4M (late-2025, falling) and the 65%-by-Mar-2026 interim target.

**Gotchas that cost CI rounds:** (a) `sheet_to_json(header:1)` returns *sparse*
arrays; `.map()` preserves the holes so header predicates crashed on `undefined` —
build dense rows with `Array.from` first. (b) These files have **no** "unknown clock
start" column, so the list size is simply col 110 (handled: the unknown term is 0).
(c) Each monthly download is wrapped resilient so one timeout drops a month, not the
series. The original draft below (assuming a single national overview file) is kept
for history but is **superseded**.

---
**Original draft (superseded — national overview file no longer published):**

---

## 1. Source URL + Format

**Primary file:** "RTT Overview Timeseries Including Estimates for Missing Trusts"

- Format: `.xlsx` (SheetJS-readable via `xlsxBook`)
- Zipped? **No** — single `.xlsx`, directly downloadable
- Confirmed example URL (July 2024 data, published Sept 2024):
  ```
  https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2024/09/RTT-Overview-Timeseries-Including-Estimates-for-Missing-Trusts-Jul24-XLS-109K-88372.xlsx
  ```
- Landing page (updated monthly, lists the current file):
  ```
  https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/
  ```
- Year-specific pages (contain per-month breakdowns AND the overview timeseries link):
  - 2024-25: `https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/rtt-data-2024-25/`
  - 2025-26: `https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/rtt-data-2025-26/`

**Why this file is best:**
- Contains the full national monthly time series back to ~2007 in one file
- Includes estimates for non-reporting trusts (making it the headline England total)
- This is the exact series used by NHS England's own Statistical Press Notices (e.g. "7.3 million pathways at end of Nov 2025")
- Used by Gooroo / analysts as the authoritative source
- Non-zipped .xlsx — directly fetchable by `xlsxBook(url)`

**URL pattern instability:** The filename hash changes each month (the `88372` suffix
and date prefix `Jul24` move). The stable approach is to:
1. Fetch the landing page HTML and regex-extract the current overview timeseries URL, OR
2. Use the gov.uk Content API / collection to find the attachment, OR
3. Hard-code the most recent known URL as a fallback and use the landing page as primary

**Recommended fetch strategy:** Parse the HTML of
`https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/`
to find the href matching `RTT-Overview-Timeseries-Including-Estimates`.

---

## 2. File Structure (expected based on NHS England documentation)

The overview timeseries XLSX contains one sheet (likely named "Overview" or similar)
with rows representing each month. Expected columns (exact headers TBC from actual file):

| Column (approx) | Content |
|---|---|
| A: Period / Date | Month label e.g. "April 2007" or a date serial |
| B or C: Total incomplete pathways | Raw count — this is `waitingList` value |
| D or E: Within 18 weeks (count) | Patients waiting ≤18 weeks |
| E or F: % within 18 weeks | Percentage — this is `rtt18Week` value |

Known headline values for validation:
- Nov 2025: 7.3 million total incomplete pathways
- The 18-week standard is 92%; England has been below this since ~2012 (except 2015-2019)

---

## 3. Guard min/max

| Series | id in data.ts | Min | Max | Unit |
|---|---|---|---|---|
| `waitingList` | `waiting-list` | 1,000,000 | 10,000,000 | raw count |
| `rtt18Week` | `rtt-18-week` | 40 | 100 | percent |

---

## 4. `realPoints` wiring needed in `src/components/data.ts`

Both series currently use illustrative `trajectory(...)` for their `points` field.
To go live, wrap each:

```ts
// waitingList
points: realPoints("waiting-list", trajectory(...)),

// rtt18Week
points: realPoints("rtt-18-week", trajectory(...)),
```

---

## 5. Fetcher Code

Add these two entries to the `SOURCES` array in `scripts/build-data.mjs`.

**Approach:** Fetch the RTT landing page HTML, regex for the overview timeseries
XLSX href, then parse with `xlsxBook`/`sheetRows`. The file has one row per month;
col 0 = period label, and we scan for the "total" (waiting list size) and "within 18
weeks %" columns by searching for keyword patterns in the header row.

```js
// ============================================================
// NHS England RTT — "RTT Overview Timeseries Including Estimates for Missing Trusts"
// Non-zipped XLSX published monthly at:
//   https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/
// The file contains the full national monthly history with estimates for non-reporters.
// ============================================================

// Helper: fetch RTT landing page HTML and find the overview timeseries XLSX URL.
async function rttOverviewUrl() {
  const landingUrl = "https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/";
  const res = await fetch(landingUrl, fetchOpts({ accept: "text/html,*/*" }));
  if (!res.ok) throw new Error(`RTT landing page → HTTP ${res.status}`);
  const html = await res.text();
  // The href contains "RTT-Overview-Timeseries" (case-insensitive in filenames).
  const m = html.match(/href="(https?:\/\/[^"]*RTT-Overview-Timeseries[^"]*\.xlsx[^"]*)"/i)
    || html.match(/href="([^"]*RTT-Overview-Timeseries[^"]*\.xlsx[^"]*)"/i);
  if (!m) {
    // Log the surrounding HTML context for debugging
    const idx = html.toLowerCase().indexOf("rtt-overview-timeseries");
    if (idx >= 0) console.log("RTT: found text but no href; context:", html.slice(Math.max(0, idx - 200), idx + 200));
    throw new Error("RTT overview timeseries XLSX href not found on landing page");
  }
  return m[1].startsWith("http") ? m[1] : `https://www.england.nhs.uk${m[1]}`;
}

// Helper: parse the RTT overview timeseries workbook.
// Returns { totalPts, pctPts } where totalPts = waitingList and pctPts = rtt18Week.
async function parseRttOverview() {
  const url = await rttOverviewUrl();
  console.log(`  RTT overview XLSX: ${url}`);
  const book = await xlsxBook(url);

  // Find the sheet — typically "Overview" or the first sheet
  const sheetName = book.SheetNames.find((n) =>
    /overview/i.test(n) || /incomplete/i.test(n) || /timeseries/i.test(n)
  ) ?? book.SheetNames[0];
  console.log(`  RTT: using sheet "${sheetName}" (all: [${book.SheetNames.join("|")}])`);
  const rows = await sheetRows(book, sheetName);

  // Find the header row: should contain a date/period column + columns with
  // "total" (or "total number") and "%" or "within 18" labels.
  // Typically the first few rows are title/notes, then a header row.
  let headerIdx = -1;
  let dateCol = -1;
  let totalCol = -1;
  let pctCol = -1;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i].map((c) => String(c ?? "").toLowerCase().trim());
    // Header row usually has "period" or "month" or a date-like label in col 0
    // and numeric/keyword labels in subsequent columns
    const hasPeriod = r[0].includes("period") || r[0].includes("month") || r[0].includes("date");
    const hasTotal = r.some((c) => c.includes("total") || c.includes("incomplete pathways"));
    const hasPct = r.some((c) => c.includes("%") || c.includes("percent") || c.includes("within 18"));
    if (hasPeriod || (hasTotal && hasPct)) {
      headerIdx = i;
      dateCol = 0; // Period is always col 0
      // Find total column
      totalCol = r.findIndex((c) =>
        (c.includes("total") && (c.includes("number") || c.includes("incomplete") || c === "total")) ||
        c === "total incomplete pathways"
      );
      if (totalCol < 0) totalCol = r.findIndex((c) => c.includes("total") || c.includes("incomplete"));
      // Find % within 18 weeks column
      pctCol = r.findIndex((c) =>
        c.includes("within 18") || (c.includes("%") && c.includes("18")) ||
        (c.includes("percent") && c.includes("18"))
      );
      if (pctCol < 0) pctCol = r.findIndex((c) => c.includes("%") || c.includes("percent"));
      break;
    }
  }

  if (headerIdx < 0) {
    // Surface first few rows for debugging
    console.log(`RTT: no header found; first 8 rows:`);
    for (const r of rows.slice(0, 8)) console.log(`   ${JSON.stringify(r).slice(0, 200)}`);
    throw new Error("RTT overview: could not identify header row");
  }

  const header = rows[headerIdx].map((c) => String(c ?? "").trim());
  console.log(`  RTT: headerIdx=${headerIdx}, dateCol=${dateCol}, totalCol=${totalCol}, pctCol=${pctCol}`);
  console.log(`  RTT: header=[${header.join("|")}]`);

  if (totalCol < 0 || pctCol < 0) {
    throw new Error(`RTT overview: totalCol=${totalCol} pctCol=${pctCol} in [${header.join("|")}]`);
  }

  // Parse the data rows
  // Period column is a string like "April 2007" or "Aug-24" or an Excel date serial.
  const totalPts = [];
  const pctPts = [];

  for (const r of rows.slice(headerIdx + 1)) {
    // Parse the date from col 0
    let date = null;
    const raw = r[dateCol];
    if (raw == null) continue;

    if (typeof raw === "number" && raw > 30000 && raw < 60000) {
      // Excel date serial — convert to JS date
      // Excel epoch is 1900-01-01 (with leap-year bug: serial 60 = 1900-03-01)
      const msec = (raw - 25569) * 86400000; // 25569 = days from 1900-01-01 to 1970-01-01
      const d = new Date(msec);
      date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    } else {
      const s = String(raw).trim();
      // "April 2007", "March 2025", "Sep 2022", etc.
      const m1 = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
      if (m1) {
        const mon = { january:1, february:2, march:3, april:4, may:5, june:6,
                      july:7, august:8, september:9, october:10, november:11, december:12,
                      jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
        const mo = mon[m1[1].toLowerCase()];
        if (mo) date = `${m1[2]}-${String(mo).padStart(2, "0")}-01`;
      }
      // "Aug-24", "Mar-25" etc.
      const m2 = s.match(/^([A-Za-z]{3})-(\d{2})$/);
      if (!date && m2) {
        const mon = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
        const mo = mon[m2[1].toLowerCase()];
        const yr = 2000 + Number(m2[2]);
        if (mo && yr >= 2000 && yr <= 2035) date = `${yr}-${String(mo).padStart(2, "0")}-01`;
      }
    }
    if (!date) continue;

    const totalRaw = r[totalCol];
    const pctRaw = r[pctCol];

    if (typeof totalRaw === "number" && Number.isFinite(totalRaw) && totalRaw > 0) {
      totalPts.push({ date, value: Math.round(totalRaw) });
    }
    if (typeof pctRaw === "number" && Number.isFinite(pctRaw) && pctRaw > 0) {
      // May be expressed as 0–1 (fraction) or 0–100 (percent)
      const pct = pctRaw > 1 ? pctRaw : pctRaw * 100;
      pctPts.push({ date, value: +pct.toFixed(1) });
    }
  }

  if (!totalPts.length || !pctPts.length) {
    console.log(`RTT: totalPts=${totalPts.length} pctPts=${pctPts.length}; header=[${header.join("|")}]`);
    throw new Error(`RTT overview: extracted totalPts=${totalPts.length}, pctPts=${pctPts.length}`);
  }

  totalPts.sort((a, b) => (a.date < b.date ? -1 : 1));
  pctPts.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { totalPts, pctPts };
}

// Cached parse result so both fetchers share one HTTP request + parse.
let _rttCache = null;
async function rttData() {
  if (!_rttCache) _rttCache = parseRttOverview();
  return _rttCache;
}

// SOURCES entries:
{
  id: "waiting-list",
  min: 1_000_000,
  max: 10_000_000,
  get: async () => {
    const { totalPts } = await rttData();
    return totalPts;
  },
},
{
  id: "rtt-18-week",
  min: 40,
  max: 100,
  get: async () => {
    const { pctPts } = await rttData();
    return pctPts;
  },
},
```

---

## 6. Column Identification Notes

The RTT Overview Timeseries XLSX structure (based on NHS England documentation and
third-party analysis such as Gooroo's blog):

- Row 1: title / metadata
- Row 2–4: possibly blank or description
- Row ~5+: header row with column names
- Data rows: one per month from ~April 2007 onwards

Expected column names (may vary slightly by year of file):
- "Period" or "Month" → col A
- "Total number of incomplete pathways" → the waiting list count
- "Number within 18 weeks" → patients within target
- "Percentage within 18 weeks" → the % metric

The fetcher uses fuzzy matching on these to be robust to minor header changes.

**Important:** The total waiting list count (~7+ million in 2023-25) far exceeds 1 as
a raw number, so it will never be expressed as a fraction. The % column may be either
0–100 (most likely) or 0–1 — the fetcher handles both.

---

## 7. Confidence + Blockers

**Confidence: HIGH**

- The file is confirmed to exist at the Jul24 URL (found in search results)
- NHS England publishes this monthly and references it in their Statistical Press Notices
- It is a directly-fetchable `.xlsx` with no zip wrapper
- The landing page is stable; the filename hash is the only instability

**Blockers:**
1. **Column name verification:** The exact header row content and column indices are
   not confirmed without downloading the actual file (blocked in sandbox). The fetcher
   uses fuzzy matching and logs diagnostics on failure, so the first CI run will either
   succeed or emit the header names needed to refine.
2. **Landing page scrape vs direct URL:** If NHS England's landing page renders its
   download links via JavaScript (not plain HTML), the `href` regex won't find the URL.
   Mitigation: also try the year-specific page
   (`rtt-data-2025-26/` or `rtt-data-2024-25/`) as a fallback URL source.
3. **Sheet name:** Could be "Overview", "Incomplete", "National", or similar — the
   fetcher tries several patterns then falls back to sheet 0.

**Fallback URL (hardcoded):** If the landing-page scrape fails, use:
```
https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2024/09/RTT-Overview-Timeseries-Including-Estimates-for-Missing-Trusts-Jul24-XLS-109K-88372.xlsx
```
This is the Jul24 edition (published Sept 2024). A hardcoded fallback means CI always
gets *some* real data even if the landing-page scrape fails, albeit potentially stale.

---

## 8. Integration Steps

1. Add `rttOverviewUrl()`, `parseRttOverview()`, and `rttData()` helpers to
   `scripts/build-data.mjs` (before the `SOURCES` array).
2. Add two entries to `SOURCES` (id `"waiting-list"` and `"rtt-18-week"`).
3. In `src/components/data.ts`, wrap both series `points` fields:
   - `waitingList.points`: change `trajectory(...)` → `realPoints("waiting-list", trajectory(...))`
   - `rtt18Week.points`: change `trajectory(...)` → `realPoints("rtt-18-week", trajectory(...))`
4. Push to `main` → CI fetches, bakes, deploys.

## UPDATE (CI-verified 2026-06-15) — no national file; needs heavy aggregation
CI probe of the RTT 2025-26 page shows ONLY split monthly XLSX per organisation:
`Incomplete-Provider-MarYY` (9 MB), `Incomplete-Commissioner`, Admitted/NonAdmitted/
New-Periods (Commissioner & Provider). There is **no national-totals or overview
timeseries file** anymore, and `data.england.nhs.uk` CKAN `package_search` → HTTP 404.
To land `waiting-list` + `rtt-18-week` you must download the per-provider Incomplete
file each month and SUM across all providers × RTT week-bands (0-1…18+), then derive
total incomplete pathways and % within 18 weeks. Heavy (multi-MB × many months) and
multi-round; deferred.
