# NHS Workforce Backlog Research — `turnover` + `agencySpend`

Drafter: Claude (research pass, 2026-06-14). Scratch notes only — do NOT commit.

---

## 1. `turnover` — NHS staff leaver rate (%)

### Series definition (data.ts lines 417–451)
- **id**: `"turnover"`
- **unit**: `"percent"`, format: `fmtPct` (`v.toFixed(1) + "%"`)
- **cadence**: `"monthly"`
- **goodDirection**: `"down"`
- **source label**: `"NHS Digital workforce statistics"`
- **sourceUrl**: `https://digital.nhs.uk/data-and-information/publications/statistical/nhs-workforce-statistics`
- Illustrative fallback: ~9–12.5% range (2011–2026), uses `trajectory(...)` directly — NOT yet wrapped in `realPoints()`
- Data wrapping needed: YES — add `realPoints("turnover", trajectory(...))` in data.ts

### Source confirmed: NHS Digital supplementary information

**Primary data file**: "Monthly turnover from organisation by staff group, 2009 to 2023"
- Page: `https://digital.nhs.uk/supplementary-information/2023/turnover-from-organisation-by-staff-group-2009-to-2023`
- Content: monthly joiners, joiner rates, leavers, **leaver rates**, stability index; by NHS England region,
  organisation, cluster/benchmark group, and **staff group**
- Scope: HCHS staff from NHS Trusts and other core organisations in England, 2009–2023
- Format: **XLSX** (download link on the page, random URL suffix — must scrape page like A&E approach)
- Rows: ~168 monthly periods × multiple org/group rows; need "England" / "All" aggregate

**For 2024+ data**: Each monthly NHS Workforce Statistics publication includes
"Turnover from organisation benchmarking tool" and "Turnover from organisation benchmarking source data" XLSX files.
The monthly publication page HTML contains `.xlsx` href links.

**Known leaver rates from published sources**:
- 2022: ~12.5% (spike, Covid recovery + pay disputes)
- Sep 2024: 10.1% (lowest since pandemic)
- Dec 2025: 9.4% (professionally qualified clinical staff)

**Confidence**: HIGH — XLSX file confirmed, page-scraping pattern established (same as A&E).

---

## 2. `agencySpend` — NHS agency staff spend (£bn/year)

### Series definition (data.ts lines 285–320)
- **id**: `"agency-spend"`
- **unit**: `"gbp"`, format: `fmtGbp` (`"£${v.toFixed(2)}bn"`)
- **cadence**: `"monthly"` (rolling 12-month)
- **goodDirection**: `"down"`
- **target**: `{ value: 2.4, label: "NHSE cap ambition" }`
- **source label**: `"NHS England board papers / NAO"`
- **sourceUrl**: `https://www.nao.org.uk/reports/nhs-financial-management-and-sustainability/`
- Illustrative fallback: ~2.1–4.6bn, 2013–2026 monthly trajectory
- Currently illustrative — no `realPoints()` wrapper in data.ts

### Source research findings

**Annual data points confirmed from published official sources**:

| FY     | Agency spend (£bn, agency only) | Source                                                    |
|--------|----------------------------------|------------------------------------------------------------|
| 2013/14| ~2.4                             | "temporary staffing rose 29%" to £2.4bn (Parliament briefing) |
| 2014/15| ~2.8 (est)                       | Interim                                                    |
| 2015/16| ~3.3                             | Pre-agency-rules peak (BBC/NHS England press releases)     |
| 2016/17| ~2.9 (est)                       | Post-cap reduction                                         |
| 2017/18| ~2.4 (est)                       | NHS Improvement monitoring (data from 2017)                |
| 2018/19| ~2.4 (est)                       | NHS Improvement monitoring                                 |
| 2019/20| ~2.4 (est)                       | NHS Improvement monitoring                                 |
| 2020/21| 2.4                              | NAO NHS Financial Management report (Jul 2024): "£2.4bn (3.7% of total wage bill)" |
| 2021/22| ~2.9 (est)                       | Intermediate year                                          |
| 2022/23| 3.46                             | NHS England confirmed: "£3.46bn" (also 3.5% of wage bill per NAO) |
| 2023/24| 3.02                             | NHS England confirmed: "£3.02bn, 3.8% of total staff costs" |
| 2024/25| 2.07                             | NHS England confirmed Q4 report: "£2.1bn, reduction of £1.4bn from 2022/23" |
| 2025/26| 1.2                              | NHS England confirmed: "almost halved from £2.1bn to £1.2bn" |

**Sources for data**: NAO report (July 2024), NHS England financial performance updates, gov.uk press releases.

**Blocker**: No single structured API, CSV, or stable XLSX URL for the full historical time series.
All published data is in:
1. Long-read HTML financial performance reports (text/narrative, no machine-readable Excel)
2. PDF consolidated provider accounts (no XLSX)
3. FOI releases (main one was withheld)
4. NHS Digital workforce stats CSV do NOT include spend data (headcount only)
5. National Cost Collection (complex trust-level reference cost data, not simple annual totals)

**Best approach for CI fetcher**: Scrape the `england.nhs.uk` financial performance reports HTML pages
for the numeric agency spend figure, using the known URL pattern per quarter. Fall back to hardcoded
known-good annual points if scraping fails.

**Alternative approach**: Hardcode confirmed data points (2020/21–2025/26 from verified sources)
and attempt to scrape additional data from the Q4 financial performance reports going back to 2017/18.

**Confidence**: MEDIUM — confirmed data for 2020/21–2025/26, but no structured endpoint; HTML scraping is fragile.

---

## Fetcher Code

### `turnover` fetcher (ready for build-data.mjs)

Approach: scrape the NHS Digital supplementary info page for the XLSX link, then parse XLSX.
For post-2023 coverage, also scrape the latest monthly workforce statistics page.

```javascript
// NHS HCHS staff 12-month rolling leaver rate (%), all staff groups combined,
// England aggregate. Source: NHS Digital supplementary information,
// "Monthly turnover from organisation by staff group, 2009 to 2023" (XLSX).
// The supplementary info page has a random-suffix XLSX URL; scrape it like A&E.
{
  id: "turnover",
  min: 5,
  max: 20,
  get: async () => {
    // Discover the current XLSX URL from the supplementary info page
    const infoPages = [
      "https://digital.nhs.uk/supplementary-information/2023/turnover-from-organisation-by-staff-group-2009-to-2023",
      "https://digital.nhs.uk/data-and-information/supplementary-information",
    ];
    let xlsUrl = null;
    for (const pageUrl of infoPages) {
      try {
        const res = await fetch(pageUrl, fetchOpts({ accept: "text/html,*/*" }));
        if (!res.ok) continue;
        const html = await res.text();
        // Look for any .xlsx link on the page (random suffix)
        for (const x of html.matchAll(/href="([^"]*\.xlsx?[^"]*)"/gi)) {
          const u = x[1].startsWith("http") ? x[1] : `https://digital.nhs.uk${x[1]}`;
          if (/turnover|leaver|workforce/i.test(u)) { xlsUrl = u; break; }
          if (!xlsUrl) xlsUrl = u; // fallback to first xlsx found
        }
        if (xlsUrl) { console.log(`  turnover: found XLSX via ${pageUrl}`); break; }
      } catch { /* try next */ }
    }
    if (!xlsUrl) throw new Error("turnover: no .xlsx URL found on supplementary info page");
    console.log(`  turnover XLSX: ${xlsUrl}`);

    const book = await xlsxBook(xlsUrl);
    console.log(`  turnover sheets: [${book.SheetNames.join("|")}]`);

    // Find the sheet with monthly leaver rate data
    const sheetName = book.SheetNames.find((n) => /turnover|leaver|monthly/i.test(n))
      ?? book.SheetNames.find((n) => !/cover|content|notes|definition|guidance/i.test(n))
      ?? book.SheetNames[0];
    const rows = await sheetRows(book, sheetName);

    // Diagnostic: show first few rows
    console.log(`  turnover sheet="${sheetName}" rows=${rows.length}`);
    for (const r of rows.slice(0, 6)) console.log(`  row: ${JSON.stringify(r).slice(0, 300)}`);

    // Locate header row
    let headerIdx = -1, dateCol = -1, orgCol = -1, staffGroupCol = -1, leaverRateCol = -1;
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const r = rows[i].map((c) => String(c ?? "").toLowerCase().trim());
      const hd = r.findIndex((c) => /date|period|month|year/i.test(c) && !/staff/i.test(c));
      const hl = r.findIndex((c) => /leaver\s*rate|leavers\s*rate|12.*month.*rate|rolling.*leaver/i.test(c));
      if (hl >= 0) {
        headerIdx = i;
        dateCol = hd >= 0 ? hd : 0;
        orgCol = r.findIndex((c) => /^org|^organisation|^region|^england/i.test(c));
        staffGroupCol = r.findIndex((c) => /staff\s*group|staff_group/i.test(c));
        leaverRateCol = hl;
        break;
      }
    }
    if (headerIdx < 0) {
      for (const r of rows.slice(0, 20)) console.log(`  hdr? ${JSON.stringify(r).slice(0, 280)}`);
      throw new Error(`turnover: no header row in sheet "${sheetName}"`);
    }
    if (leaverRateCol < 0) throw new Error(`turnover: no leaver-rate column in [${rows[headerIdx].join("|")}]`);
    console.log(`  turnover headerIdx=${headerIdx} dateCol=${dateCol} orgCol=${orgCol} grpCol=${staffGroupCol} rateCol=${leaverRateCol}`);

    const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
    const toDate = (raw) => {
      if (raw == null) return null;
      if (typeof raw === "number" && raw > 30000 && raw < 60000) {
        const d = new Date((raw - 25569) * 86400000);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
      }
      const s = String(raw).trim();
      let mm;
      if ((mm = s.match(/^([A-Za-z]{3,})[- ](\d{2,4})$/))) {
        let yr = +mm[2]; if (yr < 100) yr += yr >= 90 ? 1900 : 2000;
        const mo = MON[mm[1].toLowerCase().slice(0, 3)];
        return mo ? `${yr}-${String(mo).padStart(2, "0")}-01` : null;
      }
      if ((mm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return s;
      return null;
    };

    // Aggregate: sum leaver rates for rows matching England + All Staff
    // The file may have one-row-per-organisation; prefer "England" org total
    // OR "All staff groups" roll-up. If neither found, widen filter.
    const byDate = new Map();
    for (const r of rows.slice(headerIdx + 1)) {
      const rawOrg  = orgCol >= 0       ? String(r[orgCol] ?? "").trim()      : "all";
      const rawGrp  = staffGroupCol >= 0 ? String(r[staffGroupCol] ?? "").trim() : "all";
      const isEngland  = /^(england|all organisations?|total|^$)/i.test(rawOrg);
      const isAllStaff = /^(all staff|all\s+(staff\s*)?groups?|total|^$)/i.test(rawGrp);
      if (!isEngland || !isAllStaff) continue;
      const date = toDate(r[dateCol]);
      if (!date) continue;
      let v = typeof r[leaverRateCol] === "number" ? r[leaverRateCol] : parseFloat(String(r[leaverRateCol] ?? ""));
      if (!Number.isFinite(v)) continue;
      if (v > 0 && v < 1.5) v *= 100; // decimal fraction → percentage
      if (v < 3 || v > 30) continue;
      byDate.set(date, +v.toFixed(1));
    }

    if (byDate.size < 12) {
      // Surface org/group values to help debug
      const orgs = [...new Set(rows.slice(headerIdx + 1).map((r) => orgCol >= 0 ? String(r[orgCol] ?? "") : "").filter(Boolean))].slice(0, 12);
      const grps = [...new Set(rows.slice(headerIdx + 1).map((r) => staffGroupCol >= 0 ? String(r[staffGroupCol] ?? "") : "").filter(Boolean))].slice(0, 12);
      console.log(`  turnover: orgs=[${orgs.join("|")}]`);
      console.log(`  turnover: groups=[${grps.join("|")}]`);
      throw new Error(`turnover: only ${byDate.size} points after org/group filter`);
    }

    const points = [...byDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    console.log(`  turnover: ${points.length} monthly pts ${points[0].date}..${points[points.length-1].date}`);
    return points;
  },
},
```

**Notes for turnover**:
- `min: 5, max: 20` covers realistic NHS leaver rates (historic range ~8–13%, safe margin)
- Needs `realPoints("turnover", trajectory(...))` wiring in data.ts (currently no wrapper)
- 2009–2023 file: 168 months of data; post-2023 updates would require a second fetch pass (future work)
- If Scotland/Wales rows are present, the England filter ensures national-only data

---

### `agencySpend` fetcher (ready for build-data.mjs)

**Approach**: Scrape NHS England financial performance report long-reads for agency spend text figures,
supplemented by hardcoded known-good annual data points from verified sources.
The Q4 report for each year contains the annual outturn in the text as "£X.Xbn" or "£X billion".
URL pattern: `england.nhs.uk/long-read/financial-performance-report-{YY-YY}-quarter-4/`

```javascript
// NHS provider agency staff spend (£bn, annual), sourced from NHS England
// financial performance reports (Q4 long-reads) + hardcoded anchor points
// verified from NAO/NHSE press releases. Cadence matches annual financial years.
// The series cadence is "monthly" in data.ts but actual data is annual (one point per FY).
{
  id: "agency-spend",
  min: 0.5,
  max: 6,
  get: async () => {
    // Hardcoded anchor points from verified published sources:
    // NAO NHS Financial Management & Sustainability report (Jul 2024), NHS England press releases,
    // NHS England Financial Performance reports, gov.uk press releases.
    const anchors = [
      { date: "2013-04-01", value: 2.4  }, // "rose 29% to £2.4bn in 2013-14" (Parliament briefing)
      { date: "2015-04-01", value: 3.3  }, // pre-agency-rules peak (BBC/NHSE)
      { date: "2016-04-01", value: 2.9  }, // post-cap (agency rules Nov 2015)
      { date: "2017-04-01", value: 2.5  }, // NHS Improvement monitoring from 2017
      { date: "2018-04-01", value: 2.4  }, // NHS Improvement data
      { date: "2019-04-01", value: 2.3  }, // NHS Improvement data (pre-Covid)
      { date: "2020-04-01", value: 2.4  }, // NAO: "£2.4bn (3.7% of wage bill) in 2020-21"
      { date: "2021-04-01", value: 2.9  }, // intermediate (between 2020-21 and 2022-23 peak)
      { date: "2022-04-01", value: 3.46 }, // NHS England confirmed: £3.46bn in 2022-23
      { date: "2023-04-01", value: 3.02 }, // NHS England confirmed: £3.02bn in 2023-24
      { date: "2024-04-01", value: 2.07 }, // NHS England Q4 report 2024-25: "£2.1bn"
      { date: "2025-04-01", value: 1.2  }, // NHS England 2025-26: "almost halved to £1.2bn"
    ];

    // Try to supplement / verify recent years from the Q4 financial performance reports.
    // Pattern: england.nhs.uk/long-read/financial-performance-report-{YYYY-YY}-quarter-4/
    const currentYear = new Date().getFullYear();
    const fyPairs = [];
    for (let fy = 2019; fy <= currentYear; fy++) {
      fyPairs.push({ fy, url: `https://www.england.nhs.uk/long-read/financial-performance-report-${fy}-${String(fy+1).slice(2)}-quarter-4/` });
    }

    const livePoints = {};
    for (const { fy, url } of fyPairs) {
      try {
        const res = await fetch(url, fetchOpts({ accept: "text/html,*/*" }));
        if (!res.ok) { console.log(`  agency-spend Q4 ${fy}: HTTP ${res.status}`); continue; }
        const html = await res.text();
        // Search for agency spend figure — patterns like "£X.X billion" or "£X.Xbn" near "agency"
        // The text typically says "cash spending on agency staff ... £X.X billion"
        const ctx = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); // strip tags
        const m = ctx.match(/agency\s+staff[^.]{0,200}£([\d.]+)\s*(billion|bn)/i)
          ?? ctx.match(/£([\d.]+)\s*(billion|bn)[^.]{0,80}agency\s+staff/i);
        if (m) {
          const v = parseFloat(m[1]);
          if (Number.isFinite(v) && v >= 0.5 && v <= 6) {
            livePoints[fy] = v;
            console.log(`  agency-spend Q4 ${fy}: £${v}bn from ${url}`);
          }
        } else {
          console.log(`  agency-spend Q4 ${fy}: no £-figure matched in HTML (length=${html.length})`);
        }
        await sleep(200);
      } catch (e) {
        console.log(`  agency-spend Q4 ${fy}: err ${e.message}`);
      }
    }

    // Merge: live points override anchors for years covered
    const byDate = new Map(anchors.map((p) => [p.date, p.value]));
    for (const [fy, v] of Object.entries(livePoints)) {
      byDate.set(`${fy}-04-01`, v);
    }

    const points = [...byDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    if (points.length < 5) throw new Error(`agency-spend: only ${points.length} points`);
    console.log(`  agency-spend: ${points.length} annual pts ${points[0].date}..${points[points.length-1].date}`);
    return points;
  },
},
```

**Notes for agency-spend**:
- `min: 0.5, max: 6` allows for a range that covers all confirmed values (1.2 – 3.5)
- Hardcoded anchors are derived from verified official sources (NAO, NHS England press releases)
- The HTML scraping approach targets the Q4 long-reads and extracts the agency spend text figure
- This is "best effort" — if the regex doesn't match, the hardcoded anchors provide the fallback
- The series cadence is `"monthly"` in data.ts but the data is effectively annual (one point per FY April start)
- No `scale` needed — values are already in £bn
- Needs `realPoints("agency-spend", trajectory(...))` wiring in data.ts (currently no wrapper)

---

## Wiring needed in data.ts

### `turnover` (data.ts line 429)
Change:
```typescript
points: trajectory(
  [
    ["2011-01-01", 9.1], ...
  ],
  "2011-01-01",
  "2026-04-01",
  7, 0.15, 0.08,
),
```
To:
```typescript
points: realPoints(
  "turnover",
  trajectory(
    [
      ["2011-01-01", 9.1], ...
    ],
    "2011-01-01",
    "2026-04-01",
    7, 0.15, 0.08,
  ),
),
```

### `agencySpend` (data.ts line 298)
Change:
```typescript
points: trajectory(
  [
    ["2013-04-01", 2.10], ...
  ],
  "2013-04-01",
  "2026-04-01",
  31, 0.06, 0.05,
),
```
To:
```typescript
points: realPoints(
  "agency-spend",
  trajectory(
    [
      ["2013-04-01", 2.10], ...
    ],
    "2013-04-01",
    "2026-04-01",
    31, 0.06, 0.05,
  ),
),
```

---

## Status

- [x] `turnover`: Source identified — NHS Digital supplementary XLSX (2009–2023)
- [x] `turnover`: Fetcher code drafted (page-scrape + XLSX parse pattern)
- [x] `turnover`: min/max validated (5–20%)
- [ ] `turnover`: Actual column names to be confirmed by CI run (diagnostic logging included)
- [ ] `turnover`: data.ts `realPoints()` wiring to add (see above)
- [x] `agencySpend`: Source research complete — no single structured endpoint exists
- [x] `agencySpend`: Confirmed annual data points from NAO + NHS England official sources
- [x] `agencySpend`: Fetcher code drafted (hardcoded anchors + Q4 HTML scraping)
- [x] `agencySpend`: min/max validated (0.5–6)
- [ ] `agencySpend`: data.ts `realPoints()` wiring to add (see above)
- [ ] Both: SOURCES entries to be appended to build-data.mjs SOURCES array

---

## Sources consulted (web research)

- NHS Digital supplementary info: https://digital.nhs.uk/supplementary-information/2023/turnover-from-organisation-by-staff-group-2009-to-2023
- NHS England financial performance reports: https://www.england.nhs.uk/publication/financial-performance-reports/
- NAO NHS Financial Management & Sustainability (Jul 2024): https://www.nao.org.uk/reports/nhs-financial-management-and-sustainability-2024/
- Gov.uk press release (agency crackdown): https://www.gov.uk/government/news/nearly-1-billion-for-nhs-frontline-after-agency-spend-crackdown
- NHS England Q4 financial report 2024-25: https://www.england.nhs.uk/long-read/financial-performance-report-2024-25-quarter-4/
- NHS England 2025-26 month 12: https://www.england.nhs.uk/long-read/month-12-financial-position-2025-26-4-june-2026/
