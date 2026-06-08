// Fetches official statistics and bakes them into src/generated/seriesData.ts.
//
// Runs in CI (which has internet) before `vite build`. Each source is isolated
// in try/catch and the script NEVER fails the build — any source that errors is
// skipped and the app keeps its bundled illustrative fallback for that series.
// The repo commits an EMPTY object, so no datasets live in git; CI overwrites
// this file for the production build only.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "src/generated/seriesData.ts";

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function onsDate(o) {
  const d = String(o.date || "").trim().toUpperCase();
  let m;
  if ((m = d.match(/^(\d{4})\s+([A-Z]{3})$/)))
    return `${m[1]}-${String(MONTHS[m[2]] ?? 1).padStart(2, "0")}-01`;
  if ((m = d.match(/^(\d{4})\s+Q(\d)$/)))
    return `${m[1]}-${String((+m[2] - 1) * 3 + 1).padStart(2, "0")}-01`;
  if ((m = d.match(/^(\d{4})$/))) return `${m[1]}-01-01`;
  return null;
}

// ONS publishes JSON for any time series by appending /data to its page URL:
// https://www.ons.gov.uk/{topic}/timeseries/{cdid}/{dataset}/data
// `topic` and `dataset` may be arrays — every combination is tried until one
// returns usable data (auto-resolves the right dataset without guessing).
async function ons(topic, cdid, dataset, freq = "years") {
  const topics = Array.isArray(topic) ? topic : [topic];
  const datasets = Array.isArray(dataset) ? dataset : [dataset];
  let lastErr;
  for (const t of topics) {
    for (const ds of datasets) {
      const url = `https://www.ons.gov.uk/${t}/timeseries/${cdid.toLowerCase()}/${ds.toLowerCase()}/data`;
      try {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) {
          lastErr = new Error(`${cdid}/${ds} → HTTP ${res.status}`);
          continue;
        }
        const j = await res.json();
        let arr = j[freq] || [];
        if (!arr.length) arr = j.quarters || j.months || [];
        const points = arr
          .map((o) => ({ date: onsDate(o), value: Number(o.value) }))
          .filter((p) => p.date && Number.isFinite(p.value));
        if (!points.length) {
          lastErr = new Error(`${cdid}/${ds}: no usable points`);
          continue;
        }
        return points;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error(`${cdid}: no dataset matched`);
}

const INFLATION = "economy/inflationandpriceindices";
const PUBFIN = "economy/governmentpublicsectorandtaxes/publicsectorfinance";
const EARN = "employmentandlabourmarket/peopleinwork/earningsandworkinghours";
const GDP = "economy/grossdomesticproductgdp";
const UNEMP = "employmentandlabourmarket/peoplenotinwork/unemployment";

// Manifest. `id` = TrendSeries id; `line` = a line of a multi-line chart;
// `min`/`max` guard the latest value; `scale` multiplies raw values.
// CDIDs are best-effort and verified/corrected against CI fetch logs — wrong
// codes 404 (skip) or fail the guard (skip), so the build never shows bad data.
const SOURCES = [
  // --- confirmed working (real ONS data) ---
  { id: "hmt-cost-of-living", line: "cpi", min: -5, max: 30, get: () => ons(INFLATION, "D7G7", "mm23", "years") },
  { id: "hmt-psnd", min: 10, max: 130, get: () => ons(PUBFIN, "HF6X", "pusf", "years") },
  // HF6W is already in £ billion (latest ~2925 = £2.93tn) — no scaling.
  { id: "hmt-psnd-cash", min: 200, max: 4000, get: () => ons(PUBFIN, "HF6W", "pusf", "years") },
  { id: "hmt-deficit", min: -8, max: 25, get: () => ons(PUBFIN, "J5IK", "pusf", "years") },

  // Unemployment rate (16+), LFS, monthly since 1971.
  { id: "hmt-unemployment", min: 1, max: 20, get: () => ons(UNEMP, "MGSX", ["lms"], "months") },

  // --- in progress ---
  // AWE total pay annual growth → wages line (try several datasets).
  { id: "hmt-cost-of-living", line: "wages", min: -10, max: 30, get: () => ons(EARN, "KAC3", ["lms", "emp"], "years") },

  // --- TODO: guesses returned the wrong metric; need verified CDIDs ---
  // hmt-tax-burden     MF6U is receipts £m, not the %-of-GDP ratio.
  // hmt-gdp-per-capita IHXW resolves but may be nominal; need chained-volume £/head.
  // hmt-real-income    RVZR 404; need real households' disposable income per head.
];

const out = {};
let ok = 0;
let fail = 0;
for (const s of SOURCES) {
  const tag = `${s.id}${s.line ? ":" + s.line : ""}`;
  try {
    let points = await s.get();
    if (s.scale) points = points.map((p) => ({ date: p.date, value: p.value * s.scale }));
    // Sanity guard: a wrong-but-resolving code can't show wrong data.
    const last = points[points.length - 1].value;
    if ((s.min != null && last < s.min) || (s.max != null && last > s.max))
      throw new Error(`latest ${last} outside expected [${s.min ?? "-∞"},${s.max ?? "∞"}] — wrong series?`);
    out[s.id] ??= {};
    if (s.line) (out[s.id].lines ??= []).push({ id: s.line, points });
    else out[s.id].points = points;
    out[s.id].asOf = new Date().toISOString().slice(0, 10);
    ok++;
    console.log(
      `ok   ${tag}  ${points.length} pts  ${points[0].date}..${points[points.length - 1].date}`,
    );
  } catch (e) {
    fail++;
    console.warn(`SKIP ${tag}  ${e.message}`);
  }
}

const file =
  `// AUTO-GENERATED by scripts/build-data.mjs — do not edit or commit populated data.\n` +
  `export type RawPoint = { date: string; value: number };\n` +
  `export type RawSeries = { points?: RawPoint[]; lines?: { id: string; points: RawPoint[] }[]; asOf?: string };\n` +
  `export const SERIES_DATA: Record<string, RawSeries> = ${JSON.stringify(out, null, 2)};\n`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file);
console.log(`\nwrote ${OUT}: ${ok} ok, ${fail} skipped`);
process.exit(0); // never fail the build over data fetching
