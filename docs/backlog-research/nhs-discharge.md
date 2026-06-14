# NHS Discharge Delays — CI Fetcher Research

## Chart definition

- **File**: `src/components/data.ts` lines 246–282
- **Series id**: `discharge-delays`
- **Title**: "Hospital discharge bottleneck"
- **Subtitle**: "Beds/day occupied by patients medically fit for discharge"
- **Unit**: `beds`
- **Format**: `fmtBeds` → `${(v / 1000).toFixed(1)}k beds/day`
- **goodDirection**: `down`
- **cadence**: `monthly`
- **Illustrative range**: ~2,500 (Covid dip, 2020) to ~13,900 (peak, 2023) — values in raw beds/day (not thousands)
- **Currently NOT wrapped in `realPoints()`** — needs `realPoints("discharge-delays", trajectory(...))` to activate

## Source: NHS England Discharge Delays (Acute)

### Primary data page
`https://www.england.nhs.uk/statistics/statistical-work-areas/discharge-delays-acute-data/`

Also supplemented by the Acute Discharge Situation Report page:
`https://www.england.nhs.uk/statistics/statistical-work-areas/discharge-delays/acute-discharge-situation-report/`

Data starts April 2022 (NCtR metric introduced).

### File format

Two types of published CSV files, both linked from the data pages:

**A) Cumulative timeseries file** (on the main discharge-delays-acute-data page):
- Filename pattern: `Daily-discharge-sitrep-timeseries-data-webfile-April2021-*.csv`
- Contains multiple months at national level
- Covers Apr 2021 through ~Oct 2024 (last seen range)

**B) Monthly per-provider files** (on both pages):
- Filename pattern: `Daily-discharge-sitrep-monthly-data-*.csv`
- One file per reporting month, provider-level rows
- Each file covers 1 month, all acute trusts
- Recent examples:
  - `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2026/04/Daily-discharge-sitrep-monthly-data-webfile-8-CSV-nov25.csv` (Nov 2025)
  - `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2025/08/Daily-discharge-sitrep-monthly-data-CSV-webfile-July2025.csv` (Jul 2025)
  - `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2025/07/Daily-discharge-sitrep-monthly-data-CSV-webfile-June2025.csv` (Jun 2025)
  - `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2024/12/Daily-discharge-sitrep-monthly-data-CSV-webfile-November2024.csv` (Nov 2024)
  - `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2024/11/Daily-discharge-sitrep-monthly-data-webfile-September-2024.csv` (Sep 2024)
  - `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2024/10/Daily-discharge-sitrep-monthly-data-webfile-August2024-revised.csv` (Aug 2024)
  - `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2024/10/Daily-discharge-sitrep-monthly-data-webfile-July2024.csv` (Jul 2024)
  - `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2024/05/Daily-discharge-sitrep-monthly-data-webfile-CSV-April2024.csv` (Apr 2024)

URL structure: `https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/YYYY/MM/Daily-discharge-sitrep-*.csv`
(upload YYYY/MM is the month the file was uploaded to the website, NOT the data month)

### Metric

**No Criteria to Reside (NCtR)** patients — daily average count across England. This is the measure of patients medically fit for discharge but remaining in hospital. Equates to "beds/day occupied by patients medically fit for discharge."

Note: Methodology changed 27 May 2024 — data pre/post may not be fully comparable, but the fetcher should handle both periods.

### Column names (expected, from technical docs + search results)

The CSV column names are not fully confirmed from web search alone. The fetcher will:
1. Log all column headers on first run
2. Use flexible matching to find date and NCtR columns
3. Filter for "England" or national aggregate rows, or sum all provider rows

Expected column patterns (case-insensitive regex matching):
- Date: `date`, `month`, `period`, `reporting_period`, `reporting_date`
- NCtR (patients with no criteria to reside): `nctr`, `no_criteria`, `not_criteria`, `average.*patient`, `patients.*nctr`
- Provider filter: `code` or `org` column = "England" or "National" or sum all rows

## min/max/scale for SOURCES entry

- `min`: 2000 (low end; Covid dip ~2,500 real)
- `max`: 16000 (peak; real values around ~13,000–14,000)
- `scale`: none (values already in raw beds/day count)

## Wiring needed in data.ts

In `src/components/data.ts` line 258, change:
```ts
  points: trajectory(
```
to:
```ts
  points: realPoints(
    "discharge-delays",
    trajectory(
```
and close with an extra `)` after the last argument.

Full change:
```ts
export const dischargeDelays: TrendSeries = {
  // ...
  points: realPoints(
    "discharge-delays",
    trajectory(
      [
        ["2011-01-01", 4200],
        // ...
        ["2026-04-01", 12100],
      ],
      "2011-01-01",
      "2026-04-01",
      29,
      320,
      420,
    ),
  ),
```

## Fetcher code (final)

```js
// NHS England Discharge delays (Acute): average daily patients with No Criteria
// to Reside (NCtR) — medically fit for discharge but remaining in acute hospital.
// Two complementary data sources on the same domain:
//   1. discharge-delays-acute-data/ — cumulative timeseries CSV (2021–2024)
//   2. acute-discharge-situation-report/ — monthly per-provider CSVs (2024+)
// Strategy: scrape both pages for all CSV links, pick timeseries for history,
// then concatenate recent monthly files for coverage beyond the timeseries end.
{
  id: "discharge-delays",
  min: 2000,
  max: 16000,
  get: async () => {
    // --- Step 1: Collect all CSV URLs from both pages ---
    const pages = [
      "https://www.england.nhs.uk/statistics/statistical-work-areas/discharge-delays-acute-data/",
      "https://www.england.nhs.uk/statistics/statistical-work-areas/discharge-delays/acute-discharge-situation-report/",
    ];
    const timeseriesUrls = [];
    const monthlyUrls = [];
    for (const pageUrl of pages) {
      try {
        const res = await fetch(pageUrl, fetchOpts({ accept: "text/html,*/*" }));
        if (!res.ok) { console.log(`discharge-delays: page ${pageUrl} → HTTP ${res.status}`); continue; }
        const html = await res.text();
        for (const m of html.matchAll(/href="([^"]*Daily-discharge-sitrep[^"]*\.csv[^"]*)"/gi)) {
          const url = m[1].startsWith("http") ? m[1] : `https://www.england.nhs.uk${m[1]}`;
          if (/timeseries/i.test(url)) timeseriesUrls.push(url);
          else monthlyUrls.push(url);
        }
      } catch (e) { console.log(`discharge-delays: page fetch error ${e.message}`); }
    }
    console.log(`discharge-delays: timeseries=${timeseriesUrls.length} monthly=${monthlyUrls.length}`);
    if (!timeseriesUrls.length && !monthlyUrls.length)
      throw new Error("discharge-delays: no CSV URLs found on either page");

    // --- Step 2: Parse helper — extract national NCtR total from a CSV ---
    // Each CSV has rows per provider (or per day per provider). We look for:
    //   a) A row with "England" or "National" in an org/code column
    //   b) OR sum NCtR values across all provider rows for the month
    // The NCtR column name varies; log headers on failure.
    const parseCsv = async (url) => {
      const res = await fetch(url, fetchOpts({ accept: "text/csv,*/*" }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) return [];
      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim().replace(/[\s\-\/]+/g, "_"));
      console.log(`  discharge-delays CSV: ${lines.length} rows, cols: ${headers.slice(0, 20).join("|")}`);

      // Identify key columns
      const dateCol = headers.findIndex(h =>
        h === "date" || h === "month" || h === "period" || h.includes("reporting_period") || h.includes("reporting_date") || h.startsWith("month_")
      );
      // NCtR patients column: "average daily NCtR patients", "total NCtR patients", etc.
      const nctrCol = headers.findIndex(h =>
        h.includes("nctr") || (h.includes("no") && h.includes("criteria")) ||
        (h.includes("not") && h.includes("criteria")) ||
        (h.includes("criteria") && h.includes("reside"))
      );
      // Provider/org column to filter for England national row
      const orgCol = headers.findIndex(h =>
        h === "code" || h === "org_code" || h === "provider_code" || h === "organisation_code" ||
        h === "name" || h === "org_name" || h === "provider_name" || h === "organisation_name" ||
        h.includes("trust_code") || h.includes("trust_name")
      );

      if (dateCol < 0 || nctrCol < 0) {
        console.log(`  discharge-delays: dateCol=${dateCol} nctrCol=${nctrCol}; first 3 rows:`);
        for (const l of lines.slice(0, 4)) console.log(`    ${l.slice(0, 200)}`);
        return []; // skip this file; not a fatal error
      }

      const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      const toDate = (raw) => {
        const s = String(raw ?? "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7) + "-01";
        let m;
        if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)))
          return `${m[3]}-${m[2].padStart(2, "0")}-01`;
        if ((m = s.match(/^([A-Za-z]{3,})[_\- ](\d{4})$/)) && MON[m[1].toLowerCase().slice(0, 3)])
          return `${m[2]}-${String(MON[m[1].toLowerCase().slice(0, 3)]).padStart(2, "0")}-01`;
        if ((m = s.match(/^([A-Za-z]{3,})[_\- ](\d{2})$/)) && MON[m[1].toLowerCase().slice(0, 3)]) {
          const yr = +m[2] <= 30 ? 2000 + +m[2] : 1900 + +m[2];
          return `${yr}-${String(MON[m[1].toLowerCase().slice(0, 3)]).padStart(2, "0")}-01`;
        }
        // Excel serial
        if (/^\d{5}$/.test(s)) {
          const d = new Date((+s - 25569) * 86400000);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
        }
        return null;
      };

      // Two modes:
      //   A) Timeseries CSV: one row per month at national level → look for national row
      //   B) Monthly CSV: multiple provider rows for one month → sum all
      // Detect mode by checking if we see an "England" or "National" row
      const byDate = new Map();
      let sumMode = false;

      for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line);
        if (!cells.length || !cells[dateCol]) continue;
        const date = toDate(cells[dateCol]);
        if (!date) continue;
        const rawV = cells[nctrCol];
        const v = typeof rawV === "number" ? rawV : parseFloat(String(rawV ?? "").replace(/,/g, ""));
        if (!Number.isFinite(v) || v < 0) continue;

        // Check if this is a "national" row
        const org = orgCol >= 0 ? String(cells[orgCol] ?? "").trim().toLowerCase() : "";
        const isNational = /^england$|^national$|^e92|^xha|^all$/.test(org);

        if (isNational) {
          // Trust the national row directly
          byDate.set(date, v);
        } else {
          // Sum-mode: accumulate across providers
          sumMode = true;
          byDate.set(date, (byDate.get(date) ?? 0) + v);
        }
      }

      return [...byDate.entries()]
        .map(([date, value]) => ({ date, value: Math.round(value) }))
        .filter(p => p.value > 0);
    };

    // --- Step 3: Parse timeseries file(s) first ---
    const allPoints = new Map();
    // Use the LAST timeseries URL (most up-to-date)
    if (timeseriesUrls.length) {
      const tsUrl = timeseriesUrls[timeseriesUrls.length - 1];
      console.log(`discharge-delays: parsing timeseries ${tsUrl}`);
      try {
        const pts = await parseCsv(tsUrl);
        for (const p of pts) allPoints.set(p.date, p.value);
        console.log(`  timeseries: ${pts.length} points`);
      } catch (e) { console.log(`  timeseries parse error: ${e.message}`); }
    }

    // --- Step 4: Supplement with recent monthly CSVs ---
    // Parse up to 24 monthly files (cover ~2 years of recent data)
    // Sort descending so we process newest first, stop when we have >24 months already covered
    const sortedMonthly = [...new Set(monthlyUrls)].reverse().slice(0, 30);
    for (const url of sortedMonthly) {
      try {
        const pts = await parseCsv(url);
        let added = 0;
        for (const p of pts) {
          if (!allPoints.has(p.date)) { allPoints.set(p.date, p.value); added++; }
        }
        if (added > 0) console.log(`  monthly ${url.split("/").pop()}: +${added} new pts`);
      } catch (e) { console.log(`  monthly parse err ${url.split("/").pop()}: ${e.message}`); }
    }

    const points = [...allPoints.entries()]
      .map(([date, value]) => ({ date, value }))
      .filter(p => p.value >= 500) // sanity: plausible NCtR count (not a per-trust fragment)
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    if (points.length < 6)
      throw new Error(`discharge-delays: only ${points.length} usable points after combining sources`);
    console.log(`discharge-delays: ${points.length} total points ${points[0].date}..${points[points.length - 1].date}`);
    return points;
  },
},
```

## Confidence

**Medium** — the data definitely exists in the right format on the right pages, and the
page-scraping approach is proven (works for A&E and RTT). Key uncertainties:

1. **Column names** — not confirmed from web search; the fetcher logs headers on failure so CI will reveal them if wrong
2. **Monthly CSV structure** — whether each file has one row per provider (need to sum) or one "England" row (pick directly); the fetcher handles both
3. **Methodology break 2024** — data definition changed 27 May 2024; the series will still chart but with a note-worthy discontinuity
4. **Timeseries file existence at runtime** — if the timeseries CSV was removed, the fetcher falls back to monthly files

## Wiring checklist

- [ ] Add SOURCES entry to `scripts/build-data.mjs` (code above)
- [ ] Wrap `dischargeDelays.points` in `realPoints("discharge-delays", trajectory(...))` in `src/components/data.ts`
- [ ] The `data.ts` series also lacks `realPoints()` — without this wrapper the chart ignores CI data even if baked

## References

- NHS England Discharge delays (Acute): https://www.england.nhs.uk/statistics/statistical-work-areas/discharge-delays-acute-data/
- Acute discharge situation report: https://www.england.nhs.uk/statistics/statistical-work-areas/discharge-delays/acute-discharge-situation-report/
- Technical specification: https://www.england.nhs.uk/long-read/acute-discharge-situation-report-technical-specification/
- Example CSV (Nov 2025): https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2026/04/Daily-discharge-sitrep-monthly-data-webfile-8-CSV-nov25.csv
- Example CSV (Jul 2025): https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2025/08/Daily-discharge-sitrep-monthly-data-CSV-webfile-July2025.csv
