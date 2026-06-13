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

// Shared fetch options: identify ourselves (some gov APIs throttle anonymous
// bots) and bound every request so a hung server can't stall the CI job.
const fetchOpts = (headers) => ({
  headers: { "user-agent": "Govviz data fetcher (github.com/egly443/govviz)", ...headers },
  signal: AbortSignal.timeout(30_000),
});

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function onsDate(o) {
  const d = String(o.date || "").trim().toUpperCase();
  let m;
  if ((m = d.match(/^(\d{4})\s+([A-Z]{3})$/)))
    // Unknown month abbreviation → null, so the point is filtered out rather
    // than silently coerced to January.
    return MONTHS[m[2]] ? `${m[1]}-${String(MONTHS[m[2]]).padStart(2, "0")}-01` : null;
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
        // Retry transient failures (network errors / 5xx) per URL so a blip
        // doesn't skip a valid combination; 4xx means wrong combination → move on.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(url, fetchOpts({ accept: "application/json" }));
            if (!res.ok) {
              lastErr = new Error(`${c}/${ds} → HTTP ${res.status}`);
              if (res.status >= 500 && attempt === 0) { await sleep(1000); continue; }
              break;
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
              break;
            }
            return points;
          } catch (e) {
            lastErr = e;
            if (attempt === 0) await sleep(1000);
          }
        }
      }
    }
  }
  throw lastErr || new Error(`${cdid}: no combination matched`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// EES (Explore Education Statistics) — DfE's open data catalogue.
// https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/{id}/csv
// Returns plain CSV (no auth). Not all datasets are available this way; a 4xx skips.
function parseCsvLine(line) {
  const cells = [];
  let inQ = false, cur = "";
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  cells.push(cur.trim());
  return cells;
}
async function eesCsv(datasetId) {
  const url = `https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/${datasetId}/csv`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, fetchOpts({ accept: "text/csv,text/plain,*/*" }));
      if (!res.ok) {
        lastErr = new Error(`EES ${datasetId} → HTTP ${res.status}`);
        if (res.status === 404 || res.status === 400) break;
        await sleep(1000 * (attempt + 1));
        continue;
      }
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("html")) {
        lastErr = new Error(`EES ${datasetId}: got HTML, not CSV`);
        break;
      }
      const text = await res.text();
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) throw new Error(`EES ${datasetId}: empty CSV`);
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
      const rows = lines.slice(1).map((l) => {
        const cells = parseCsvLine(l);
        return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
      });
      console.log(`  EES ${datasetId}: ${rows.length} rows, cols: ${headers.join("|")}`);
      return { headers, rows };
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr || new Error(`EES ${datasetId}: failed`);
}

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
      const res = await fetch(url, fetchOpts({ accept: "application/json" }));
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
      const res = await fetch(url, fetchOpts({ accept: "application/json" }));
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

// --- gov.uk Content & Search APIs + spreadsheet (ODS/XLSX) parsing ---
// Many official series are published only as dated Excel/ODS files whose asset
// URLs change each release. The gov.uk Content API exposes a page's *current*
// attachments under a stable slug, and the Search API finds the newest edition
// of a yearly-republished series — together they let a fetcher track a moving
// target without hard-coding a media id. SheetJS reads .ods/.xlsx/.xls; it is
// installed in CI via `npm install --no-save xlsx`, so we import it lazily
// (local/offline runs produce an empty dataset and never reach this code).
let _sheetjs;
async function sheetjs() {
  if (!_sheetjs) {
    const m = await import("xlsx");
    _sheetjs = m.default ?? m;
  }
  return _sheetjs;
}
// Fetch a spreadsheet URL and return the parsed SheetJS workbook.
async function xlsxBook(url) {
  const res = await fetch(url, fetchOpts({ accept: "application/octet-stream,*/*" }));
  if (!res.ok) throw new Error(`spreadsheet ${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const XLSX = await sheetjs();
  return XLSX.read(buf, { type: "buffer" });
}
// Read one sheet as an array-of-arrays (header:1), blank rows removed.
async function sheetRows(book, name) {
  const XLSX = await sheetjs();
  return XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, blankrows: false });
}
// gov.uk Search API → path (no leading slash) of the newest result accepted by
// `accept`. Lets a fetcher follow a series that is republished under a new slug
// each year (e.g. "...financial-year-2024-to-2025-estimates").
async function govukLatest(q, accept = () => true) {
  const url = `https://www.gov.uk/api/search.json?q=${encodeURIComponent(q)}&order=-public_timestamp&count=20`;
  const res = await fetch(url, fetchOpts({ accept: "application/json" }));
  if (!res.ok) throw new Error(`gov.uk search → HTTP ${res.status}`);
  const j = await res.json();
  const hit = (j.results || []).find((r) => accept(r));
  if (!hit) throw new Error(`gov.uk search: no match for "${q}"`);
  return String(hit.link || "").replace(/^\//, "");
}
async function govukContent(path) {
  const url = `https://www.gov.uk/api/content/${path}`;
  const res = await fetch(url, fetchOpts({ accept: "application/json" }));
  if (!res.ok) throw new Error(`gov.uk content ${path} → HTTP ${res.status}`);
  return res.json();
}
async function govukAttachments(path) {
  const j = await govukContent(path);
  return j?.details?.attachments || [];
}
// Newest document (by public_updated_at) in a gov.uk document collection whose
// title passes `accept`. Collections are stable slugs that list every edition of
// a recurring statistics release — the robust way to follow a yearly series.
async function govukCollectionLatest(slug, accept = () => true) {
  const j = await govukContent(`government/collections/${slug}`);
  const docs = (j?.links?.documents || []).filter((d) => accept(d));
  if (!docs.length) throw new Error(`collection ${slug}: no document matched`);
  docs.sort((a, b) => String(b.public_updated_at || "").localeCompare(String(a.public_updated_at || "")));
  return String(docs[0].base_path || "").replace(/^\//, "");
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
// --- NHS England RTT overview timeseries (non-zipped XLSX). The filename hash
// changes monthly, so scrape the landing page for the current link; a stale
// hardcoded fallback (the file is cumulative) keeps CI working if the scrape fails. ---
async function rttOverviewUrl() {
  const FALLBACK = "https://www.england.nhs.uk/statistics/wp-content/uploads/sites/2/2024/09/RTT-Overview-Timeseries-Including-Estimates-for-Missing-Trusts-Jul24-XLS-109K-88372.xlsx";
  try {
    const res = await fetch("https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/", fetchOpts({ accept: "text/html,*/*" }));
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/href="(https?:\/\/[^"]*RTT-Overview-Timeseries[^"]*\.xlsx[^"]*)"/i) || html.match(/href="([^"]*RTT-Overview-Timeseries[^"]*\.xlsx[^"]*)"/i);
      if (m) return m[1].startsWith("http") ? m[1] : `https://www.england.nhs.uk${m[1]}`;
    }
  } catch { /* fall through */ }
  console.log("  RTT: landing-page scrape failed; using hardcoded fallback URL");
  return FALLBACK;
}
async function parseRttOverview() {
  const url = await rttOverviewUrl();
  console.log(`  RTT overview XLSX: ${url}`);
  const book = await xlsxBook(url);
  const sheetName = book.SheetNames.find((n) => /overview|incomplete|timeseries/i.test(n)) ?? book.SheetNames[0];
  const rows = await sheetRows(book, sheetName);
  let headerIdx = -1, totalCol = -1, pctCol = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i].map((c) => String(c ?? "").toLowerCase().trim());
    const c0 = r[0] ?? "";
    const hasPeriod = c0.includes("period") || c0.includes("month") || c0.includes("date");
    const hasTotal = r.some((c) => c.includes("total") || c.includes("incomplete"));
    const hasPct = r.some((c) => c.includes("%") || c.includes("percent") || c.includes("within 18"));
    if (hasPeriod || (hasTotal && hasPct)) {
      headerIdx = i;
      totalCol = r.findIndex((c) => c.includes("total") && (c.includes("number") || c.includes("incomplete")));
      if (totalCol < 0) totalCol = r.findIndex((c) => c.includes("incomplete") || c.includes("total"));
      pctCol = r.findIndex((c) => c.includes("within 18") || (c.includes("%") && c.includes("18")));
      if (pctCol < 0) pctCol = r.findIndex((c) => c.includes("%") || c.includes("percent"));
      break;
    }
  }
  if (headerIdx < 0) { console.log("RTT: no header; first 8:"); for (const r of rows.slice(0, 8)) console.log(`   ${JSON.stringify(r).slice(0, 200)}`); throw new Error("RTT: no header row"); }
  if (totalCol < 0 || pctCol < 0) throw new Error(`RTT: totalCol=${totalCol} pctCol=${pctCol} in [${rows[headerIdx].join("|")}]`);
  const monMap = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const toDate = (raw) => {
    if (raw == null) return null;
    if (typeof raw === "number" && raw > 30000 && raw < 60000) { const d = new Date((raw - 25569) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
    const s = String(raw).trim();
    let m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m && monMap[m[1].toLowerCase()]) return `${m[2]}-${String(monMap[m[1].toLowerCase()]).padStart(2, "0")}-01`;
    m = s.match(/^([A-Za-z]{3})-(\d{2})$/);
    if (m && monMap[m[1].toLowerCase()]) return `${2000 + Number(m[2])}-${String(monMap[m[1].toLowerCase()]).padStart(2, "0")}-01`;
    return null;
  };
  const totalPts = [], pctPts = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const date = toDate(r[0]); if (!date) continue;
    const t = r[totalCol], p = r[pctCol];
    if (typeof t === "number" && Number.isFinite(t) && t > 0) totalPts.push({ date, value: Math.round(t) });
    if (typeof p === "number" && Number.isFinite(p) && p > 0) pctPts.push({ date, value: +((p > 1 ? p : p * 100)).toFixed(1) });
  }
  if (!totalPts.length || !pctPts.length) throw new Error(`RTT: totalPts=${totalPts.length} pctPts=${pctPts.length}`);
  totalPts.sort((a, b) => (a.date < b.date ? -1 : 1)); pctPts.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { totalPts, pctPts };
}
let _rttCache = null;
function rttData() { if (!_rttCache) _rttCache = parseRttOverview(); return _rttCache; }

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
  { id: "dhsc-clinical-per-1000", line: "doctors", min: 0.5, max: 6, get: () => wb("SH.MED.PHYS.ZS") },
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
  // DfT — AR5 GHG-basis CO2e per capita (intentionally NOT the legacy
  // fossil-only EN.ATM.CO2E.PC code referenced by the illustrative fallback).
  { id: "dft-co2-pc", min: 1, max: 20, get: () => wb("EN.GHG.CO2.PC.CE.AR5") },

  // --- Treasury derived / standalone ---
  // Tax revenue % of GDP (World Bank/IMF), matches hmt-tax-burden realPoints wrapper.
  // min covers the full 1972+ history (central-government basis runs low in early decades).
  { id: "hmt-tax-burden", min: 15, max: 45, get: () => wb("GC.TAX.TOTL.GD.ZS") },
  // Debt interest as % of government revenue (World Bank/IMF).
  { id: "hmt-debt-interest", min: 2, max: 25, get: () => wb("GC.XPN.INTP.RV.ZS") },
  // Tax split: direct (income, profits, CG) vs indirect (goods & services) as % of revenue.
  { id: "hmt-tax-split", line: "direct", min: 30, max: 70, get: () => wb("GC.TAX.YPKG.RV.ZS") },
  { id: "hmt-tax-split", line: "indirect", min: 15, max: 50, get: () => wb("GC.TAX.GSRV.RV.ZS") },

  // --- Home Office ---
  // UNHCR Refugee Data Finder: pending asylum seekers in UK (stock at year-end, all origins).
  // Endpoint: /populations/ with coa=GBR sums asylum_seekers field by year.
  {
    id: "ho-asylum-backlog",
    // UNHCR returns the full 1951+ history (yearFrom is not honoured); early
    // decades are legitimately small, so only the upper bound guards.
    min: 0,
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

  // --- DfE: EES (Explore Education Statistics) API ---
  // ITT new entrants & targets time series, dataset 04e0590d (1360 rows).
  // breakdown_topic has two values: "Entrants" and "Target".
  // "Target" rows + "All subjects" → trainee_percentage = % of national target achieved.
  {
    id: "dfe-teacher-recruitment",
    min: 40,
    max: 130,
    get: async () => {
      const { rows } = await eesCsv("04e0590d-63a9-45d4-b924-98c7a5bc5e76");
      // The all-subjects aggregate label varies across releases; try the known
      // variants on either itt_subject or breakdown.
      const AGG = new Set([
        "all", "total", "all subjects", "all itt subjects",
        "total (all subjects)", "all (postgraduate)", "all postgraduate",
        "secondary total", "",
      ]);
      const target = rows.filter((r) => {
        const topic = (r["breakdown_topic"] ?? "").trim().toLowerCase();
        const subj = (r["itt_subject"] ?? "").trim().toLowerCase();
        const brk = (r["breakdown"] ?? "").trim().toLowerCase();
        return topic === "target" && (AGG.has(subj) || AGG.has(brk));
      });
      const seen = new Set();
      const points = [];
      for (const r of target) {
        const m = (r["time_period"] ?? "").match(/^(\d{4})/);
        if (!m) continue;
        const val = parseFloat(r["trainee_percentage"] ?? "");
        if (!Number.isFinite(val) || val < 30 || val > 200) continue;
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        points.push({ date: `${m[1]}-09-01`, value: val });
      }
      if (!points.length) {
        // Surface the live label values so the next CI run reveals the schema.
        const allT = rows.filter((r) => (r["breakdown_topic"] ?? "").trim().toLowerCase() === "target");
        const subs = [...new Set(allT.map((r) => r["itt_subject"] ?? ""))].slice(0, 12).join(" | ");
        const brks = [...new Set(allT.map((r) => r["breakdown"] ?? ""))].slice(0, 12).join(" | ");
        throw new Error(`dfe-teacher-recruitment: no aggregate rows (itt_subject: [${subs}]; breakdown: [${brks}])`);
      }
      return points.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // Teacher retention, School workforce in England, dataset e0a0988c.
  // 29 rows; wide-format: one column per year after QTS (one_yr_after_qualifying_percent,
  // two_yr_..., ... five_yr_...). We take the 5-year column → attrition = 100 - pct.
  {
    id: "dfe-ect-attrition",
    min: 15,
    max: 60,
    get: async () => {
      const { headers, rows } = await eesCsv("e0a0988c-41e8-411a-be55-ec990ce97043");
      // The 5-year column follows the pattern "five_yr_after_qualifying_percent".
      const fiveCol = headers.find(
        (h) => h.startsWith("five") && h.includes("yr") && h.includes("percent")
      ) ?? headers.find(
        (h) => h.includes("five") && (h.includes("yr") || h.includes("year")) && h.includes("percent")
      );
      if (!fiveCol) throw new Error(`dfe-ect-attrition: no 5-yr column in [${headers.join(",")}]`);
      const seen = new Set();
      const points = [];
      for (const r of rows) {
        // year_qualified is the cohort year; time_period may be the same
        const raw = r["year_qualified"] ?? r["time_period"] ?? "";
        const m = raw.match(/^(\d{4})/);
        if (!m) continue;
        const pct = parseFloat(r[fiveCol]);
        if (!Number.isFinite(pct)) continue;
        // 5-year retention (67–90% range expected) → attrition
        const attrition = +(100 - pct).toFixed(1);
        if (attrition < 5 || attrition > 55) continue;
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        points.push({ date: `${m[1]}-09-01`, value: attrition });
      }
      if (!points.length) throw new Error("dfe-ect-attrition: no usable rows");
      return points.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // --- in progress ---
  // AWE pay growth — KAC3 is monthly YoY %; request months (annual key returns index).
  { id: "hmt-cost-of-living", line: "wages", min: -10, max: 30, get: () => ons(EARN, ["KAC3"], ["lms", "emp"], "months") },
  // Productivity: output per hour worked (ONS, whole economy index).
  { id: "hmt-productivity", min: 30, max: 130, get: () => ons("employmentandlabourmarket/peopleinwork/labourproductivity", ["LZVB", "LZVD"], ["prdy"], "years") },
  // Real households' disposable income per head, chained-volume £ (ONS CRXX).
  { id: "hmt-real-income", min: 5000, max: 35000, get: () => ons(GDP, "CRXX", ["ukea"], "years") },

  // --- Excel/ODS backlog (gov.uk Content API + SheetJS) ---
  // DWP fraud & error: All-Benefits total overpayments as % of expenditure.
  // The publication is republished yearly; resolve the latest edition via the
  // collection, then read "Table 2: Time series of percentage of expenditure
  // overpaid" from its main-tables ODS. The header row carries one FYE-year
  // label per 3-column (central/lower/upper) group, offset one column right of
  // the data; the "All Benefits → Total" row is the headline rate. The latest
  // edition restates the prior year ("FYE 2025 (revised)") before the original,
  // so the first value seen per year (the revision) wins.
  {
    id: "dwp-fraud-error",
    min: 0.5,
    max: 6,
    get: async () => {
      const path = await govukCollectionLatest(
        "fraud-and-error-in-the-benefit-system",
        (d) => /estimates/i.test(d.title || ""),
      );
      const atts = await govukAttachments(path);
      const sheet = atts.find((a) => /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""));
      if (!sheet) throw new Error(`no spreadsheet attachment in ${path}`);
      const book = await xlsxBook(sheet.url);
      let rows;
      for (const name of book.SheetNames) {
        const r = await sheetRows(book, name);
        const title = String(r[0]?.[0] ?? r[0]?.[1] ?? "");
        if (/time series/i.test(title) && /percentage of expenditure overpaid/i.test(title)) {
          rows = r;
          break;
        }
      }
      if (!rows) throw new Error("overpayment time-series sheet not found");
      // The header row has one FYE label per year-group; pick the row with the
      // most FYE cells so the single-cell title ("…FYE 2006 to FYE 2026") loses.
      let header = null;
      let best = 1;
      for (const r of rows) {
        const n = r.filter((c) => /FYE\s*\d{4}/.test(String(c ?? ""))).length;
        if (n > best) { best = n; header = r; }
      }
      if (!header) throw new Error("no FYE header row");
      let group = "";
      let total = null;
      for (const r of rows) {
        if (r[0] != null && String(r[0]).trim()) group = String(r[0]);
        if (/all benefits/i.test(group) && String(r[1] ?? "").trim().toLowerCase() === "total") {
          total = r;
          break;
        }
      }
      if (!total) throw new Error("All Benefits Total row not found");
      const byYear = {};
      for (let g = 2; g < total.length; g += 3) {
        const m = String(header[g + 1] ?? "").match(/FYE\s*(\d{4})/);
        // Real values arrive as numbers; suppression markers ("w"/"x"/"z") as
        // strings — require a number so empty cells can't become false zeros.
        if (!m || typeof total[g] !== "number" || !Number.isFinite(total[g])) continue;
        if (!(m[1] in byYear)) byYear[m[1]] = total[g]; // first (revised) per year wins
      }
      const points = Object.entries(byYear)
        .map(([y, v]) => ({ date: `${y}-01-01`, value: v }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      if (points.length < 5) throw new Error(`only ${points.length} usable points`);
      return points;
    },
  },

  // DfE disadvantaged attainment: KS4 disadvantage gap index (EES). This is the
  // DfE gap *index* (~3.0–3.5), not EPI "months behind" — the chart label is
  // updated to match; no scaling (a fabricated transform would be dishonest).
  {
    id: "dfe-attainment-gap",
    min: 2,
    max: 6,
    get: async () => {
      const { headers, rows } = await eesCsv("dbff4e55-5b10-44bc-be2b-23d9d68e0f98");
      const gapCol = headers.find((h) => h.includes("disadvantage_gap_index") || h.includes("gap_index"));
      if (!gapCol) throw new Error(`dfe-attainment-gap: no gap-index column in [${headers.join(",")}]`);
      const national = rows.filter((r) => (r["geographic_level"] ?? "").trim().toLowerCase() === "national");
      const src = national.length ? national : rows;
      const seen = new Set();
      const points = [];
      for (const r of src) {
        const m = (r["time_period"] ?? "").match(/^(\d{4})/);
        if (!m) continue;
        const val = parseFloat(r[gapCol] ?? "");
        if (!Number.isFinite(val) || val < 1 || val > 8) continue;
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        points.push({ date: `${m[1]}-09-01`, value: val });
      }
      if (!points.length) throw new Error(`dfe-attainment-gap: no usable rows (headers: ${headers.join(",")})`);
      return points.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // MoJ Crown Court outstanding caseload (Criminal court statistics quarterly,
  // sheet C1, "outstanding" row). Raw case count.
  {
    id: "moj-crown-backlog",
    min: 5000,
    max: 120000,
    get: async () => {
      const path = await govukCollectionLatest(
        "criminal-court-statistics",
        (d) => /criminal court statistics quarterly/i.test(d.title || ""),
      );
      const atts = await govukAttachments(path);
      const sheet = atts.find((a) => /table/i.test(a.title || "") && /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""))
        ?? atts.find((a) => /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""));
      if (!sheet) throw new Error(`moj-crown-backlog: no spreadsheet in ${path}`);
      const book = await xlsxBook(sheet.url);
      const sheetName = book.SheetNames.find((n) => /(^|_)c\s*1$/i.test(String(n).trim()));
      if (!sheetName) {
        console.log(`moj-crown-backlog: sheets=[${book.SheetNames.join("|")}] att=${sheet.url}`);
        throw new Error("moj-crown-backlog: C1 sheet not found");
      }
      const rows = await sheetRows(book, sheetName);
      // C1 is row-per-(year, quarter) with an "All cases: open" column = the
      // outstanding caseload at end of period.
      const headerIdx = rows.findIndex((r) =>
        r.some((c) => /^year$/i.test(String(c ?? "").trim())) && r.some((c) => /open/i.test(String(c ?? ""))),
      );
      if (headerIdx < 0) {
        console.log(`moj-crown-backlog: no header in ${sheetName}; first 6:`);
        for (const r of rows.slice(0, 6)) console.log(`   ${JSON.stringify(r).slice(0, 200)}`);
        throw new Error("moj-crown-backlog: header row not located");
      }
      const header = rows[headerIdx];
      const yearCol = header.findIndex((c) => /^year$/i.test(String(c ?? "").trim()));
      const qCol = header.findIndex((c) => /^quarter$/i.test(String(c ?? "").trim()));
      let openCol = header.findIndex((c) => /all cases.*open/i.test(String(c ?? "")));
      if (openCol < 0) openCol = header.findIndex((c) => /(^|:)\s*open\b/i.test(String(c ?? "")));
      if (openCol < 0) throw new Error(`moj-crown-backlog: no open column in [${header.join("|")}]`);
      const qEnd = { Q1: "03-31", Q2: "06-30", Q3: "09-30", Q4: "12-31" };
      const byDate = new Map();
      for (const r of rows.slice(headerIdx + 1)) {
        const year = Number(r[yearCol]);
        if (!Number.isInteger(year) || year < 2000 || year > 2035) continue;
        const q = String(r[qCol] ?? "").trim().toUpperCase().replace(/\s+/g, "");
        const val = r[openCol];
        if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) continue;
        byDate.set(`${year}-${qEnd[q] ?? "12-31"}`, Math.round(val));
      }
      const points = [...byDate.entries()].map(([date, value]) => ({ date, value }));
      if (points.length < 4) throw new Error(`moj-crown-backlog: only ${points.length} points`);
      return points.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // MoJ overall cost per prisoner (£/yr). Annual editions under the prison
  // performance collection; read each edition's costs supplementary ODS and
  // take the England & Wales aggregate row (value in the £20k–£80k band).
  {
    id: "moj-cost-per-prisoner",
    min: 20000,
    max: 80000,
    get: async () => {
      const coll = await govukContent("government/collections/prison-and-probation-trusts-performance-statistics");
      const docs = (coll?.links?.documents || []).filter((d) => /prison-performance-data/i.test(d.base_path || ""));
      if (!docs.length) throw new Error("moj-cost-per-prisoner: no prison-performance-data docs");
      const points = [];
      for (const doc of docs) {
        try {
          const p = String(doc.base_path || "").replace(/^\//, "");
          const ym = p.match(/(\d{4})-to-(\d{4})/);
          if (!ym) continue;
          const odsList = (await govukAttachments(p)).filter((a) => /\.(ods|xlsx?)(\?|$)/i.test(a.url || ""));
          let val = null;
          for (const ods of odsList) {
            const book = await xlsxBook(ods.url);
            // "Table 2: Summary Comparison" has a "{yy}-{yy} Totals" row with the
            // national overall Cost per Prisoner (£/yr, direct + overheads).
            const sn = book.SheetNames.find((n) => /summary.*comparison|^t2/i.test(n)) ?? book.SheetNames.find((n) => /summary/i.test(n));
            if (!sn) continue;
            const rows = await sheetRows(book, sn);
            const row = rows.find((r) => /totals?/i.test(String(r[0] ?? "")) && String(r[0] ?? "").includes(ym[2].slice(2)))
              ?? rows.find((r) => /totals?/i.test(String(r[0] ?? "")));
            if (!row) continue;
            const nums = row.map((c) => typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/,/g, ""))).filter((x) => Number.isFinite(x) && x >= 20000 && x <= 80000);
            if (nums.length) { val = nums[nums.length - 1]; break; }
          }
          if (val != null) points.push({ date: `${ym[2]}-04-01`, value: Math.round(val) });
        } catch { /* skip edition */ }
      }
      if (!points.length) throw new Error("moj-cost-per-prisoner: no usable points");
      const seen = new Set();
      return points
        .filter((p) => { const k = p.date.slice(0, 4); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // MoJ prison-officer resignation rate (HMPPS workforce quarterly ODS). Band
  // 3–5 / prison-officer resignation rate, %.
  {
    id: "moj-officer-resignations",
    min: 2,
    max: 20,
    get: async () => {
      const path = await govukCollectionLatest(
        "hm-prison-probation-service-workforce-statistics",
        (d) => /workforce quarterly/i.test(d.title || ""),
      );
      const atts = await govukAttachments(path);
      const ods = atts.find((a) => /\.(ods|xlsx?)(\?|$)/i.test(a.url || "") && /hmpps[-_]workforce[-_]statistics[-_]tables/i.test((a.title || "") + (a.url || "")))
        ?? atts.find((a) => /\.(ods|xlsx?)(\?|$)/i.test(a.url || "") && /table/i.test(a.title || ""))
        ?? atts.find((a) => /\.(ods|xlsx?)(\?|$)/i.test(a.url || ""));
      if (!ods) throw new Error(`moj-officer-resignations: no ODS in ${path}`);
      const book = await xlsxBook(ods.url);
      // Pick the DATA sheet (skip Contents/Notes, whose cells contain table
      // titles like "Table 10b: …leaving rate…"): require a year header AND a
      // leaving/resignation-rate signal that isn't a "Table N:" title.
      let rows = null, used = null;
      for (const n of book.SheetNames) {
        if (/content|cover|notes|definition|guidance/i.test(n)) continue;
        const r = await sheetRows(book, n);
        const hasYears = r.some((row) => row.filter((c) => c instanceof Date || /\b20\d{2}\b/.test(String(c ?? ""))).length >= 3);
        const hasRate = r.some((row) => /(leaving|resignation)\s*rate/i.test(row.map((c) => String(c ?? "")).join(" ")) && !/^table\s*\d/i.test(String(row[0] ?? "").trim()));
        if (hasYears && hasRate) { rows = r; used = n; break; }
      }
      if (!rows) {
        console.log(`moj-officer-resignations: no rate sheet; sheets=[${book.SheetNames.join("|")}] att=${ods.url}`);
        throw new Error("moj-officer-resignations: no leaving-rate sheet");
      }
      let hi = -1, header = null, best = 0;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const n = rows[i].filter((c) => c instanceof Date || /\d{4}[-/]\d{2}|\b(19|20)\d{2}\b|[A-Za-z]{3}[-\s]\d{2,4}/.test(String(c ?? ""))).length;
        if (n > best) { best = n; header = rows[i]; hi = i; }
      }
      const pick = (re) => rows.slice(hi + 1).find((r) => re.test(String(r[0] ?? r[1] ?? "")));
      const dataRow = pick(/band\s*3[-–—]?5?|prison\s*officer/i) ?? pick(/leaving\s*rate/i) ?? pick(/resignation\s*rate/i) ?? pick(/all\s*staff|^total|national/i);
      if (!dataRow || hi < 0) {
        console.log(`moj-officer-resignations: sheet "${used}" rows 0-10:`);
        for (const r of rows.slice(0, 10)) console.log(`   ${JSON.stringify(r).slice(0, 220)}`);
        throw new Error("moj-officer-resignations: rate row/header not located");
      }
      const points = [];
      for (let i = 0; i < dataRow.length; i++) {
        let v = typeof dataRow[i] === "number" ? dataRow[i] : parseFloat(String(dataRow[i] ?? ""));
        if (!Number.isFinite(v)) continue;
        if (v > 0 && v < 1) v *= 100;
        if (v < 1 || v > 25) continue;
        const h = header[i];
        let date = null, m;
        if (h instanceof Date) date = h.toISOString().slice(0, 10);
        else if ((m = String(h ?? "").match(/(\d{4})[-/](\d{2})\b/))) date = `${2000 + +m[2]}-03-01`;
        else if ((m = String(h ?? "").match(/([A-Za-z]{3})[-\s](\d{2,4})/))) { const mo = MONTHS[m[1].toUpperCase().slice(0, 3)]; if (mo) { const yr = m[2].length === 2 ? 2000 + +m[2] : +m[2]; date = `${yr}-${String(mo).padStart(2, "0")}-01`; } }
        else if ((m = String(h ?? "").match(/\b(20\d{2})\b/))) date = `${m[1]}-03-01`;
        if (date) points.push({ date, value: +v.toFixed(1) });
      }
      if (points.length < 2) {
        console.log(`moj-officer-resignations: header=${JSON.stringify(header).slice(0, 200)} dataRow=${JSON.stringify(dataRow).slice(0, 200)}`);
        throw new Error(`moj-officer-resignations: only ${points.length} pts`);
      }
      const seen = new Set();
      return points.filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; }).sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // MoD personnel shortfall: (requirement − trained strength) / requirement %,
  // from DASA quarterly service personnel statistics ODS.
  {
    id: "mod-personnel-shortfall",
    min: 0,
    max: 20,
    get: async () => {
      const path = await govukCollectionLatest("quarterly-service-personnel-statistics-index");
      const atts = await govukAttachments(path);
      const sheet = atts.find((a) => /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""));
      if (!sheet) throw new Error(`mod-personnel-shortfall: no spreadsheet in ${path}`);
      const book = await xlsxBook(sheet.url);
      // Worksheet 3a: (Trade) Trained Strength against the Workforce Requirement.
      const name = book.SheetNames.find((n) => /^3a$/i.test(String(n).trim()));
      if (!name) throw new Error(`mod-personnel-shortfall: no 3a sheet (${book.SheetNames.join("|")})`);
      const rows = await sheetRows(book, name);
      // Transposed: header row of quarter-end dates; the tri-service
      // "…Surplus/Deficit (percentage)" row holds the deficit as a fraction
      // (e.g. -0.028 = 2.8% under requirement → shortfall 2.8%).
      const isDate = (c) => /\d{1,2}\s+[A-Za-z]+\s+\d{4}/.test(String(c ?? "").replace(/\n/g, " "));
      const hi = rows.findIndex((r) => r.filter(isDate).length >= 4);
      if (hi < 0) throw new Error("mod-personnel-shortfall: no date header in 3a");
      const header = rows[hi];
      const pctRow = rows.find((r) => /surplus\/deficit\s*\(percentage\)/i.test(String(r[0] ?? "")) && !/officer/i.test(String(r[0] ?? "")));
      if (!pctRow) throw new Error("mod-personnel-shortfall: no tri-service deficit% row in 3a");
      const pts = [];
      for (let i = 1; i < header.length; i++) {
        const m = String(header[i] ?? "").replace(/\n/g, " ").match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
        if (!m) continue;
        const mo = MONTHS[m[2].slice(0, 3).toUpperCase()];
        if (!mo) continue;
        let v = typeof pctRow[i] === "number" ? pctRow[i] : parseFloat(String(pctRow[i] ?? ""));
        if (!Number.isFinite(v)) continue;
        const sh = (Math.abs(v) <= 1 ? -v * 100 : -v); // deficit (negative) → positive shortfall
        if (sh < 0 || sh > 30) continue;
        pts.push({ date: `${m[3]}-${String(mo).padStart(2, "0")}-01`, value: +sh.toFixed(2) });
      }
      if (pts.length < 4) throw new Error(`mod-personnel-shortfall: only ${pts.length} pts from 3a`);
      const seen = new Set();
      return pts.sort((a, b) => (a.date < b.date ? -1 : 1)).filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; });
    },
  },

  // MoD voluntary outflow rate (%) from the DASA quarterly ODS.
  {
    id: "mod-voluntary-outflow",
    min: 2,
    max: 15,
    get: async () => {
      const path = await govukCollectionLatest("quarterly-service-personnel-statistics-index");
      const atts = await govukAttachments(path);
      const sheet = atts.find((a) => /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""));
      if (!sheet) throw new Error(`mod-voluntary-outflow: no spreadsheet in ${path}`);
      const book = await xlsxBook(sheet.url);
      // Worksheet 5e: 12-months-ending trained outflow RATE by service & exit reason.
      const name = book.SheetNames.find((n) => /^5e$/i.test(String(n).trim()));
      if (!name) throw new Error(`mod-voluntary-outflow: no 5e sheet (${book.SheetNames.join("|")})`);
      const rows = await sheetRows(book, name);
      // Transposed: a header row of quarter-end dates ("31 March 2013 (percentage)"),
      // with category rows incl. "Tri-Service … Voluntary Outflow Rate" (all ranks).
      const isDate = (c) => /\d{1,2}\s+[A-Za-z]+\s+\d{4}/.test(String(c ?? "").replace(/\n/g, " "));
      const hi = rows.findIndex((r) => r.filter(isDate).length >= 4);
      if (hi < 0) throw new Error("mod-voluntary-outflow: no date header in 5e");
      const header = rows[hi];
      const dataRow = rows.slice(hi + 1).find((r) => /voluntary outflow rate/i.test(String(r[0] ?? "")) && !/officer/i.test(String(r[0] ?? "")));
      if (!dataRow) throw new Error("mod-voluntary-outflow: no tri-service VO rate row");
      const pts = [];
      for (let i = 1; i < header.length; i++) {
        const m = String(header[i] ?? "").replace(/\n/g, " ").match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
        if (!m) continue;
        const mo = MONTHS[m[2].slice(0, 3).toUpperCase()];
        if (!mo) continue;
        let v = typeof dataRow[i] === "number" ? dataRow[i] : parseFloat(String(dataRow[i] ?? ""));
        if (!Number.isFinite(v) || v < 1 || v > 20) continue;
        pts.push({ date: `${m[3]}-${String(mo).padStart(2, "0")}-01`, value: +v.toFixed(2) });
      }
      if (pts.length < 4) throw new Error(`mod-voluntary-outflow: only ${pts.length} pts from 5e`);
      const seen = new Set();
      return pts.sort((a, b) => (a.date < b.date ? -1 : 1)).filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; });
    },
  },

  // Home Office UKVI visa service standard %: "Visas, status and immigration
  // data" ODS, sheet VSI_02 (route-keyed). DIAGNOSTIC PASS — the right route/row
  // to headline is ambiguous, so log structure before committing an extraction.
  {
    id: "ho-visa-sla",
    min: 30,
    max: 100,
    get: async () => {
      const path = await govukCollectionLatest(
        "migration-transparency-data",
        (d) => /visas,?\s*status\s*and\s*immigration/i.test(d.title || ""),
      );
      const atts = await govukAttachments(path);
      const sheet = atts.find((a) => /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || "") && /(vsi|visas)/i.test((a.title || "") + (a.url || "")))
        ?? atts.find((a) => /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""));
      if (!sheet) throw new Error(`ho-visa-sla: no spreadsheet in ${path}`);
      const book = await xlsxBook(sheet.url);
      const name = book.SheetNames.find((n) => /vsi[_\s-]?0?2/i.test(n)) ?? book.SheetNames.find((n) => /service|standard/i.test(n));
      console.log(`ho-visa-sla: edition=${path} sheets=[${book.SheetNames.join("|")}] picked=${name}`);
      if (name) {
        const rows = await sheetRows(book, name);
        for (const r of rows.slice(0, 8)) console.log(`   ${JSON.stringify(r).slice(0, 220)}`);
      }
      throw new Error("DIAG ho-visa-sla — VSI_02 structure logged (pick route/row next)");
    },
  },

  // NHS England RTT: incomplete waiting list (raw count → millions via scale) and
  // % within 18 weeks. Both share one fetch+parse of the overview timeseries.
  { id: "waiting-list", min: 1, max: 12, scale: 1 / 1_000_000, get: async () => (await rttData()).totalPts },
  { id: "rtt-18-week", min: 40, max: 100, get: async () => (await rttData()).pctPts },

  // NHS England A&E 4-hour performance (Monthly A&E Time Series XLS; URL scraped
  // from the current-year stats page).
  {
    id: "ae-performance",
    min: 50,
    max: 100,
    get: async () => {
      const now = new Date();
      const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const base = "https://www.england.nhs.uk/statistics/statistical-work-areas/ae-waiting-times-and-activity";
      const pages = [
        `${base}/ae-attendances-and-emergency-admissions-${fy}-${String(fy + 1).slice(2)}/`,
        `${base}/ae-attendances-and-emergency-admissions-${fy - 1}-${String(fy).slice(2)}/`,
      ];
      let xlsUrl = null;
      for (const pageUrl of pages) {
        try {
          const res = await fetch(pageUrl, fetchOpts({ accept: "text/html,*/*" }));
          if (!res.ok) continue;
          const html = await res.text();
          const m = html.match(/href="(https?:\/\/[^"]*Monthly-AE-Time-Series[^"]*\.xlsx?[^"]*)"/i)
            || html.match(/href="(\/[^"]*Monthly-AE-Time-Series[^"]*\.xlsx?[^"]*)"/i);
          if (m) { xlsUrl = m[1].startsWith("http") ? m[1] : `https://www.england.nhs.uk${m[1]}`; break; }
        } catch { /* next */ }
      }
      if (!xlsUrl) throw new Error("ae-performance: no timeseries XLS URL found");
      console.log(`  ae-performance: ${xlsUrl}`);
      const book = await xlsxBook(xlsUrl);
      let sheetName = book.SheetNames.find((n) => ["england", "national", "all england", "aggregate"].includes(n.trim().toLowerCase()))
        ?? book.SheetNames.find((n) => !/cover|note|content|index|key/i.test(n)) ?? book.SheetNames[0];
      const rows = await sheetRows(book, sheetName);
      const PCT = [/percentage.*4\s*hour/i, /%.*4\s*hour/i, /4\s*hour.*percentage/i, /4\s*hour.*%/i, /within 4/i];
      const DATE = [/period/i, /month/i, /date/i];
      let headerIdx = -1, dateCol = -1, pctCol = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i]; if (!Array.isArray(row)) continue;
        const hd = row.findIndex((c) => DATE.some((p) => p.test(String(c ?? ""))));
        const hp = row.findIndex((c) => PCT.some((p) => p.test(String(c ?? ""))));
        if (hp >= 0) { headerIdx = i; pctCol = hp; dateCol = hd >= 0 ? hd : 0; break; }
      }
      if (headerIdx < 0 || pctCol < 0) {
        console.log(`ae-performance: no pct col; sheet="${sheetName}" first 8:`);
        for (const r of rows.slice(0, 8)) console.log(`   ${JSON.stringify(r).slice(0, 200)}`);
        throw new Error("ae-performance: header/pct column not found");
      }
      const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      const toDate = (raw) => {
        const s = String(raw ?? "").trim();
        let m = s.match(/^([A-Za-z]{3,})[- ](\d{2,4})$/);
        if (m && MON[m[1].toLowerCase().slice(0, 3)]) { let yr = +m[2]; if (yr < 100) yr += yr >= 90 ? 1900 : 2000; return `${yr}-${String(MON[m[1].toLowerCase().slice(0, 3)]).padStart(2, "0")}-01`; }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        if (typeof raw === "number" && raw > 30000 && raw < 60000) { const d = new Date(Math.round((raw - 25569) * 86400000)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
        return null;
      };
      const points = [], seen = new Set();
      for (const r of rows.slice(headerIdx + 1)) {
        if (!Array.isArray(r)) continue;
        const date = toDate(r[dateCol]); if (!date || seen.has(date)) continue;
        let v = typeof r[pctCol] === "number" ? r[pctCol] : parseFloat(String(r[pctCol] ?? "").replace(/[%,]/g, ""));
        if (!Number.isFinite(v)) continue;
        if (v <= 1.5) v *= 100;
        if (v < 50 || v > 100) continue;
        seen.add(date); points.push({ date, value: +v.toFixed(2) });
      }
      if (points.length < 12) throw new Error(`ae-performance: only ${points.length} points`);
      return points.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // DfT / ORR rail cancellations score (% of planned trains cancelled, all
  // operators). ORR data portal Table 3123 ODS (media id may rotate → SKIPs safe).
  {
    id: "dft-rail-cancellations",
    min: 0,
    max: 25,
    get: async () => {
      const book = await xlsxBook("https://dataportal.orr.gov.uk/media/2177/table-3123-trains-planned-and-cancellations-by-operator-and-cause.ods");
      const sheetName = book.SheetNames.find((n) => /3123|cancellation/i.test(String(n))) ?? book.SheetNames[0];
      const rows = await sheetRows(book, sheetName);
      // Layout: "Time period" ("Apr to Jun 2019"), "National or Operator" (GB = aggregate),
      // planned/part/full counts, and a weighted "Cancellations" (CaSL) column.
      // Score % = weighted cancellations ÷ trains planned × 100.
      const headerIdx = rows.findIndex((r) => r.some((c) => /time period/i.test(String(c ?? ""))) && r.some((c) => /national or operator/i.test(String(c ?? ""))));
      if (headerIdx < 0) {
        console.log(`dft-rail-cancellations: no header; sheets=[${book.SheetNames.join("|")}]`);
        for (const r of rows.slice(0, 6)) console.log("  " + JSON.stringify(r).slice(0, 200));
        throw new Error("dft-rail-cancellations: header row not found");
      }
      const header = rows[headerIdx];
      const periodCol = header.findIndex((c) => /time period/i.test(String(c ?? "")));
      const opCol = header.findIndex((c) => /national or operator/i.test(String(c ?? "")));
      const plannedCol = header.findIndex((c) => /trains planned/i.test(String(c ?? "")));
      let canCol = header.findIndex((c) => /^cancellations\s*$/i.test(String(c ?? "")));
      if (canCol < 0) canCol = header.findIndex((c) => /cancellation/i.test(String(c ?? "")) && !/part|full|responsib|by /i.test(String(c ?? "")));
      if (plannedCol < 0 || canCol < 0) throw new Error(`dft-rail-cancellations: cols planned=${plannedCol} can=${canCol} in [${header.join("|")}]`);
      const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      const qend = { 3: "03-31", 6: "06-30", 9: "09-30", 12: "12-31" };
      const byDate = new Map();
      for (const r of rows.slice(headerIdx + 1)) {
        if (!/great britain|national/i.test(String(r[opCol] ?? ""))) continue;
        const m = String(r[periodCol] ?? "").match(/to\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i);
        if (!m) continue;
        const em = MON[m[1].toLowerCase()];
        if (!em || !qend[em]) continue;
        const planned = Number(r[plannedCol]), can = Number(r[canCol]);
        if (!Number.isFinite(planned) || planned <= 0 || !Number.isFinite(can)) continue;
        const score = can / planned * 100;
        if (score <= 0 || score > 25) continue;
        const date = `${m[2]}-${qend[em]}`;
        if (!byDate.has(date)) byDate.set(date, +score.toFixed(2));
      }
      const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (points.length < 4) throw new Error(`dft-rail-cancellations: only ${points.length} points`);
      return points;
    },
  },

  // MoJ Crown Court timeliness: mean/median days to completion (Criminal court
  // statistics quarterly — Crown Court timeliness sheet E1/E2/T2).
  {
    id: "moj-completion-days",
    min: 50,
    max: 1000,
    get: async () => {
      const path = await govukCollectionLatest("criminal-court-statistics", (d) => /criminal court statistics quarterly/i.test(d.title || ""));
      const atts = await govukAttachments(path);
      const sheet = atts.find((a) => /table/i.test(a.title || "") && /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""))
        ?? atts.find((a) => /\.(ods|xlsx?|xlsb)(\?|$)/i.test(a.url || ""));
      if (!sheet) throw new Error(`moj-completion-days: no spreadsheet in ${path}`);
      const book = await xlsxBook(sheet.url);
      let rows = null, usedSheet = null;
      for (const cand of ["Table_E1", "Table_E2", "Table_T2", "Table_T1"]) {
        const n = book.SheetNames.find((s) => new RegExp(`^${cand}$`, "i").test(s.trim()));
        if (!n) continue;
        const r = await sheetRows(book, n);
        const combined = r.slice(0, 10).map((row) => row.join(" ")).join(" ").toLowerCase();
        if ((combined.includes("median") || combined.includes("mean") || combined.includes("days")) && (combined.includes("charge") || combined.includes("crown") || combined.includes("completion"))) { rows = r; usedSheet = n; break; }
      }
      if (!rows) {
        for (const n of book.SheetNames) {
          const r = await sheetRows(book, n);
          const combined = r.slice(0, 10).map((row) => row.join(" ")).join(" ").toLowerCase();
          if (combined.includes("crown") && (combined.includes("days") || combined.includes("median")) && combined.includes("charge")) { rows = r; usedSheet = n; break; }
        }
      }
      if (!rows) {
        console.log(`moj-completion-days: sheets=[${book.SheetNames.join("|")}] att=${sheet.url}`);
        throw new Error("moj-completion-days: no Crown Court timeliness sheet found");
      }
      const headerIdx = rows.findIndex((r) => r.some((c) => /^year$/i.test(String(c ?? "").trim())) && r.some((c) => /median|mean|days/i.test(String(c ?? ""))));
      if (headerIdx < 0) {
        console.log(`moj-completion-days: no header in ${usedSheet}; first 6:`);
        for (const r of rows.slice(0, 6)) console.log(`   ${JSON.stringify(r).slice(0, 220)}`);
        throw new Error(`moj-completion-days: header not found in ${usedSheet}`);
      }
      const header = rows[headerIdx];
      const yearCol = header.findIndex((c) => /^year$/i.test(String(c ?? "").trim()));
      const qCol = header.findIndex((c) => /^quarter$/i.test(String(c ?? "").trim()));
      let valCol = header.findIndex((c) => /median/i.test(String(c ?? "")) && /day|charg|complet/i.test(String(c ?? "")));
      if (valCol < 0) valCol = header.findIndex((c) => /median/i.test(String(c ?? "")));
      if (valCol < 0) valCol = header.findIndex((c) => /mean/i.test(String(c ?? "")) && /day|charg|complet/i.test(String(c ?? "")));
      if (valCol < 0) valCol = header.findIndex((c) => /mean/i.test(String(c ?? "")));
      if (valCol < 0) throw new Error(`moj-completion-days: no median/mean column in ${usedSheet}`);
      const qEnd = { Q1: "03-31", Q2: "06-30", Q3: "09-30", Q4: "12-31" };
      const byDate = new Map();
      for (const r of rows.slice(headerIdx + 1)) {
        const year = Number(r[yearCol]);
        if (!Number.isInteger(year) || year < 2000 || year > 2035) continue;
        const q = String(r[qCol] ?? "").trim().toUpperCase().replace(/\s+/g, "");
        const v = r[valCol];
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
        byDate.set(`${year}-${qEnd[q] ?? "12-31"}`, Math.round(v));
      }
      const points = [...byDate.entries()].map(([date, value]) => ({ date, value }));
      if (points.length < 4) throw new Error(`moj-completion-days: only ${points.length} points (sheet=${usedSheet})`);
      return points.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },
];

const out = {};
let ok = 0;
let fail = 0;
for (const s of SOURCES) {
  const tag = `${s.id}${s.line ? ":" + s.line : ""}`;
  try {
    let points = await s.get();
    if (s.scale) points = points.map((p) => ({ date: p.date, value: p.value * s.scale }));
    // Sanity guard: a wrong-but-resolving code can't show wrong data. Reject
    // the whole series when the latest value or a majority of points is out
    // of range; isolated out-of-range points (corrupt rows, e.g. ONS J5IK has
    // a couple of £m values on a %-of-GDP series) are dropped with a warning.
    const oob = (v) => (s.min != null && v < s.min) || (s.max != null && v > s.max);
    const last = points[points.length - 1].value;
    if (oob(last))
      throw new Error(`latest ${last} outside expected [${s.min ?? "-∞"},${s.max ?? "∞"}] — wrong series?`);
    const bad = points.filter((p) => oob(p.value));
    if (bad.length > points.length / 2)
      throw new Error(`${bad.length}/${points.length} points outside expected [${s.min ?? "-∞"},${s.max ?? "∞"}] — wrong series?`);
    if (bad.length) {
      console.warn(`warn ${tag}  dropping ${bad.length} point(s) outside [${s.min ?? "-∞"},${s.max ?? "∞"}], e.g. ${bad[0].value} at ${bad[0].date}`);
      points = points.filter((p) => !oob(p.value));
    }
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
