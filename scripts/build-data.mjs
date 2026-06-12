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
  const cdids = Array.isArray(cdid) ? cdid : [cdid];
  const datasets = Array.isArray(dataset) ? dataset : [dataset];
  let lastErr;
  for (const c of cdids) {
    for (const t of topics) {
      for (const ds of datasets) {
        const url = `https://www.ons.gov.uk/${t}/timeseries/${c.toLowerCase()}/${ds.toLowerCase()}/data`;
        try {
          const res = await fetch(url, { headers: { accept: "application/json" } });
          if (!res.ok) {
            lastErr = new Error(`${c}/${ds} → HTTP ${res.status}`);
            continue;
          }
          const j = await res.json();
          const parse = (arr) =>
            (arr || [])
              .map((o) => ({ date: onsDate(o), value: parseFloat(o.value) }))
              .filter((p) => p.date && Number.isFinite(p.value));
          // Try requested frequency first; if no usable points (array absent OR
          // all values are markers like "-"), fall through to finer-grained data.
          let points = parse(j[freq]);
          if (!points.length) {
            // j.quarters may be [] (empty, truthy) — use .find to pick first non-empty array.
            const fb = [j.quarters, j.months, j.years].find((a) => Array.isArray(a) && a.length) || [];
            points = parse(fb);
          }
          if (!points.length) {
            lastErr = new Error(`${c}/${ds}: no usable points`);
            continue;
          }
          return points;
        } catch (e) {
          lastErr = e;
        }
      }
    }
  }
  throw lastErr || new Error(`${cdid}: no combination matched`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// UNHCR Refugee Data Finder — public REST API, no key required.
// Returns JSON items for the given endpoint/params; caller aggregates.
async function unhcr(endpoint, params = {}) {
  const qs = Object.entries(params)
    .flatMap(([k, v]) => (Array.isArray(v) ? v.map((vi) => `${k}[]=${vi}`) : [`${k}=${v}`]))
    .join("&");
  const url = `https://api.unhcr.org/population/v1/${endpoint}/?${qs}&limit=10000`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        lastErr = new Error(`UNHCR ${endpoint} → HTTP ${res.status}`);
        if (res.status === 404) break;
        await sleep(600 * (attempt + 1));
        continue;
      }
      return (await res.json()).items || [];
    } catch (e) {
      lastErr = e;
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastErr || new Error(`UNHCR ${endpoint}: failed`);
}

// World Bank open API → clean JSON, no key, very stable, sourced from
// OECD/WHO/UN (so internationally comparable and hard to fudge).
async function wb(indicator, country = "GBR") {
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=20000`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        lastErr = new Error(`WB ${indicator} → HTTP ${res.status}`);
        if (res.status === 404) break;
        await sleep(600 * (attempt + 1));
        continue;
      }
      const j = await res.json();
      const rows = Array.isArray(j) ? j[1] : null;
      if (!rows) {
        lastErr = new Error(`WB ${indicator}: no data array`);
        await sleep(600 * (attempt + 1));
        continue;
      }
      const points = rows
        .filter((r) => r && r.value != null)
        .map((r) => ({ date: `${r.date}-01-01`, value: Number(r.value) }))
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!points.length) throw new Error(`WB ${indicator}: no usable points`);
      return points;
    } catch (e) {
      lastErr = e;
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastErr || new Error(`WB ${indicator}: failed`);
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

  // --- DHSC: clinical workforce per 1,000 people (World Bank / OECD/WHO) ---
  { id: "dhsc-clinical-per-1000", line: "doctors", min: 1, max: 6, get: () => wb("SH.MED.PHYS.ZS") },
  { id: "dhsc-clinical-per-1000", line: "nurses", min: 3, max: 15, get: () => wb("SH.MED.NUMW.P3") },
  // Hospital beds per 1,000, and life expectancy at birth.
  { id: "dhsc-beds-per-1000", min: 1, max: 12, get: () => wb("SH.MED.BEDS.ZS") },
  { id: "life-expectancy", min: 60, max: 90, get: () => wb("SP.DYN.LE00.IN") },

  // --- World Bank cross-department batch (international, hard-to-fudge) ---
  { id: "dhsc-health-spend-gdp", min: 3, max: 20, get: () => wb("SH.XPD.CHEX.GD.ZS") },
  { id: "dhsc-infant-mortality", min: 1, max: 40, get: () => wb("SP.DYN.IMRT.IN") },
  { id: "dfe-edu-spend-gdp", min: 2, max: 9, get: () => wb("SE.XPD.TOTL.GD.ZS") },
  { id: "dfe-pupil-teacher", min: 8, max: 40, get: () => wb("SE.PRM.ENRL.TC.ZS") },
  { id: "ho-homicide-rate", min: 0, max: 5, get: () => wb("VC.IHR.PSRC.P5") },
  { id: "mod-defence-spend-gdp", min: 0, max: 10, get: () => wb("MS.MIL.XPND.GD.ZS") },
  { id: "dwp-pop-65", min: 5, max: 30, get: () => wb("SP.POP.65UP.TO.ZS") },
  { id: "dft-road-death-rate", min: 0, max: 20, get: () => wb("SH.STA.TRAF.P5") },
  // Real GDP per head, constant LCU (replaces the unverified ONS guess).
  { id: "hmt-gdp-per-capita", min: 15000, max: 70000, get: () => wb("NY.GDP.PCAP.KD") },

  // --- World Bank wave 2 ---
  // Treasury / economy
  { id: "hmt-gdp-growth", min: -15, max: 15, get: () => wb("NY.GDP.MKTP.KD.ZG") },
  { id: "hmt-investment-gdp", min: 5, max: 40, get: () => wb("NE.GDI.TOTL.ZS") },
  { id: "hmt-current-account", min: -15, max: 15, get: () => wb("BN.CAB.XOKA.GD.ZS") },
  { id: "hmt-employment-rate", min: 40, max: 85, get: () => wb("SL.EMP.TOTL.SP.ZS") },
  { id: "hmt-participation", min: 40, max: 85, get: () => wb("SL.TLF.CACT.ZS") },
  { id: "hmt-trade-gdp", min: 20, max: 95, get: () => wb("NE.TRD.GNFS.ZS") },
  { id: "hmt-savings", min: 0, max: 40, get: () => wb("NY.GNS.ICTR.ZS") },
  { id: "hmt-gni-per-capita", min: 5000, max: 90000, get: () => wb("NY.GNP.PCAP.PP.CD") },
  // DHSC
  { id: "dhsc-health-spend-pc", min: 500, max: 12000, get: () => wb("SH.XPD.CHEX.PC.CD") },
  { id: "dhsc-suicide", min: 0, max: 30, get: () => wb("SH.STA.SUIC.P5") },
  { id: "dhsc-measles-imm", min: 50, max: 100, get: () => wb("SH.IMM.MEAS") },
  { id: "dhsc-oop", min: 0, max: 60, get: () => wb("SH.XPD.OOPC.CH.ZS") },
  // DfE / Home Office / MoD
  { id: "dfe-tertiary-enrol", min: 10, max: 160, get: () => wb("SE.TER.ENRR") },
  { id: "ho-migrant-stock", min: 0, max: 30, get: () => wb("SM.POP.TOTL.ZS") },
  { id: "mod-personnel-total", min: 50000, max: 1000000, get: () => wb("MS.MIL.TOTL.P1") },
  // DWP
  { id: "dwp-oldage-dependency", min: 10, max: 50, get: () => wb("SP.POP.DPND.OL") },
  { id: "dwp-female-participation", min: 40, max: 85, get: () => wb("SL.TLF.CACT.FE.ZS") },
  { id: "dwp-gini", min: 25, max: 45, get: () => wb("SI.POV.GINI") },
  { id: "dwp-youth-unemp", min: 2, max: 40, get: () => wb("SL.UEM.1524.ZS") },
  // DfT
  { id: "dft-co2-pc", min: 1, max: 20, get: () => wb("EN.GHG.CO2.PC.CE.AR5") },

  // --- Treasury derived / standalone ---
  // Tax revenue % of GDP (World Bank/IMF), matches hmt-tax-burden realPoints wrapper.
  { id: "hmt-tax-burden", min: 25, max: 45, get: () => wb("GC.TAX.TOTL.GD.ZS") },
  // Debt interest as % of government revenue (World Bank/IMF).
  { id: "hmt-debt-interest", min: 2, max: 25, get: () => wb("GC.XPN.INTP.RV.ZS") },

  // --- Home Office ---
  // UNHCR Refugee Data Finder: pending asylum seekers in UK (stock at year-end, all origins).
  // Endpoint: /populations/ with coa=GBR sums asylum_seekers field by year.
  {
    id: "ho-asylum-backlog",
    min: 10000,
    max: 500000,
    get: async () => {
      const items = await unhcr("population", { coa: "GBR", yearFrom: 2000, coo_all: true });
      const byYear = {};
      for (const i of items) {
        const v = i.asylum_seekers ?? i.asylumSeekers;
        if (v != null) byYear[i.year] = (byYear[i.year] || 0) + Number(v);
      }
      if (!Object.keys(byYear).length) throw new Error("ho-asylum-backlog: no asylum_seekers data");
      return Object.entries(byYear)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([y, v]) => ({ date: `${y}-01-01`, value: Math.round(v) }));
    },
  },

  // --- DHSC: H&W sector vacancy rate (ONS, monthly 3-month average) ---
  // JPB9 = vacancies per 100 employee jobs in Human Health & Social Work.
  // Data lives in j.months (3-month moving average, date "YYYY MON") in the lms dataset.
  { id: "vacancy", min: 1, max: 20, get: () => ons("employmentandlabourmarket/peopleinwork/employmentandemployeetypes", ["JPB9"], ["lms"], "months") },

  // --- in progress ---
  // AWE pay growth — KAC3 is monthly YoY %; request months (annual key returns index).
  { id: "hmt-cost-of-living", line: "wages", min: -10, max: 30, get: () => ons(EARN, ["KAC3"], ["lms", "emp"], "months") },
  // Productivity: output per hour worked (ONS, whole economy index).
  { id: "hmt-productivity", min: 50, max: 130, get: () => ons("employmentandlabourmarket/peopleinwork/labourproductivity", ["LZVB", "LZVD"], ["prdy"], "years") },
  // Real households' disposable income per head, chained-volume £ (ONS CRXX).
  { id: "hmt-real-income", min: 10000, max: 35000, get: () => ons(GDP, "CRXX", ["ukea"], "years") },
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
  await sleep(120); // be gentle on the APIs across a big batch
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
