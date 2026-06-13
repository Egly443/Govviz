# NHS A&E 4-hour Performance — CI Fetcher Research

**Series:** `aePerformance`  
**Target:** % of A&E attendances admitted, transferred or discharged within 4 hours (all A&E types), England, monthly.  
**Date researched:** 2026-06-13

---

## 1. Source URL, Format, Zipped?

**Primary source:** NHS England "Monthly A&E Time Series" XLS  
**Publisher page:** https://www.england.nhs.uk/statistics/statistical-work-areas/ae-waiting-times-and-activity/

**Example file URL (February 2026):**
```
https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2026/03/Monthly-AE-Time-Series-February-2026-D36ah6.xls
```

- **Format:** `.xls` (legacy Excel binary, ~430–434 KB)
- **Zipped?** NO — direct XLS download, no zip
- **Is URL stable?** NO — the URL has a random slug suffix (e.g. `D36ah6`) that changes each monthly release, and the upload year/month path component changes too

**Stable discovery path (gov.uk Search API):**  
Each monthly release is also published on gov.uk at a stable-ish slug:
- `government/statistics/ae-attendances-and-emergency-admissions-for-april-2026`
- `government/statistics/ae-attendances-and-emergency-admissions-for-march-2026-and-quarterly-report-q4`

The gov.uk Content API exposes attachments for each publication page. The most recent can be found via `govukLatest()` (search API), then `govukAttachments()` returns the XLS URL.

**However**, the gov.uk statistics pages are for the *single-month* provider-level file, NOT the cumulative "Monthly A&E Time Series" file. The cumulative timeseries XLS (which covers all months from April 2010 onwards) is linked from the NHS England year-specific pages (e.g. `ae-attendances-and-emergency-admissions-2025-26`), NOT from gov.uk.

**Better approach — NHS England main statistics page HTML scrape:**  
The main statistics page at `https://www.england.nhs.uk/statistics/statistical-work-areas/ae-waiting-times-and-activity/ae-attendances-and-emergency-admissions-2025-26/` always links the current-year timeseries file. The fetcher can:
1. Fetch the HTML of the current-year annual statistics page
2. Extract the href matching `/Monthly-AE-Time-Series-/` (regex on HTML)
3. Fetch and parse that XLS

**Alternative stable approach — gov.uk Search API for the timeseries:**  
The gov.uk Search API (`https://www.gov.uk/api/search.json?q=...`) can find the latest monthly A&E publication page; each individual monthly page on gov.uk has the *monthly provider file* as an attachment, but NOT the cumulative timeseries. The cumulative timeseries is only on england.nhs.uk.

**Recommended implementation:** Scrape the current-year NHS England page HTML to find the Monthly-AE-Time-Series XLS URL dynamically.

---

## 2. File Structure (inferred from published commentary + naming conventions)

The "Monthly A&E Time Series" XLS contains a cumulative time series from April 2010 onwards. Based on NHS England published commentaries and the pattern used in their statistical releases:

**Likely sheet structure:**
- Sheet: `England` or `National` — national aggregate monthly rows
- Columns (approximate; actual order needs verification from file):
  - Column A or B: Period (e.g. `Apr-10`, `May-10`, …, `Feb-26`) — date in `MMM-YY` format
  - Columns for Total attendances (all types), Type 1, Type 2, Type 3/4
  - A column for "% in 4 hours" or "Percentage in 4 hours" (all A&E types combined)
  - The 4-hour metric for "all A&E types" is what `aePerformance` tracks

**Recent values (from published commentaries):**
- April 2026: ~70.4% (emergency admissions 525,660 vs April 2025)
- Monthly values in 2023–2025 range ~70–75%
- Pre-2015 values were ~94–97%
- Covid-affected months (2020-21) dipped to ~70s

---

## 3. Min / Max Guard

```
min: 50   // lowest plausible (worst recorded ~60% in 2022-23 winter)
max: 100  // upper bound (was 98%+ in 2012)
```

Historical range: ~60% (winter 2022-23 crisis) to ~98.6% (2012-13 peak).  
Recent (2024-26): ~70–75%.

---

## 4. Fetcher Code

```js
// --- NHS England: A&E 4-hour performance (Monthly Time Series XLS) ---
// Source: NHS England A&E Attendances and Emergency Admissions
// URL: https://www.england.nhs.uk/statistics/statistical-work-areas/ae-waiting-times-and-activity/
// The "Monthly A&E Time Series" XLS is published alongside each monthly release.
// Its URL has a random suffix — we discover it by scraping the current-year
// NHS England annual stats page HTML for the link matching /Monthly-AE-Time-Series/.
{
  id: "aePerformance",
  min: 50,
  max: 100,
  get: async () => {
    // Step 1: Find the URL of the Monthly A&E Time Series XLS.
    // Try current FY year page first, then prior year as fallback.
    const now = new Date();
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // FY starts Apr
    const fyNext = fy + 1;
    const baseUrl = "https://www.england.nhs.uk/statistics/statistical-work-areas/ae-waiting-times-and-activity";
    const pages = [
      `${baseUrl}/ae-attendances-and-emergency-admissions-${fy}-${String(fyNext).slice(2)}/`,
      `${baseUrl}/ae-attendances-and-emergency-admissions-${fy - 1}-${String(fy).slice(2)}/`,
    ];

    let xlsUrl = null;
    for (const pageUrl of pages) {
      try {
        const res = await fetch(pageUrl, fetchOpts({ accept: "text/html,*/*" }));
        if (!res.ok) continue;
        const html = await res.text();
        // Match href containing Monthly-AE-Time-Series and ending in .xls or .xlsx
        const m = html.match(/href="(https?:\/\/[^"]*Monthly-AE-Time-Series[^"]*\.xlsx?[^"]*)"/i);
        if (m) { xlsUrl = m[1]; break; }
        // Also try relative href
        const m2 = html.match(/href="(\/[^"]*Monthly-AE-Time-Series[^"]*\.xlsx?[^"]*)"/i);
        if (m2) { xlsUrl = `https://www.england.nhs.uk${m2[1]}`; break; }
      } catch (_) { /* try next */ }
    }
    if (!xlsUrl) {
      console.log("aePerformance: could not find Monthly-AE-Time-Series XLS URL in NHS England page HTML");
      throw new Error("aePerformance: no timeseries XLS URL found");
    }
    console.log(`  aePerformance: fetching ${xlsUrl}`);

    // Step 2: Download and parse the XLS.
    const book = await xlsxBook(xlsUrl);
    console.log(`  aePerformance: sheets=[${book.SheetNames.join("|")}]`);

    // Step 3: Find the national aggregate sheet.
    // Typical sheet names: "England", "National", or the first non-cover sheet.
    const NATIONAL_NAMES = ["england", "national", "all england", "aggregate"];
    let sheetName = book.SheetNames.find(
      (n) => NATIONAL_NAMES.includes(n.trim().toLowerCase())
    );
    if (!sheetName) {
      // Fallback: pick the first sheet that isn't a cover/notes sheet
      sheetName = book.SheetNames.find(
        (n) => !/cover|note|content|index|key/i.test(n)
      ) ?? book.SheetNames[0];
    }
    const rows = await sheetRows(book, sheetName);
    console.log(`  aePerformance: using sheet "${sheetName}", ${rows.length} rows`);
    if (!rows.length) throw new Error(`aePerformance: sheet "${sheetName}" is empty`);

    // Step 4: Find the header row and locate the date column + "% in 4 hours" column.
    // The header row typically contains "Period" and "%" or "4 hour" keywords.
    let headerIdx = -1;
    let dateCol = -1;
    let pctCol = -1;
    const PCT_PATTERNS = [
      /percentage.*4\s*hour/i,
      /% .*4\s*hour/i,
      /4\s*hour.*percentage/i,
      /4\s*hour.*%/i,
      /within 4/i,
      /attend.*%/i,
    ];
    const DATE_PATTERNS = [/period/i, /month/i, /date/i];

    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const hasDateCol = row.findIndex((c) =>
        DATE_PATTERNS.some((p) => p.test(String(c ?? "")))
      );
      const hasPctCol = row.findIndex((c) =>
        PCT_PATTERNS.some((p) => p.test(String(c ?? "")))
      );
      if (hasDateCol >= 0 && hasPctCol >= 0) {
        headerIdx = i;
        dateCol = hasDateCol;
        pctCol = hasPctCol;
        break;
      }
      // Also accept a row that has a pct column even without a labelled date column —
      // date may be the first non-empty cell (unlabelled).
      if (hasPctCol >= 0 && i > 0) {
        headerIdx = i;
        pctCol = hasPctCol;
        dateCol = 0; // assume first column is the period
        break;
      }
    }

    if (headerIdx < 0 || pctCol < 0) {
      // Diagnostics: print first few row previews and bail.
      const preview = rows.slice(0, 8).map((r) =>
        (Array.isArray(r) ? r : []).slice(0, 8).join(" | ")
      ).join("\n    ");
      console.log(`  aePerformance: could not find 4-hour % column. Sheet="${sheetName}" first rows:\n    ${preview}`);
      throw new Error("aePerformance: header/pct column not found — see diagnostics above");
    }
    console.log(`  aePerformance: headerRow=${headerIdx} dateCol=${dateCol} pctCol=${pctCol}`);

    // Step 5: Parse data rows.
    // Dates appear as "Apr-10" or "Apr 2010" or an Excel date serial number.
    const MONTH_MAP = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    function parseAEDate(raw) {
      const s = String(raw ?? "").trim();
      // "Apr-10" or "Apr 2010" or "April 2010"
      const m1 = s.match(/^([A-Za-z]{3,})[- ](\d{2,4})$/);
      if (m1) {
        const mon = MONTH_MAP[m1[1].toLowerCase().slice(0, 3)];
        if (!mon) return null;
        let yr = parseInt(m1[2], 10);
        if (yr < 100) yr += yr >= 90 ? 1900 : 2000;
        return `${yr}-${String(mon).padStart(2, "0")}-01`;
      }
      // "2010-04-01" ISO
      const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m2) return s;
      // Excel date serial (number of days since 1900-01-01; Excel epoch is 1900-01-00)
      if (typeof raw === "number" && raw > 30000 && raw < 60000) {
        // Convert Excel serial to JS Date
        const d = new Date(Math.round((raw - 25569) * 86400000));
        const yr = d.getUTCFullYear();
        const mo = d.getUTCMonth() + 1;
        return `${yr}-${String(mo).padStart(2, "0")}-01`;
      }
      return null;
    }

    const points = [];
    const seen = new Set();
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const rawDate = row[dateCol];
      const rawPct = row[pctCol];
      if (rawDate == null || rawPct == null) continue;
      const date = parseAEDate(rawDate);
      if (!date) continue;
      // Value may be 0–1 (fraction) or 0–100 (percent) — normalise to 0–100
      let value = typeof rawPct === "number" ? rawPct : parseFloat(String(rawPct).replace(/[%,]/g, ""));
      if (!Number.isFinite(value)) continue;
      if (value <= 1.5) value = +(value * 100).toFixed(2); // fraction → percent
      if (value < 50 || value > 100) continue; // sanity-filter outliers
      if (seen.has(date)) continue;
      seen.add(date);
      points.push({ date, value: +value.toFixed(2) });
    }

    if (points.length < 12) {
      console.log(`  aePerformance: only ${points.length} usable points — too few`);
      throw new Error(`aePerformance: insufficient data (${points.length} points)`);
    }
    return points.sort((a, b) => (a.date < b.date ? -1 : 1));
  },
},
```

---

## 5. Wiring `aePerformance` in data.ts

In `/home/user/Govviz/src/components/data.ts`, the `aePerformance` series currently uses a `trajectory(...)` fallback. Change `points:` to:

```ts
points: realPoints("aePerformance", trajectory([
  ["2004-04-01", 78.0],
  ["2005-01-01", 95.0],
  ["2010-06-01", 98.2],
  ["2013-01-01", 95.7],
  ["2015-06-01", 92.3],
  ["2019-12-01", 79.8],
  // ... keep existing trajectory points as the fallback
])),
```

The series `id` in data.ts is `"ae-performance"` (with hyphen), but the `realPoints` key must match what's in SOURCES — use `"aePerformance"` (camelCase) to match the SOURCES entry above, or align the id. **Note:** check what key `realPoints` is called with vs. what `id` is set to in SOURCES — they must match. The series `id: "ae-performance"` is the chart/URL id; the realPoints first arg is the SOURCES `id` field. These should be kept consistent.

Recommended: use `id: "dhsc-ae-performance"` in SOURCES (prefixed for namespace consistency with other DHSC series), and wire `realPoints("dhsc-ae-performance", fallbackPts)` in data.ts.

---

## 6. Confidence and Blockers

**Confidence: HIGH (for data existence) / MEDIUM (for exact column names)**

**What we know for certain:**
- The "Monthly A&E Time Series" XLS is published every month by NHS England alongside the monthly statistical release
- It is NOT zipped — direct XLS download
- The file URL has a random suffix (not stable), but is discoverable by scraping the current-year annual page HTML
- NHS England keeps the current-year annual page at a stable URL pattern: `.../ae-attendances-and-emergency-admissions-{FY}-{FY+1}/`
- The file covers April 2010 to present with monthly national totals + 4-hour % performance

**Blockers / Uncertainties:**
1. **Exact column headers not verified** — the fetcher uses fuzzy column matching (regex on headers) to find the "% in 4 hours" column. If the header text differs from expected patterns, the diagnostic log will show first rows and the fetcher will throw (SKIP).
2. **Sheet name unknown** — uses a priority list of likely names (`England`, `National`). The fallback picks the first non-cover sheet.
3. **Value encoding** — unclear if the percentage is stored as 0.7 (fraction) or 70.0 (percent). The fetcher normalises both.
4. **Date format** — could be "Apr-10", "Apr 2010", "April 2010", or an Excel date serial. All four cases are handled.
5. **Annual page URL may change** — if NHS England restructures their site, the current-year page discovery breaks. Fallback tries prior FY year page too.

**Alternative if HTML scraping fails:**
- Hard-code the known February 2026 URL `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2026/03/Monthly-AE-Time-Series-February-2026-D36ah6.xls` as a temporary bootstrap (will only work until the next release overwrites it; the file accumulates all months so it still has the full time series even when stale)

**Sources confirmed by WebSearch:**
- [Monthly A&E Time Series February 2026 (XLS, 432KB)](https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2026/03/Monthly-AE-Time-Series-February-2026-D36ah6.xls)
- [NHS England A&E Statistics main page](https://www.england.nhs.uk/statistics/statistical-work-areas/ae-waiting-times-and-activity/)
- [2025-26 annual statistics page](https://www.england.nhs.uk/statistics/statistical-work-areas/ae-waiting-times-and-activity/ae-attendances-and-emergency-admissions-2025-26/)
