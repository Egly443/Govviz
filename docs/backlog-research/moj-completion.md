# moj-completion-days — Research Notes

**Target series:** `moj-completion-days` — Crown Court mean/median days from charge to case completion, England & Wales, quarterly.

**Status:** INITIAL DRAFT — research in progress. Update before implementing.

---

## 1. Source & Sheet Identification

**Publication:** "Criminal court statistics quarterly" — same ODS already consumed by `moj-crown-backlog`.

**ODS resolution:** same pattern as moj-crown-backlog:
```js
const path = await govukCollectionLatest(
  "criminal-court-statistics",
  (d) => /criminal court statistics quarterly/i.test(d.title || ""),
);
const atts = await govukAttachments(path);
const sheet = atts.find(a => /table/i.test(a.title || "") && /\.(ods|xlsx?)(\?|$)/i.test(a.url || ""))
  ?? atts.find(a => /\.(ods|xlsx?)(\?|$)/i.test(a.url || ""));
const book = await xlsxBook(sheet.url);
```

**Sheet naming (confirmed from CLAUDE.md and search):**
- `Table_C1` to `Table_C11` — Crown Court caseload (C1 = outstanding cases, used by moj-crown-backlog)
- `Table_T1` to `Table_T4` — Magistrates' court timeliness
- **`Table_E1` and `Table_E2`** — Crown Court timeliness ("time from case receipt at the Crown Court to completion")
- **`Table_T2`** — possibly Crown Court timeliness from charge (TBC — may also appear here)

**Key confirmed fact (from MoJ quarterly bulletin text):**
- Q4 2025: median time from **charge to completion** at Crown Court = **181 days** (up 9 days / 5% YoY)
- Q2 2025: 179 days; Q3 2025: 179 days; Q4 2024: 172 days
- There is also a longer "offence to completion" measure (~355 days in Q3 2024)

**Guide quote (from "A Guide to Criminal court statistics", Oct-Dec 2025):**
> "Magistrates' court timeliness estimates (T1 – T3) provide estimates of the time from offence to completion for defendants dealt with at the magistrates' courts. Crown Court timeliness estimates (E1 – E2) provide estimates of the time from case receipt at the Crown Court to completion."

**Most likely sheet:** `Table_E1` or `Table_E2` for case-receipt-to-completion at Crown Court.
The "charge to completion" metric (181 days) may be in the same E sheets, or in the main bulletin ODS under a different timeliness table. The T2 sheet (in the CLAUDE.md noted list) might also cover Crown Court.

**Column name (inferred):**
Likely one of:
- `"Median days from charge to completion"` 
- `"Median number of days from charge to completion"`
- `"All cases: median"` (in context of Crown Court timeliness)

Expected row structure: row-per-(Year, Quarter) matching C1's layout.

---

## 2. Fetcher Code Block

```js
// MoJ Crown Court mean days from charge to completion (Criminal court statistics
// quarterly, Crown Court timeliness sheet E1 or E2).
// Median charge-to-completion: ~181 days in Q4 2025.
{
  id: "moj-completion-days",
  min: 50,
  max: 1000,
  get: async () => {
    const path = await govukCollectionLatest(
      "criminal-court-statistics",
      (d) => /criminal court statistics quarterly/i.test(d.title || ""),
    );
    const atts = await govukAttachments(path);
    const sheet = atts.find((a) => /table/i.test(a.title || "") && /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""))
      ?? atts.find((a) => /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""));
    if (!sheet) throw new Error(`moj-completion-days: no spreadsheet in ${path}`);
    const book = await xlsxBook(sheet.url);

    // Crown Court timeliness lives in Table_E1 or Table_E2.
    // Fallback: also try T2 in case sheet naming differs across editions.
    const CANDIDATES = ["Table_E1", "Table_E2", "Table_T2", "Table_T1"];
    let rows = null, usedSheet = null;
    for (const candidate of CANDIDATES) {
      const n = book.SheetNames.find((s) => new RegExp(`^${candidate}$`, "i").test(s.trim()));
      if (!n) continue;
      const r = await sheetRows(book, n);
      // Check if this sheet looks like Crown Court timeliness:
      // must have a header with "median" or "days" AND "charge" or "crown"
      const combined = r.slice(0, 10).map((row) => row.join(" ")).join(" ").toLowerCase();
      if ((combined.includes("median") || combined.includes("mean") || combined.includes("days")) &&
          (combined.includes("charge") || combined.includes("crown") || combined.includes("completion"))) {
        rows = r;
        usedSheet = n;
        break;
      }
    }
    if (!rows) {
      // Broader fallback: scan all sheets for crown court timeliness signal
      for (const n of book.SheetNames) {
        const r = await sheetRows(book, n);
        const combined = r.slice(0, 10).map((row) => row.join(" ")).join(" ").toLowerCase();
        if (combined.includes("crown") && (combined.includes("days") || combined.includes("median")) && combined.includes("charge")) {
          rows = r;
          usedSheet = n;
          break;
        }
      }
    }
    if (!rows) {
      console.log(`moj-completion-days: sheets=[${book.SheetNames.join("|")}] att=${sheet.url}`);
      throw new Error("moj-completion-days: no Crown Court timeliness sheet found");
    }

    // Find header row: must have "year" and ("median" or "mean" or "days")
    const headerIdx = rows.findIndex((r) =>
      r.some((c) => /^year$/i.test(String(c ?? "").trim())) &&
      r.some((c) => /median|mean|days/i.test(String(c ?? ""))),
    );
    if (headerIdx < 0) {
      console.log(`moj-completion-days: no header in sheet ${usedSheet}; first 6:`);
      for (const r of rows.slice(0, 6)) console.log(`   ${JSON.stringify(r).slice(0, 220)}`);
      throw new Error(`moj-completion-days: header row not found in ${usedSheet}`);
    }
    const header = rows[headerIdx];
    const yearCol = header.findIndex((c) => /^year$/i.test(String(c ?? "").trim()));
    const qCol = header.findIndex((c) => /^quarter$/i.test(String(c ?? "").trim()));

    // Pick median column; fall back to mean if no median
    let valCol = header.findIndex((c) => /median/i.test(String(c ?? "")) && /day|charg|complet/i.test(String(c ?? "")));
    if (valCol < 0) valCol = header.findIndex((c) => /median/i.test(String(c ?? "")));
    if (valCol < 0) valCol = header.findIndex((c) => /mean/i.test(String(c ?? "")) && /day|charg|complet/i.test(String(c ?? "")));
    if (valCol < 0) valCol = header.findIndex((c) => /mean/i.test(String(c ?? "")));
    if (valCol < 0) {
      console.log(`moj-completion-days: header=[${header.join("|")}]`);
      throw new Error(`moj-completion-days: no median/mean days column in ${usedSheet}`);
    }

    const qEnd = { Q1: "03-31", Q2: "06-30", Q3: "09-30", Q4: "12-31" };
    const byDate = new Map();
    for (const r of rows.slice(headerIdx + 1)) {
      const year = Number(r[yearCol]);
      if (!Number.isInteger(year) || year < 2000 || year > 2035) continue;
      const q = String(r[qCol] ?? "").trim().toUpperCase().replace(/\s+/g, "");
      const val = r[valCol];
      if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) continue;
      byDate.set(`${year}-${qEnd[q] ?? "12-31"}`, Math.round(val));
    }
    const points = [...byDate.entries()].map(([date, value]) => ({ date, value }));
    if (points.length < 4) throw new Error(`moj-completion-days: only ${points.length} points (sheet=${usedSheet})`);
    return points.sort((a, b) => (a.date < b.date ? -1 : 1));
  },
},
```

---

## 3. Guard values (min/max)

```
min: 50
max: 1000
```

Rationale:
- Known values: ~181 days in Q4 2025; ~355 days for offence-to-completion (different metric)
- The charge-to-completion series runs ~140–200 days in recent quarters
- Setting wide bounds (50–1000) to catch any edge in the historical series without being so wide as to accept garbage
- Could tighten to `min: 80, max: 500` once actual historical range is verified from the ODS

---

## 4. Wiring in src/components/departments.ts

The series `moj-completion-days` lives in `/home/user/Govviz/src/components/departments.ts`.

To wire real data:
1. Find the `moj-completion-days` entry in `departments.ts`
2. Wrap its `points` with `realPoints("moj-completion-days", <existing_fallback_fn>)`
3. Import `realPoints` from `../components/data` if not already imported

Example:
```ts
// before
points: completionDaysFallback(),

// after  
points: realPoints("moj-completion-days", completionDaysFallback),
```

---

## 5. Confidence & Blockers

**Confidence: HIGH that data exists, MEDIUM on exact column/sheet name.**

**What is confirmed:**
- The same ODS file already opened by `moj-crown-backlog` contains timeliness tables
- The "criminal court statistics quarterly" bulletin quotes "median days from charge to completion" explicitly (181 days Q4 2025)
- The guide document confirms Crown Court timeliness lives in sheets labelled **E1 and E2**
- The CLAUDE.md note mentions sheets `Table_T1..T4` also exist in the same ODS — but these are magistrates' court timeliness per the guide

**Key uncertainty:**
- Whether the E1/E2 sheets contain the "charge to completion" metric or only "case receipt to completion" (these are different measures — charge predates case receipt by the committal period)
- Actual column header text — the fetcher uses broad regex so should be robust
- Whether a separate timeliness ODS attachment exists (some editions publish C-tables and T/E-tables as separate files)

**If E1/E2 not in main ODS attachment:**
The code's broad sheet-scan fallback will log the actual sheet names to CI diagnostics. If the Crown Court timeliness data is in a separate attachment, look for an attachment with "timeliness" in its title or URL — extend `atts.find(...)` to check for that.

**Alternative metric if charge-to-completion is not available:**
Use "case receipt to completion" from E1/E2 (shorter series, ~125–165 days range in 2023). This is a legitimate Crown Court efficiency metric.

---

## Sources
- [Criminal court statistics quarterly: October to December 2025](https://www.gov.uk/government/statistics/criminal-court-statistics-quarterly-october-to-december-2025/criminal-court-statistics-quarterly-october-to-december-2025)
- [A Guide to Criminal court statistics](https://www.gov.uk/government/statistics/criminal-court-statistics-quarterly-october-to-december-2025/a-guide-to-criminal-court-statistics)
- [Criminal court statistics quarterly: April to June 2025](https://www.gov.uk/government/statistics/criminal-court-statistics-quarterly-april-to-june-2025/criminal-court-statistics-quarterly-april-to-june-2025)
- [Charge to case completion at court - CJS Dashboard](https://criminal-justice-delivery-data-dashboards.justice.gov.uk/improving-timeliness/courts)
