# NHS Workforce Backlog Research — `turnover` + `agencySpend`

Drafter: Claude (research pass, 2026-06-14). Do NOT commit — scratch notes only.

---

## 1. `turnover` — NHS staff leaver rate (%)

### Series definition (data.ts)
- **id**: `"turnover"`
- **unit**: `"percent"`, format: `fmtPct` (`v.toFixed(1) + "%"`)
- **cadence**: `"monthly"`
- **goodDirection**: `"down"`
- **source label**: `"NHS Digital workforce statistics"`
- **sourceUrl**: `https://digital.nhs.uk/data-and-information/publications/statistical/nhs-workforce-statistics`
- Illustrative fallback: ~9–12.5% range, 2011–2026
- Currently **NOT** wrapped in `realPoints()` — needs wiring after fetcher works.

### Source identified: NHS Digital supplementary information

**Primary source**: `digital.nhs.uk/supplementary-information/2023/turnover-from-organisation-by-staff-group-2009-to-2023`
- "Monthly turnover from organisation by staff group, 2009 to 2023"
- Contains monthly joiners, joiner rates, leavers, **leaver rates** and stability index
- Covers HCHS staff from NHS Trusts and other core organisations in England
- Breakdowns by NHS England region, organisation, cluster group, benchmark group and **staff group**
- Format: XLSX (confirmed from supplementary info page)
- Time range: 2009–2023 (14 years of monthly data, ~168+ rows)

**For 2024+ updates**: Monthly publications at `digital.nhs.uk/.../nhs-workforce-statistics/` include
"Turnover from organisation benchmarking tool" and "Turnover from organisation benchmarking source data" files.
The most recent monthly publication page has a scrape-able HTML page with an `.xlsx` link.

**Strategy**:
1. Scrape `digital.nhs.uk/supplementary-information/2023/turnover-from-organisation-by-staff-group-2009-to-2023` for the `.xlsx` link
2. Parse the XLSX — find the "All Staff" / aggregate row where Organisation = "England" or similar
3. Extract monthly leaver rate (%) column
4. For newer months (2024+), scrape the most recent workforce statistics monthly page

**Confidence**: HIGH — 2009-2023 file is confirmed, stable URL, XLSX format parseable by xlsxBook.

---

## 2. `agencySpend` — NHS agency staff spend (£bn/year)

### Series definition (data.ts)
- **id**: `"agency-spend"`
- **unit**: `"gbp"`, format: `fmtGbp` (`"£${v.toFixed(2)}bn"`)
- **cadence**: `"monthly"` (rolling 12-month)
- **goodDirection**: `"down"`
- **target**: `{ value: 2.4, label: "NHSE cap ambition" }`
- **source label**: `"NHS England board papers / NAO"`
- **sourceUrl**: `https://www.nao.org.uk/reports/nhs-financial-management-and-sustainability/`
- Illustrative fallback: ~2.1–4.6bn range, 2013–2026
- Currently illustrative (no `realPoints()` wrapper) — needs wiring.

### Source research

Annual figures confirmed from search results:
- 2022/23: £3.46bn
- 2023/24: £3.02bn  
- 2024/25: £2.07bn (forecast → actual)
- Data goes back to 2017 when current tracking started

**Primary source candidates**:
1. **NHS England Financial Performance Reports** (quarterly, published at `england.nhs.uk/publication/financial-performance-reports/`)
   - Each quarterly report is a long-read HTML page; attached Excel/ODS files may contain agency spend data
   - The Q4 report for each year would give the annual outturn figure
   - Blocker: need to inspect HTML of each quarterly report to find attached Excel/ODS

2. **NHS England "reducing-expenditure-on-nhs-agency-staff" page** (`england.nhs.uk/reducing-expenditure-on-nhs-agency-staff-rules-and-price-caps/`)
   - May contain data charts — need to scrape to check for attached Excel

3. **NHS England FOI: NHS agency spend data** (`england.nhs.uk/publication/foi-nhs-agency-spend-data/`)
   - Excel time series from graphs on NHS Improvement website
   - May go back to 2013/14
   - Format: Excel, confirmed available

4. **Consolidated NHS Provider Accounts** (annual, on gov.uk)
   - PDFs only — extraction would need PDF parsing (not in pipeline)
   - Low suitability

**Best strategy**: 
- Fetch `england.nhs.uk/publication/foi-nhs-agency-spend-data/` (FOI release with historical data in Excel)
- Fall back to scraping `england.nhs.uk/publication/financial-performance-reports/` to find collection of quarterly report pages, then each year's Q4 page for the annual Excel annex

**Confidence**: MEDIUM — FOI release likely has 2013–2018 data but may not extend to 2024/25. Financial performance reports should have recent years but format is unknown until inspected.

---

## Fetcher Code (DRAFT — for review before adding to build-data.mjs)

### `turnover` fetcher

```javascript
// NHS staff turnover (leaver rate %, rolling 12-month) from NHS Digital
// supplementary information file: 2009–2023 XLSX + most recent monthly page for updates.
{
  id: "turnover",
  min: 5,
  max: 20,
  get: async () => {
    // Step 1: Scrape the supplementary info page for the .xlsx download URL
    const infoUrl = "https://digital.nhs.uk/supplementary-information/2023/turnover-from-organisation-by-staff-group-2009-to-2023";
    const res = await fetch(infoUrl, fetchOpts({ accept: "text/html,*/*" }));
    if (!res.ok) throw new Error(`turnover: info page HTTP ${res.status}`);
    const html = await res.text();
    // Look for .xlsx link
    const m = html.match(/href="([^"]*\.xlsx?[^"]*)"/i);
    if (!m) throw new Error(`turnover: no .xlsx link found on info page`);
    const xlsUrl = m[1].startsWith("http") ? m[1] : `https://digital.nhs.uk${m[1]}`;
    console.log(`  turnover XLSX: ${xlsUrl}`);

    const book = await xlsxBook(xlsUrl);
    console.log(`  turnover sheets: [${book.SheetNames.join("|")}]`);

    // Find the sheet with leaver rate data — likely "Monthly Turnover" or similar
    const sheetName = book.SheetNames.find((n) => /turnover|leaver|leavers/i.test(n))
      ?? book.SheetNames.find((n) => !/cover|content|notes|definition/i.test(n))
      ?? book.SheetNames[0];
    const rows = await sheetRows(book, sheetName);

    // Log first few rows for diagnostics
    console.log(`  turnover sheet="${sheetName}" rows=${rows.length}`);
    for (const r of rows.slice(0, 5)) console.log(`  ${JSON.stringify(r).slice(0, 300)}`);

    // Find header row — should have Date/Period, Org/Region, Staff Group, Leaver Rate columns
    let headerIdx = -1, dateCol = -1, orgCol = -1, staffGroupCol = -1, leaverRateCol = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const r = rows[i].map((c) => String(c ?? "").toLowerCase().trim());
      const hasDate = r.some((c) => /date|period|month|year/i.test(c));
      const hasLeaver = r.some((c) => /leaver rate|leavers rate|rolling.*rate|12.*month.*rate/i.test(c));
      if (hasDate && hasLeaver) {
        headerIdx = i;
        dateCol = r.findIndex((c) => /date|period|month/i.test(c));
        orgCol = r.findIndex((c) => /org|organisation|region|england/i.test(c));
        staffGroupCol = r.findIndex((c) => /staff group|staff_group/i.test(c));
        leaverRateCol = r.findIndex((c) => /leaver rate|leavers rate|12.*month.*rate|rolling.*rate/i.test(c));
        break;
      }
    }

    if (headerIdx < 0) {
      // Fallback — dump more rows
      for (const r of rows.slice(0, 15)) console.log(`  hdr? ${JSON.stringify(r).slice(0, 280)}`);
      throw new Error(`turnover: no header row found in "${sheetName}"`);
    }
    if (leaverRateCol < 0) throw new Error(`turnover: no leaver rate col in [${rows[headerIdx].join("|")}]`);
    console.log(`  turnover headerIdx=${headerIdx} dateCol=${dateCol} orgCol=${orgCol} stGrpCol=${staffGroupCol} leaverRateCol=${leaverRateCol}`);

    const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
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
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      return null;
    };

    // Filter to England/All-org aggregate rows, All Staff group
    const byDate = new Map();
    for (const r of rows.slice(headerIdx + 1)) {
      const rawOrg = orgCol >= 0 ? String(r[orgCol] ?? "").trim().toLowerCase() : "";
      const rawGrp = staffGroupCol >= 0 ? String(r[staffGroupCol] ?? "").trim().toLowerCase() : "";
      // Accept England aggregate or "All" org; All staff or blank staff group
      const isEngland = rawOrg === "" || /^england$|^all$|^total$/i.test(rawOrg);
      const isAllStaff = rawGrp === "" || /^all staff$|^all$|^total$/i.test(rawGrp);
      if (!isEngland && !isAllStaff) continue;
      const date = toDate(r[dateCol]);
      if (!date) continue;
      let v = typeof r[leaverRateCol] === "number" ? r[leaverRateCol] : parseFloat(String(r[leaverRateCol] ?? ""));
      if (!Number.isFinite(v) || v < 1 || v > 25) continue;
      // Values might be expressed as a decimal (0.10 = 10%) — normalise
      if (v < 1.5) v = v * 100;
      byDate.set(date, +v.toFixed(1));
    }

    const points = [...byDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    if (points.length < 12) {
      console.log(`  turnover: only ${points.length} pts; may need different org/group filter`);
      // Show sample org/group values to help debug
      const orgs = [...new Set(rows.slice(headerIdx + 1).map((r) => String(r[orgCol] ?? "")).filter(Boolean))].slice(0, 10);
      const grps = [...new Set(rows.slice(headerIdx + 1).map((r) => String(r[staffGroupCol] ?? "")).filter(Boolean))].slice(0, 10);
      console.log(`  orgs: [${orgs.join("|")}]`);
      console.log(`  groups: [${grps.join("|")}]`);
      throw new Error(`turnover: only ${points.length} monthly points`);
    }
    return points;
  },
},
```

**Notes on turnover fetcher**:
- min=5, max=20 covers realistic NHS leaver rates (historic range ~8–13%)
- The `turnover` series in data.ts is NOT yet wrapped in `realPoints()` — needs manual wiring
- The 2009–2023 file gives 168 months of data; monthly benchmark publications give 2024+
- May need to scrape the latest monthly publication page for post-2023 months (second fetch)

---

### `agency-spend` fetcher

**Approach A — FOI release (best for historical going back to 2013/14)**

```javascript
// NHS agency staff spend (£bn/year) from NHS England FOI release
// england.nhs.uk/publication/foi-nhs-agency-spend-data/
{
  id: "agency-spend",
  min: 0.5,
  max: 6,
  get: async () => {
    // Fetch the FOI publication page and find attached Excel
    const foiPage = "https://www.england.nhs.uk/publication/foi-nhs-agency-spend-data/";
    const res = await fetch(foiPage, fetchOpts({ accept: "text/html,*/*" }));
    if (!res.ok) throw new Error(`agency-spend: FOI page HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/href="([^"]*\.xlsx?[^"]*)"/i);
    if (!m) throw new Error(`agency-spend: no Excel link on FOI page`);
    const xlsUrl = m[1].startsWith("http") ? m[1] : `https://www.england.nhs.uk${m[1]}`;
    console.log(`  agency-spend FOI XLSX: ${xlsUrl}`);
    const book = await xlsxBook(xlsUrl);
    console.log(`  agency-spend sheets: [${book.SheetNames.join("|")}]`);
    // ... parse ...
  },
},
```

**Approach B — NHS England Financial Performance Reports collection (for recent years)**

The quarterly reports are long-read HTML pages. Each Q4 page for a year should contain or link to an Excel annex with agency spend data. Strategy:
- Fetch `england.nhs.uk/publication/financial-performance-reports/` (the collection index)
- Find Q4 report URLs for each year
- Fetch each Q4 page and look for attached XLSX/ODS

**Combined approach**: Try FOI page first (older data), fall back to Financial Performance Reports for 2019+.

**NOTE**: The `agencySpend` series uses cadence `"monthly"` but illustrative data is annual anchors.
The best available structured data is **annual** (per financial year). The fetcher should return annual points (one per financial year). Scale: raw values from Excel are likely in £millions → divide by 1000 for £bn, or may already be £bn.

---

## Wiring needed in data.ts (after fetcher works)

### `turnover`
```typescript
// Current (illustrative):
points: trajectory([...], "2011-01-01", "2026-04-01", 7, 0.15, 0.08),

// After fetcher works, change to:
points: realPoints(
  "turnover",
  trajectory([...], "2011-01-01", "2026-04-01", 7, 0.15, 0.08),
),
```

### `agencySpend`
```typescript
// Current (illustrative):
points: trajectory([...], "2013-04-01", "2026-04-01", 31, 0.06, 0.05),

// After fetcher works, change to:
points: realPoints(
  "agency-spend",
  trajectory([...], "2013-04-01", "2026-04-01", 31, 0.06, 0.05),
),
```

---

## Status

- [x] `turnover`: Source identified (NHS Digital supplementary XLSX, 2009–2023), fetcher draft written
- [ ] `turnover`: Actual XLSX URL to be confirmed by CI run (page-scraped, not hardcoded)
- [ ] `turnover`: data.ts `realPoints()` wiring needed
- [ ] `agencySpend`: FOI Excel approach identified; format/columns to be confirmed by CI run
- [ ] `agencySpend`: Financial Performance Reports approach identified for 2019+ data
- [ ] `agencySpend`: data.ts `realPoints()` wiring needed
- [ ] Both: Full fetchers to be added to SOURCES array in build-data.mjs
