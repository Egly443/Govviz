# IPA GMPP — mod-procurement & dft-capital-overrun

## Status: INITIAL DRAFT (research complete, fetcher code below)

## Source

**Collection:** `https://www.gov.uk/government/collections/major-projects-data`

**Format:** CSV — one row per project, all departments combined, published annually
(reporting year = March snapshot, published ~January of the following year).

**Annual consolidated CSV URLs (known):**
- March 2021: `https://assets.publishing.service.gov.uk/media/60eecae48fa8f50c7ca55af1/GMPP_Government_Major_Projects_Portofolio_AR_Data_March_2021.csv`
- March 2022: `https://assets.publishing.service.gov.uk/media/62d6c047e90e071e753d6936/GMPP_Government_Major_Projects_Portfolio_AR_Data_March_2022.csv`
- March 2023: `https://assets.publishing.service.gov.uk/media/64b79c5171749c001389ee41/GMPP_Government_Major_Projects_Portofolio_AR_Data_March_2023.csv`
- March 2024: `https://assets.publishing.service.gov.uk/media/6787e8ee1124a2c3ceb646be/Government_Major_Projects_Portofolio_AR_Data_March_2024.csv`

**Also available:** Department-specific CSVs (e.g. `MOD_Government_Major_Projects_Portofolio_AR_Data_March_2024.csv`,
`DFT_Government_Major_Projects_Portofolio_AR_Data_March_2024.csv`). The consolidated
file is preferred; fallback to dept-specific if the consolidated file disappears.

**2025 / April 2026 update:** From 2025 onwards, IPA became NISTA (National
Infrastructure and Service Transformation Authority). The NISTA Annual Report 2024-25
collates all departmental data in an online dashboard and offers a single spreadsheet
download (April 2026 data: `https://www.gov.uk/government/publications/government-major-projects-portfolio/government-major-projects-portfolio-data-april-2026`).
The April 2026 portfolio was reduced from ~200 to ~81 projects (refocus exercise).
The `major-projects-data` collection slug is stable.

**Column names (confirmed from previews/HMRC data.gov.uk preview of 2023-24):**
- `GMPP ID Number` — unique project ID
- `Project Name`
- `Department` — e.g. "MOD", "DFT" (note: may also appear as "MoD", "DfT")
- `IPA Delivery Confidence Assessment` — RAG string: "Green", "Amber/Green", "Amber",
  "Amber/Red", "Red"
- `SRO Delivery Confidence Assessment` — self-assessed RAG
- `TOTAL Baseline Whole Life Costs (£m) (including Non-Government Costs)` — WLC baseline
- `Financial Year Baseline (£m) (including Non-Government Costs)`
- `Financial Year Forecast (£m) (including Non-Government Costs)`
- `Financial Year Variance (%)` — THIS IS THE TARGET METRIC (cost overrun %)
- Various narrative/schedule columns

**Target metric:** `Financial Year Variance (%)` — measures in-year cost variance
as a percentage (positive = over-budget). We aggregate per year by taking the
**median** (or mean) across all projects for the given department (MoD or DfT).

Alternatively (more stable signal): proportion of projects with DCA rated
Amber/Red or Red. The chart definition in `departments.ts` describes the series as
"Weighted overrun across MoD/DfT GMPP portfolio" with unit "percent", which fits
either approach. The variance (%) metric is cleaner for a chart, so we use that.

## Series IDs (from departments.ts)

Both series live in `/home/user/Govviz/src/components/departments.ts` and use the
illustrative `annual()` fallback. Neither has a `realPoints()` wrapper yet.

| Series ID | Title | Subtitle | Unit | goodDirection |
|-----------|-------|----------|------|---------------|
| `mod-procurement` | Equipment procurement cost variance | Weighted overrun across MoD GMPP portfolio | percent | down |
| `dft-capital-overrun` | Transport capital portfolio overrun | Weighted cost variance across rail & road majors | percent | down |

**To wire up real data:** wrap `annual(...)` in `realPoints("mod-procurement", annual(...))` and
`realPoints("dft-capital-overrun", annual(...))` respectively. The build-data.mjs
SOURCES entries below handle the CI fetch.

## Guards (min/max) and scale

Both series are in percent (%). The illustrative data ranges:
- `mod-procurement`: 12–34% overrun → use `min: -5, max: 80`
- `dft-capital-overrun`: 14–52% overrun → use `min: -10, max: 100`

No `scale` needed (CSV values already in %).

If using the DCA approach (Amber/Red + Red proportion):
- Both series would be `min: 0, max: 100` (percent of projects)

## Fetcher strategy

1. Hit the gov.uk Content API for the collection `major-projects-data`.
2. Loop `links.documents` to collect each annual edition (title matches
   `/government major projects portfolio.*data/i`).
3. For each edition, get attachments and find the consolidated CSV (or dept-specific
   CSV if consolidated is absent).
4. Parse CSV, filter rows where `Department` column matches "MOD"/"MoD" (for mod-procurement)
   or "DFT"/"DfT" (for dft-capital-overrun).
5. Average the `Financial Year Variance (%)` values across matching rows.
6. Extract the year from the edition title or the CSV filename (e.g. "March 2024" → 2024-03-31).
7. Return sorted array of `{ date, value }`.

**Fallback (dept-specific CSVs):** If the consolidated CSV is absent, try the
department-specific publication: `{dept}-government-major-projects-portfolio-data-{year}`.

## Fetcher code (build-data.mjs SOURCES entries)

Add these two entries to the `SOURCES` array in `scripts/build-data.mjs`.
These use existing helpers: `govukContent`, `govukAttachments`, `parseCsvLine`.

```javascript
  // ---- IPA/NISTA GMPP: MoD cost variance % (mod-procurement) ----
  // Consolidated GMPP CSV published annually under major-projects-data collection.
  // Each row is a project; filter to MoD, average Financial Year Variance (%).
  {
    id: "mod-procurement",
    min: -5,
    max: 80,
    get: async () => {
      // Known consolidated CSV URLs by year (stable asset hashes). We try the
      // collection API first to discover new editions, then fall back to hardcoded URLs.
      const KNOWN = [
        { date: "2021-03-31", url: "https://assets.publishing.service.gov.uk/media/60eecae48fa8f50c7ca55af1/GMPP_Government_Major_Projects_Portofolio_AR_Data_March_2021.csv" },
        { date: "2022-03-31", url: "https://assets.publishing.service.gov.uk/media/62d6c047e90e071e753d6936/GMPP_Government_Major_Projects_Portfolio_AR_Data_March_2022.csv" },
        { date: "2023-03-31", url: "https://assets.publishing.service.gov.uk/media/64b79c5171749c001389ee41/GMPP_Government_Major_Projects_Portofolio_AR_Data_March_2023.csv" },
        { date: "2024-03-31", url: "https://assets.publishing.service.gov.uk/media/6787e8ee1124a2c3ceb646be/Government_Major_Projects_Portofolio_AR_Data_March_2024.csv" },
      ];

      // Also attempt to discover newer editions via the collection.
      let extraEntries = [];
      try {
        const coll = await govukContent("government/collections/major-projects-data");
        const docs = (coll?.links?.documents || []).filter((d) =>
          /government major projects portfolio/i.test(d.title || "") &&
          /data/i.test(d.title || "")
        );
        console.log(`mod-procurement: collection has ${docs.length} GMPP docs`);
        for (const doc of docs) {
          const p = String(doc.base_path || "").replace(/^\//, "");
          // Extract year from path or title
          const ym = (p + " " + (doc.title || "")).match(/\b(20\d{2})\b/);
          if (!ym) continue;
          const yr = ym[1];
          const dateStr = `${yr}-03-31`;
          if (KNOWN.some((k) => k.date === dateStr)) continue; // already have it
          try {
            const atts = await govukAttachments(p);
            // Prefer consolidated (all-depts) CSV; otherwise dept-specific
            const csvAtt = atts.find((a) => /\.(csv)(\?|$)/i.test(a.url || "") &&
                /GMPP|Government_Major_Projects_Portfolio.*AR/i.test(a.url || ""))
              ?? atts.find((a) => /\.(csv)(\?|$)/i.test(a.url || ""));
            if (csvAtt) extraEntries.push({ date: dateStr, url: csvAtt.url });
          } catch { /* skip edition */ }
        }
      } catch (e) {
        console.log(`mod-procurement: collection discovery failed (${e.message}); using hardcoded URLs`);
      }

      const allEntries = [...KNOWN, ...extraEntries].sort((a, b) => a.date.localeCompare(b.date));
      const points = [];

      for (const { date, url } of allEntries) {
        try {
          const res = await fetch(url, fetchOpts({ accept: "text/csv,*/*" }));
          if (!res.ok) { console.log(`mod-procurement: ${date} → HTTP ${res.status} (${url})`); continue; }
          const text = await res.text();
          const lines = text.trim().split(/\r?\n/);
          if (lines.length < 2) continue;
          const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
          const deptCol = headers.findIndex((h) => h === "department" || h.includes("dept"));
          const varCol = headers.findIndex((h) => /financial year variance/i.test(h) && /%/.test(h));
          const wlcCol = headers.findIndex((h) => /whole life cost/i.test(h) && /baseline/i.test(h));
          console.log(`mod-procurement: ${date} — deptCol=${deptCol} varCol=${varCol} wlcCol=${wlcCol} headers=[${headers.slice(0,10).join("|")}]`);

          const rows = lines.slice(1).map((l) => {
            const cells = parseCsvLine(l);
            return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
          });

          // Filter to MoD rows. Department-specific CSVs use "MOD"; consolidated
          // may use "MoD" or "Ministry of Defence". Broad match is intentional.
          const modRows = rows.filter((r) => {
            const d = (r["department"] ?? "").trim().toUpperCase().replace(/\s+/g, "");
            return d === "MOD" || d === "MINISTRYOFDEFENCE" || d.startsWith("MOD");
          });
          console.log(`mod-procurement: ${date} — ${modRows.length} MoD rows from ${rows.length} total`);

          if (!modRows.length) continue;

          // Average Financial Year Variance (%) across MoD projects
          const varKey = headers[varCol] || "";
          const varVals = modRows
            .map((r) => parseFloat(String(r[varKey] ?? "").replace(/,/g, "")))
            .filter((v) => Number.isFinite(v) && v > -200 && v < 500);

          if (varVals.length < 2) {
            console.log(`mod-procurement: ${date} — only ${varVals.length} variance values; skipping`);
            continue;
          }
          const avg = varVals.reduce((a, b) => a + b, 0) / varVals.length;
          points.push({ date, value: +avg.toFixed(1) });
        } catch (e) {
          console.log(`mod-procurement: ${date} error: ${e.message}`);
        }
      }

      if (points.length < 2) throw new Error(`mod-procurement: only ${points.length} usable annual points`);
      const seen = new Set();
      return points.filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; })
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  },

  // ---- IPA/NISTA GMPP: DfT cost variance % (dft-capital-overrun) ----
  // Same consolidated GMPP CSV as above; filter to DFT rows.
  {
    id: "dft-capital-overrun",
    min: -10,
    max: 100,
    get: async () => {
      const KNOWN = [
        { date: "2021-03-31", url: "https://assets.publishing.service.gov.uk/media/60eecae48fa8f50c7ca55af1/GMPP_Government_Major_Projects_Portofolio_AR_Data_March_2021.csv" },
        { date: "2022-03-31", url: "https://assets.publishing.service.gov.uk/media/62d6c047e90e071e753d6936/GMPP_Government_Major_Projects_Portfolio_AR_Data_March_2022.csv" },
        { date: "2023-03-31", url: "https://assets.publishing.service.gov.uk/media/64b79c5171749c001389ee41/GMPP_Government_Major_Projects_Portofolio_AR_Data_March_2023.csv" },
        { date: "2024-03-31", url: "https://assets.publishing.service.gov.uk/media/6787e8ee1124a2c3ceb646be/Government_Major_Projects_Portofolio_AR_Data_March_2024.csv" },
      ];

      let extraEntries = [];
      try {
        const coll = await govukContent("government/collections/major-projects-data");
        const docs = (coll?.links?.documents || []).filter((d) =>
          /government major projects portfolio/i.test(d.title || "") &&
          /data/i.test(d.title || "")
        );
        for (const doc of docs) {
          const p = String(doc.base_path || "").replace(/^\//, "");
          const ym = (p + " " + (doc.title || "")).match(/\b(20\d{2})\b/);
          if (!ym) continue;
          const yr = ym[1];
          const dateStr = `${yr}-03-31`;
          if (KNOWN.some((k) => k.date === dateStr)) continue;
          try {
            const atts = await govukAttachments(p);
            const csvAtt = atts.find((a) => /\.(csv)(\?|$)/i.test(a.url || "") &&
                /GMPP|Government_Major_Projects_Portfolio.*AR/i.test(a.url || ""))
              ?? atts.find((a) => /\.(csv)(\?|$)/i.test(a.url || ""));
            if (csvAtt) extraEntries.push({ date: dateStr, url: csvAtt.url });
          } catch { /* skip */ }
        }
      } catch (e) {
        console.log(`dft-capital-overrun: collection discovery failed (${e.message}); using hardcoded URLs`);
      }

      const allEntries = [...KNOWN, ...extraEntries].sort((a, b) => a.date.localeCompare(b.date));
      const points = [];

      for (const { date, url } of allEntries) {
        try {
          const res = await fetch(url, fetchOpts({ accept: "text/csv,*/*" }));
          if (!res.ok) { console.log(`dft-capital-overrun: ${date} → HTTP ${res.status} (${url})`); continue; }
          const text = await res.text();
          const lines = text.trim().split(/\r?\n/);
          if (lines.length < 2) continue;
          const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
          const varCol = headers.findIndex((h) => /financial year variance/i.test(h) && /%/.test(h));
          console.log(`dft-capital-overrun: ${date} — varCol=${varCol} headers=[${headers.slice(0,10).join("|")}]`);

          const rows = lines.slice(1).map((l) => {
            const cells = parseCsvLine(l);
            return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
          });

          // Department-specific CSVs use "DfT"; consolidated may also use "DFT"
          // or "Department for Transport". Case-insensitive broad match.
          const dftRows = rows.filter((r) => {
            const d = (r["department"] ?? "").trim().toUpperCase().replace(/\s+/g, "");
            return d === "DFT" || d === "DEPARTMENTFORTRANSPORT" || d.startsWith("DFT");
          });
          console.log(`dft-capital-overrun: ${date} — ${dftRows.length} DfT rows from ${rows.length} total`);

          if (!dftRows.length) continue;

          const varKey = headers[varCol] || "";
          const varVals = dftRows
            .map((r) => parseFloat(String(r[varKey] ?? "").replace(/,/g, "")))
            .filter((v) => Number.isFinite(v) && v > -200 && v < 500);

          if (varVals.length < 1) {
            console.log(`dft-capital-overrun: ${date} — no usable variance values`);
            continue;
          }
          const avg = varVals.reduce((a, b) => a + b, 0) / varVals.length;
          points.push({ date, value: +avg.toFixed(1) });
        } catch (e) {
          console.log(`dft-capital-overrun: ${date} error: ${e.message}`);
        }
      }

      if (points.length < 2) throw new Error(`dft-capital-overrun: only ${points.length} usable annual points`);
      const seen = new Set();
      return points.filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; })
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  },
```

## Confidence and blockers

**Confidence: MEDIUM-HIGH**

- The consolidated GMPP CSV has been published every year since 2021 under stable
  asset URLs. The 2021–2024 hardcoded URLs are verified from web search results.
- The gov.uk Content API collection endpoint (`major-projects-data`) is used for
  discovering new editions, with the hardcoded URLs as the guaranteed fallback —
  so a new NISTA edition (2025, April 2026) will be picked up automatically
  if the collection lists the attachment, and the old years always work.
- The column names (`Financial Year Variance (%)`, `Department`) are confirmed
  from multiple CSV previews and HMRC data.gov.uk preview snippets. The exact
  string match uses `.toLowerCase()` + regex so capitalisation variance is handled.
- **Risk 1:** The variance column header might differ slightly between editions
  (e.g. "Financial Year Variance (%)" vs "FY Variance (%)"). The fetcher logs
  `headers[0..9]` and `varCol` on every run so the CI log will show the mismatch.
  The `varCol < 0` path logs and skips that year gracefully (throws only if
  fewer than 2 years produce data).
- **Risk 2:** MoD financial year variance data may include redacted ("exempt")
  rows. Those will parse as `NaN` and be filtered by the `Number.isFinite(v)` guard.
- **Risk 3:** The April 2026 NISTA portfolio was reduced to ~81 projects (from ~200),
  so the MoD and DfT subsets will be smaller and averages may shift. The `min: -5`
  / `min: -10` lower bounds accommodate negative variance (under-budget projects).
- **Risk 4:** The 2025 consolidated CSV URL is not yet known (NISTA dashboard
  may use a different structure). The collection discovery code will find it
  if it's listed; otherwise the fetcher succeeds on 2021-2024 only (4 points).

## wiring needed in departments.ts

Wrap the illustrative fallback for each series in `realPoints()`:

```typescript
// mod-procurement (currently line ~606):
points: annual([...], 2012, 2025, 113, 1.0)
// →
points: realPoints("mod-procurement", annual([...], 2012, 2025, 113, 1.0))

// dft-capital-overrun (currently line ~876):
points: annual([...], 2012, 2025, 133, 1.2)
// →
points: realPoints("dft-capital-overrun", annual([...], 2012, 2025, 133, 1.2))
```

Both `realPoints` and `realLine` are already imported in departments.ts (line 13).
