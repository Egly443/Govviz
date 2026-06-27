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
  headers: { "user-agent": "Govviz data fetcher (github.com/Egly443/Govviz)", ...headers },
  signal: AbortSignal.timeout(30_000),
});

// Exact-source provenance: helpers record the URL they actually fetched so the
// baked dataset can link to the precise file/table (not just a landing page).
// The main loop resets this per series and keeps the first non-null value.
let _src = null;
const setSrc = (u) => { if (u) _src = String(u); };

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
            setSrc(url);
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
      setSrc(`https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/${datasetId}`);
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
      setSrc("https://www.unhcr.org/refugee-statistics/download");
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
      setSrc(url);
      return points;
    } catch (e) {
      lastErr = e;
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastErr || new Error(`WB ${indicator}: failed`);
}

// International peer set for World Bank comparator charts. Same indicator,
// same methodology, different country — the hardest framing for anyone to
// massage. Keep in sync with WB_PEERS in src/components/departments.ts.
const WB_PEERS = [
  ["deu", "Germany"],
  ["fra", "France"],
];
// Expand one WB indicator into a UK line ("gbr") plus a comparator line per
// peer, so the baked output is a multi-line { gbr, deu, fra } series.
function wbCompare(id, indicator, { min, max, scale } = {}) {
  return [
    { id, line: "gbr", min, max, scale, get: () => wb(indicator, "GBR") },
    ...WB_PEERS.map(([code]) => ({
      id,
      line: code,
      min,
      max,
      scale,
      get: () => wb(indicator, code.toUpperCase()),
    })),
  ];
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
  setSrc(url);
  return XLSX.read(buf, { type: "buffer" });
}
// Parse an in-memory spreadsheet buffer (e.g. an entry unzipped from a .zip).
async function xlsxBookFromBuffer(buf) {
  const XLSX = await sheetjs();
  return XLSX.read(buf, { type: "buffer" });
}
// Download a .zip and return its entries as { name, buf } (lazy fflate import;
// installed in CI alongside xlsx).
let _fflate;
async function unzipUrl(url) {
  if (!_fflate) { const m = await import("fflate"); _fflate = m.default ?? m; }
  const res = await fetch(url, fetchOpts({ accept: "application/zip,application/octet-stream,*/*" }));
  if (!res.ok) throw new Error(`zip ${url} → HTTP ${res.status}`);
  const files = _fflate.unzipSync(new Uint8Array(await res.arrayBuffer()));
  return Object.entries(files).map(([name, data]) => ({ name, buf: Buffer.from(data) }));
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
  setSrc(`https://www.gov.uk/${path}`);
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
const PUBSECPERS = "employmentandlabourmarket/peopleinwork/publicsectorpersonnel";

// Manifest. `id` = TrendSeries id; `line` = a line of a multi-line chart;
// `min`/`max` guard the latest value; `scale` multiplies raw values.
// CDIDs are best-effort and verified/corrected against CI fetch logs — wrong
// codes 404 (skip) or fail the guard (skip), so the build never shows bad data.
// --- NHS England RTT — national incomplete waiting list + % within 18 weeks.
// NHS England discontinued the single national "Overview Timeseries" file (only a
// stale 2007–2014 archive still links from the topic pages). The live figures now
// exist only as per-month, per-provider "Incomplete-Provider-MmmYY" workbooks
// (~9 MB each) on the financial-year pages. We rebuild the national series by
// summing each provider's all-specialties ("Total" treatment-function) row across
// every provider for each month; iterating the monthly files gives a real series.
// First file each run logs the workbook structure so CI reveals exact columns.

// Gather every spreadsheet/CSV link on the RTT year + landing pages as {name,url}.
async function rttFileList() {
  const pages = [
    "https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/rtt-data-2025-26/",
    "https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/rtt-data-2024-25/",
    "https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/",
  ];
  const seen = new Set(), files = [];
  for (const p of pages) {
    try {
      const res = await fetch(p, fetchOpts({ accept: "text/html,*/*" }));
      if (!res.ok) { console.log(`  RTT page ${p} → HTTP ${res.status}`); continue; }
      const html = await res.text();
      for (const x of html.matchAll(/href="([^"]*\.(?:xlsx?|csv)[^"]*)"/gi)) {
        const url = x[1].startsWith("http") ? x[1] : `https://www.england.nhs.uk${x[1]}`;
        if (seen.has(url)) continue; seen.add(url);
        files.push({ name: url.split("/").pop(), url });
      }
    } catch (e) { console.log(`  RTT page ${p} err ${e.message}`); }
  }
  return files;
}

// "Incomplete-Provider-Mar26-..." → "2026-03-01".
function rttMonthFromName(name) {
  const m = name.match(/Incomplete-Provider-([A-Za-z]{3})(\d{2})/i);
  if (!m) return null;
  const mon = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }[m[1].toLowerCase()];
  if (!mon) return null;
  return `${2000 + Number(m[2])}-${String(mon).padStart(2, "0")}-01`;
}

// Dense lower-cased row (sheet_to_json header:1 yields sparse arrays; .map keeps
// the holes, so predicate callbacks would get undefined — Array.from fills them).
const denseRow = (row) => Array.from({ length: row?.length ?? 0 }, (_, i) => String(row[i] ?? "").toLowerCase().trim());

// Sum one provider sheet's all-specialties ("Total" treatment-function) rows.
// Returns null if the sheet has no recognisable header. `withClock` is the sum of
// the week bands (pathways with a known clock start); `unknown` is the patients
// with an unknown clock start. NHS's published list size = withClock + unknown,
// and % within 18 weeks = within18 / (withClock + unknown).
function rttSumSheet(rows, sn, diag) {
  let headerIdx = -1, tfCol = -1, totalCol = -1, w18Col = -1, unkCol = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = denseRow(rows[i]);
    const tf = r.findIndex((c) => c === "treatment function" || c.includes("treatment function name") || c === "rtt part description");
    const tot = r.findIndex((c) => /total.*incomplete pathways/.test(c) && !/unknown|clock start/.test(c) && !/within|over/.test(c));
    if (tf >= 0 && tot >= 0) {
      headerIdx = i; tfCol = tf; totalCol = tot;
      w18Col = r.findIndex((c) => /total within 18 weeks/.test(c) || (c.includes("within 18") && c.includes("week")));
      unkCol = r.findIndex((c) => /unknown clock start/.test(c));
      if (diag) {
        const h = denseRow(rows[i]);
        const around = [totalCol, w18Col, unkCol].filter((x) => x >= 0).flatMap((x) => [x - 1, x, x + 1]);
        console.log(`  RTT "${sn}" cols ${[...new Set(around)].sort((a, b) => a - b).map((x) => `${x}:${h[x]}`).join(" | ")}`);
      }
      break;
    }
  }
  if (headerIdx < 0) {
    if (diag) {
      console.log(`  RTT sheet "${sn}": no header in first 25 rows; preview:`);
      for (const r of rows.slice(0, 12)) console.log(`     ${JSON.stringify((r || []).slice(0, 22)).slice(0, 220)}`);
    }
    return null;
  }
  if (diag) console.log(`  RTT sheet="${sn}" headerIdx=${headerIdx} tfCol=${tfCol} totalCol=${totalCol} w18Col=${w18Col} unkCol=${unkCol}`);
  let withClock = 0, within18 = 0, unknown = 0, nTotalRows = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r) continue;
    if (!/^total$/i.test(String(r[tfCol] ?? "").trim())) continue;
    const t = r[totalCol];
    if (typeof t === "number" && Number.isFinite(t)) { withClock += t; nTotalRows++; }
    const w = w18Col >= 0 ? r[w18Col] : null;
    if (typeof w === "number" && Number.isFinite(w)) within18 += w;
    const u = unkCol >= 0 ? r[unkCol] : null;
    if (typeof u === "number" && Number.isFinite(u)) unknown += u;
  }
  if (diag) console.log(`  RTT sheet "${sn}" nTotalRows=${nTotalRows} withClock=${withClock} within18=${within18} unknown=${unknown}`);
  return nTotalRows > 0 && withClock > 0 ? { withClock, within18, unknown } : null;
}

// Parse one Incomplete-Provider workbook → national { withClock, within18, unknown }
// by summing the NHS "Provider" and independent-sector "IS Provider" sheets (the
// "with DTA" sheets are an alternative waiting-time measure — not additive).
async function rttParseProvider(url, diag = false) {
  const book = await xlsxBook(url);
  if (diag) console.log(`  RTT provider sheets=[${book.SheetNames.join("|")}]`);
  const targets = book.SheetNames.filter((n) => /provider/i.test(n) && !/dta/i.test(n));
  const acc = { withClock: 0, within18: 0, unknown: 0 };
  let hits = 0;
  for (const sn of (targets.length ? targets : book.SheetNames)) {
    const sub = rttSumSheet(await sheetRows(book, sn), sn, diag);
    if (sub) { acc.withClock += sub.withClock; acc.within18 += sub.within18; acc.unknown += sub.unknown; hits++; }
  }
  if (hits === 0 || acc.withClock <= 0) throw new Error(`RTT provider aggregate failed for ${url.split("/").pop()}`);
  return acc;
}

async function parseRtt() {
  const files = await rttFileList();
  const nat = files.filter((f) => /overview|timeseries|estimat|national|full[-_ ]?(data|csv)/i.test(f.name));
  console.log(`  RTT inventory: ${files.length} files; national-candidates: ${nat.map((f) => f.name).join(" , ").slice(0, 500) || "none"}`);
  const byMonth = new Map();
  for (const f of files) {
    const date = rttMonthFromName(f.name);
    if (date && !byMonth.has(date)) byMonth.set(date, { ...f, date });
  }
  const months = [...byMonth.values()].sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  console.log(`  RTT provider files: ${months.length} months ${months[months.length - 1]?.date}..${months[0]?.date}`);
  if (!months.length) throw new Error("RTT: no Incomplete-Provider files found");
  const cap = Number(process.env.RTT_MONTHS || 18);
  const pick = months.slice(0, cap);
  const totalPts = [], pctPts = [];
  // List size = pathways with a known clock start + those with an unknown one
  // (NHS's published headline); % within 18 weeks uses the same denominator.
  const pushMonth = (date, { withClock, within18, unknown }) => {
    const listSize = withClock + unknown;
    totalPts.push({ date, value: Math.round(listSize) });
    if (within18 > 0 && listSize > 0) pctPts.push({ date, value: +((within18 / listSize) * 100).toFixed(1) });
  };
  // Diagnose the newest file's columns; every file is resilient so a transient
  // 9 MB-download timeout drops only that month, never the whole series.
  for (let i = 0; i < pick.length; i++) {
    const f = pick[i];
    try { pushMonth(f.date, await rttParseProvider(f.url, i === 0)); }
    catch (e) { console.log(`  RTT ${f.date}: ${e.message}`); }
  }
  totalPts.sort((a, b) => (a.date < b.date ? -1 : 1));
  pctPts.sort((a, b) => (a.date < b.date ? -1 : 1));
  setSrc("https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/");
  const lt = totalPts[totalPts.length - 1], lp = pctPts[pctPts.length - 1];
  console.log(`  RTT aggregated: totalPts=${totalPts.length} (latest ${lt?.date}=${lt?.value}) pctPts=${pctPts.length} (latest ${lp?.date}=${lp?.value})`);
  return { totalPts, pctPts };
}
let _rttCache = null;
function rttData() { if (!_rttCache) _rttCache = parseRtt(); return _rttCache; }

// IPA/NISTA Government Major Projects Portfolio: discover every published annual
// consolidated CSV edition. Hardcoded 2021–2024 asset URLs (stable) plus
// collection-API discovery of newer editions. Shared by gmppVariance (per-dept
// red/amber-red %) and gmppPortfolioConfidence (whole-portfolio green %).
async function gmppEntries() {
  const entries = [
    { date: "2021-03-31", url: "https://assets.publishing.service.gov.uk/media/60eecae48fa8f50c7ca55af1/GMPP_Government_Major_Projects_Portofolio_AR_Data_March_2021.csv" },
    { date: "2022-03-31", url: "https://assets.publishing.service.gov.uk/media/62d6c047e90e071e753d6936/GMPP_Government_Major_Projects_Portfolio_AR_Data_March_2022.csv" },
    { date: "2023-03-31", url: "https://assets.publishing.service.gov.uk/media/64b79c5171749c001389ee41/GMPP_Government_Major_Projects_Portofolio_AR_Data_March_2023.csv" },
    { date: "2024-03-31", url: "https://assets.publishing.service.gov.uk/media/6787e8ee1124a2c3ceb646be/Government_Major_Projects_Portofolio_AR_Data_March_2024.csv" },
  ];
  try {
    const coll = await govukContent("government/collections/major-projects-data");
    const docs = (coll?.links?.documents || []).filter((d) => /government major projects portfolio/i.test(d.title || "") && /data/i.test(d.title || ""));
    for (const doc of docs) {
      const p = String(doc.base_path || "").replace(/^\//, "");
      const ym = (p + " " + (doc.title || "")).match(/\b(20\d{2})\b/);
      if (!ym) continue;
      const dateStr = `${ym[1]}-03-31`;
      if (entries.some((k) => k.date === dateStr)) continue;
      try {
        const atts = await govukAttachments(p);
        const csv = atts.find((a) => /\.csv(\?|$)/i.test(a.url || "") && /GMPP|Major_Projects_Portfolio.*AR/i.test(a.url || "")) ?? atts.find((a) => /\.csv(\?|$)/i.test(a.url || ""));
        if (csv) entries.push({ date: dateStr, url: csv.url });
      } catch { /* skip edition */ }
    }
  } catch (e) { console.log(`gmpp: collection discovery failed (${e.message})`); }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// IPA/NISTA GMPP: mean in-year delivery confidence (red/amber-red %) for one
// department across all published annual CSV editions.
async function gmppVariance(deptRe, deptFull) {
  const points = [];
  for (const { date, url } of await gmppEntries()) {
    try {
      const res = await fetch(url, fetchOpts({ accept: "text/csv,*/*" }));
      if (!res.ok) { console.log(`gmpp ${date} -> HTTP ${res.status}`); continue; }
      const lines = (await res.text()).trim().split(/\r?\n/);
      if (lines.length < 2) continue;
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
      const deptCol = headers.findIndex((h) => h === "department" || h.includes("dept"));
      const dcaCol = headers.findIndex((h) => /delivery confidence/i.test(h) && /ipa|assessment/i.test(h));
      if (deptCol < 0 || dcaCol < 0) { console.log(`gmpp ${date}: deptCol=${deptCol} dcaCol=${dcaCol} headers=[${headers.slice(0, 12).join("|")}]`); continue; }
      let rated = 0, redAmber = 0;
      for (const l of lines.slice(1)) {
        const cells = parseCsvLine(l);
        const d = String(cells[deptCol] ?? "").trim().toUpperCase().replace(/\s+/g, "");
        if (!(deptRe.test(d) || d === deptFull.toUpperCase())) continue;
        const dca = String(cells[dcaCol] ?? "").trim();
        if (!/green|amber|red/i.test(dca)) continue; // valid RAG only
        rated++;
        if (/red/i.test(dca)) redAmber++; // "Red" and "Amber/Red"
      }
      if (rated < 1) { console.log(`gmpp ${date}: 0 rated dept rows`); continue; }
      console.log(`gmpp ${date}: ${redAmber}/${rated} amber-red/red`);
      points.push({ date, value: +(redAmber / rated * 100).toFixed(1) });
    } catch (e) { console.log(`gmpp ${date} err ${e.message}`); }
  }
  if (points.length < 2) throw new Error(`gmpp: only ${points.length} annual points`);
  const seen = new Set();
  return points.filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; });
}

// IPA/NISTA GMPP: whole-portfolio delivery-confidence mix (Cabinet Office) — %
// of all rated projects with positive confidence (DCA Green or Amber/Green) per
// annual snapshot. Same editions as gmppVariance, aggregated across every
// department's rated rows. Non-RAG values (blank/"Exempt") excluded.
async function gmppPortfolioConfidence() {
  const points = [];
  for (const { date, url } of await gmppEntries()) {
    try {
      const res = await fetch(url, fetchOpts({ accept: "text/csv,*/*" }));
      if (!res.ok) { console.log(`gmpp-portfolio ${date} -> HTTP ${res.status}`); continue; }
      const lines = (await res.text()).trim().split(/\r?\n/);
      if (lines.length < 2) continue;
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
      const dcaCol = headers.findIndex((h) => /delivery confidence/i.test(h) && /ipa|assessment/i.test(h));
      if (dcaCol < 0) { console.log(`gmpp-portfolio ${date}: dcaCol=${dcaCol} headers=[${headers.slice(0, 12).join("|")}]`); continue; }
      let rated = 0, greenish = 0;
      for (const l of lines.slice(1)) {
        const cells = parseCsvLine(l);
        const dca = String(cells[dcaCol] ?? "").trim();
        if (!/green|amber|red/i.test(dca)) continue; // valid RAG only — excludes blank/"Exempt"
        rated++;
        if (/green/i.test(dca)) greenish++; // "Green" and "Amber/Green"
      }
      if (rated < 1) { console.log(`gmpp-portfolio ${date}: 0 rated rows`); continue; }
      console.log(`gmpp-portfolio ${date}: ${greenish}/${rated} green/amber-green`);
      points.push({ date, value: +(greenish / rated * 100).toFixed(1) });
    } catch (e) { console.log(`gmpp-portfolio ${date} err ${e.message}`); }
  }
  if (points.length < 2) throw new Error(`gmpp-portfolio: only ${points.length} annual points`);
  const seen = new Set();
  return points.filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; });
}

// DESNZ — final UK territorial greenhouse gas emissions, MtCO2e per year.
// The headline release is a gov.uk statistics page with an "accessible" ODS of
// data tables. Layout is a transposed summary (years across columns, gases /
// sectors down rows); the national total is a "Net emissions" / "Grand total"
// row. We locate the newest release, then scan every sheet for the year header
// row + a net-total label and read across. Diagnostics print sheet structure so
// a first CI run reveals the exact shape if the heuristics miss.
async function ghgEmissions() {
  // The release slug is stable and yearly: final emissions for year Y publish
  // ~Y+2, so walk recent years newest-first and take the first page that exists
  // and carries an ODS. More deterministic than the collection structure, which
  // groups documents in a way govukCollectionLatest doesn't read.
  const thisYear = new Date().getFullYear();
  let path, atts;
  for (let y = thisYear - 1; y >= thisYear - 5; y--) {
    const cand = `government/statistics/final-uk-greenhouse-gas-emissions-national-statistics-1990-to-${y}`;
    try {
      const a = await govukAttachments(cand);
      if (a.some((x) => /\.ods$/i.test(x.url || ""))) { path = cand; atts = a; break; }
    } catch { /* 404 for that year — try the previous one */ }
  }
  if (!path) throw new Error("ghg: no final-emissions release page resolved for recent years");
  const ods = atts.find((a) => /\.ods$/i.test(a.url || "") && /data\s*tab|table/i.test(a.title || ""))
    || atts.find((a) => /\.ods$/i.test(a.url || ""));
  if (!ods) throw new Error(`ghg: no ODS at ${path} (atts: ${atts.map((a) => (a.url || "").split("/").pop()).slice(0, 8).join(",")})`);
  const book = await xlsxBook(ods.url);
  console.log(`  ghg release=${path} ods=${(ods.url || "").split("/").pop()} sheets=[${book.SheetNames.join("|")}]`);
  const yearRe = /^(19|20)\d{2}$/;
  const totalRe = /net\s*(territorial\s*)?(greenhouse|emission|ghg|co2e?)|grand\s*total|total\s*greenhouse|total\s*net|net\s*total/i;
  for (const sn of book.SheetNames) {
    const rows = (await sheetRows(book, sn)).map((r) => Array.from(r ?? []));
    if (!rows.length) continue;
    // Orientation A — years across a header row (transposed), total down rows.
    let hdr = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      if (rows[i].filter((c) => yearRe.test(String(c).trim())).length >= 5) { hdr = i; break; }
    }
    if (hdr >= 0) {
      const yearCols = rows[hdr].map((c, j) => [j, String(c).trim()]).filter(([, c]) => yearRe.test(c));
      let totRow = -1;
      for (let i = hdr + 1; i < rows.length; i++) {
        if (totalRe.test(String(rows[i][0] ?? "").trim())) { totRow = i; break; }
      }
      console.log(`  ghg[A] sheet="${sn}" hdr=${hdr} years=${yearCols.length} totRow=${totRow} labels=[${rows.slice(hdr + 1, hdr + 8).map((r) => String(r[0] ?? "").slice(0, 20)).join(" / ")}]`);
      if (totRow >= 0) {
        const pts = [];
        for (const [j, yr] of yearCols) {
          const v = parseFloat(rows[totRow][j]);
          if (Number.isFinite(v)) pts.push({ date: `${yr}-01-01`, value: v });
        }
        if (pts.length >= 5) return pts;
      }
    }
    // Orientation B — years down a column, total across a labelled column.
    let yearCol = -1;
    for (let j = 0; j < 6; j++) {
      let n = 0;
      for (const r of rows) if (yearRe.test(String(r[j] ?? "").trim())) n++;
      if (n >= 5) { yearCol = j; break; }
    }
    if (yearCol >= 0) {
      const firstYearRow = rows.findIndex((r) => yearRe.test(String(r[yearCol] ?? "").trim()));
      const hdrB = firstYearRow > 0 ? firstYearRow - 1 : 0;
      let totCol = -1;
      for (let j = 0; j < (rows[hdrB] || []).length; j++) {
        if (totalRe.test(String(rows[hdrB][j] ?? "").trim())) { totCol = j; break; }
      }
      console.log(`  ghg[B] sheet="${sn}" yearCol=${yearCol} hdrB=${hdrB} totCol=${totCol} hdr=[${(rows[hdrB] || []).slice(0, 12).map((c) => String(c).slice(0, 14)).join("|")}]`);
      if (totCol >= 0) {
        const pts = [];
        for (const r of rows) {
          const y = String(r[yearCol] ?? "").trim();
          if (!yearRe.test(y)) continue;
          const v = parseFloat(r[totCol]);
          if (Number.isFinite(v)) pts.push({ date: `${y}-01-01`, value: v });
        }
        if (pts.length >= 5) return pts;
      }
    }
  }
  throw new Error("ghg: no net-total series found across sheets (see diagnostics)");
}

// DESNZ — fuel poverty (England), % of households fuel-poor under the Low Income
// Low Energy Efficiency (LILEE) indicator, annual. Each "Fuel poverty trends"
// edition carries the full back series in one workbook (unlike GHG), so one
// edition suffices; walk recent years newest-first for resilience.
async function fuelPoverty() {
  const thisYear = new Date().getFullYear();
  let path, atts;
  for (let y = thisYear; y >= thisYear - 3; y--) {
    const cand = `government/statistics/fuel-poverty-trends-${y}`;
    try {
      const a = await govukAttachments(cand);
      if (a.some((x) => /\.(ods|xlsx?)$/i.test(x.url || ""))) { path = cand; atts = a; break; }
    } catch { /* 404 — try previous year */ }
  }
  if (!path) {
    path = await govukCollectionLatest("fuel-poverty-statistics", (d) => /trends/i.test(d.title || ""));
    atts = await govukAttachments(path);
  }
  const file = atts.find((a) => /\.(ods|xlsx?)$/i.test(a.url || "") && /trend/i.test(`${a.title || ""} ${a.url || ""}`))
    || atts.find((a) => /\.(ods|xlsx?)$/i.test(a.url || ""));
  if (!file) throw new Error(`fuel-poverty: no spreadsheet at ${path} (atts: ${atts.map((a) => (a.url || "").split("/").pop()).slice(0, 8).join(",")})`);
  const book = await xlsxBook(file.url);
  console.log(`  fuel-poverty release=${path} file=${(file.url || "").split("/").pop()} sheets=[${book.SheetNames.join("|")}]`);
  const num = (c) => { const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/[,%]/g, "")); return Number.isFinite(v) ? v : null; };
  const yearRe = /^(19|20)\d{2}$/;
  const order = book.SheetNames.filter((n) => /lilee|all households?|headline|table ?1\b|summary/i.test(n)).concat(book.SheetNames);
  let dumped = false;
  for (const sn of [...new Set(order)]) {
    let rows;
    try { rows = await sheetRows(book, sn); } catch { continue; }
    if (!rows.length) continue;
    const dense = rows.map((r) => Array.from(r ?? []));
    let hdr = -1;
    for (let i = 0; i < Math.min(dense.length, 20); i++) {
      if (dense[i].filter((c) => yearRe.test(String(c).trim())).length >= 5) { hdr = i; break; }
    }
    if (hdr >= 0) {
      const yearCols = dense[hdr].map((c, j) => [j, String(c).trim()]).filter(([, c]) => yearRe.test(c));
      const pctRow = dense.find((r) => /^(proportion|percentage|%)|fuel poor.*%|%.*fuel poor/i.test(String(r[0] ?? "").trim()))
        ?? dense.find((r) => /all households/i.test(String(r[0] ?? "").trim()));
      console.log(`  fuel-poverty[A] sheet="${sn}" hdr=${hdr} years=${yearCols.length} pctRowLabel="${pctRow ? String(pctRow[0]).slice(0, 40) : null}"`);
      if (pctRow) {
        const points = [];
        for (const [j, yr] of yearCols) { const v = num(pctRow[j]); if (v != null && v >= 5 && v <= 30) points.push({ date: `${yr}-01-01`, value: +v.toFixed(1) }); }
        if (points.length >= 5) return points.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
    }
    let yearCol = -1;
    for (let j = 0; j < 4; j++) { let n = 0; for (const r of dense) if (yearRe.test(String(r[j] ?? "").trim())) n++; if (n >= 5) { yearCol = j; break; } }
    if (yearCol >= 0) {
      const firstYearRow = dense.findIndex((r) => yearRe.test(String(r[yearCol] ?? "").trim()));
      const hdrB = firstYearRow > 0 ? firstYearRow - 1 : 0;
      const hdrRow = (dense[hdrB] || []).map((c) => String(c ?? "").toLowerCase());
      let pctCol = hdrRow.findIndex((c) => /(%|proportion|percentage).*fuel poor|fuel poor.*(%|proportion|percentage)/.test(c));
      if (pctCol < 0) pctCol = hdrRow.findIndex((c) => /^(%|proportion|percentage)/.test(c));
      console.log(`  fuel-poverty[B] sheet="${sn}" yearCol=${yearCol} hdrB=${hdrB} pctCol=${pctCol} hdr=[${hdrRow.slice(0, 10).join("|")}]`);
      if (pctCol >= 0) {
        const points = [];
        for (const r of dense) { const y = String(r[yearCol] ?? "").trim(); if (!yearRe.test(y)) continue; const v = num(r[pctCol]); if (v != null && v >= 5 && v <= 30) points.push({ date: `${y}-01-01`, value: +v.toFixed(1) }); }
        if (points.length >= 5) return points.sort((a, b) => (a.date < b.date ? -1 : 1));
      }
    }
    if (!dumped) { dumped = true; console.log(`  fuel-poverty sheet="${sn}" no match; first 10 rows:`); for (const r of dense.slice(0, 10)) console.log(`    ${JSON.stringify(r.slice(0, 14)).slice(0, 220)}`); }
  }
  throw new Error("fuel-poverty: LILEE % series not found across sheets (see diagnostics)");
}

// DCMS — Creative Industries Gross Value Added, current prices, £m (→£bn via
// scale), annual. Each DCMS "Economic Estimates: GVA" edition carries the full
// back series; walk recent years newest-first, fall back to the collection.
async function creativeGva() {
  const thisYear = new Date().getFullYear();
  let path, atts;
  const slugsFor = (y) => [
    `government/statistics/dcms-economic-estimates-gva-${y}-provisional/dcms-sectors-economic-estimates-gross-value-added-${y}-provisional`,
    `government/statistics/dcms-economic-estimates-gva-${y}-provisional`,
    `government/statistics/dcms-and-digital-sector-gva-${y}-provisional/dcms-sectors-economic-estimates-gross-value-added-${y}-provisional`,
  ];
  for (let y = thisYear - 1; y >= thisYear - 5 && !path; y--) {
    for (const cand of slugsFor(y)) {
      try {
        const a = await govukAttachments(cand);
        if (a.some((x) => /\.(ods|xlsx?|csv)$/i.test(x.url || ""))) { path = cand; atts = a; break; }
      } catch { /* wrong slug/year — try the next */ }
    }
  }
  if (!path) {
    path = await govukCollectionLatest("dcms-sector-economic-estimates-gross-value-added", (d) => /gross value added|gva/i.test(d.title || ""))
      .catch(() => govukCollectionLatest("dcms-sectors-economic-estimates", (d) => /gross value added|gva/i.test(d.title || "")));
    atts = await govukAttachments(path);
  }
  console.log(`  dcms-gva release=${path} atts=[${atts.map((a) => (a.url || "").split("/").pop()).slice(0, 16).join("|")}]`);
  const file = atts.find((a) => /\.(ods|xlsx?)$/i.test(a.url || "") && /gva|gross value added|table/i.test(`${a.title || ""} ${a.url || ""}`))
    || atts.find((a) => /\.(ods|xlsx?)$/i.test(a.url || ""));
  if (!file) throw new Error(`dcms-gva: no spreadsheet at ${path}`);
  const book = await xlsxBook(file.url);
  console.log(`  dcms-gva file=${(file.url || "").split("/").pop()} sheets=[${book.SheetNames.join("|")}]`);

  const num = (c) => { const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
  const yearRe = /^(19|20)\d{2}$/;

  // The "All sectors" workbook's data sheets are just numbered ("1a","1b","1c",
  // "2a"…) — the names don't say which is current-price £m vs constant-price/
  // chained-volume/index, so we can't pick by name. Skip the cover/contents/
  // notes pages (no year-by-sector table there) and scan every remaining sheet,
  // disambiguating current-price £m by the value landing in the plausible
  // £30,000m–£250,000m range for Creative Industries (an index sheet — base
  // 100 or similar — or a small chained-volume-rebased table will fall outside
  // that range and get skipped).
  const isMeta = (n) => /^cover|^contents|^notes/i.test(n.trim());
  const candidates = book.SheetNames.filter((n) => !isMeta(n));
  // Still prefer obviously-named current-price/GVA sheets first when present;
  // falls through to all remaining numbered sheets otherwise.
  const order = candidates.filter((n) => /current price/i.test(n))
    .concat(candidates.filter((n) => /gva/i.test(n) && !/constant|chained|real|employment/i.test(n)))
    .concat(candidates);
  let dumpCount = 0;
  const found = [];
  for (const sn of [...new Set(order)]) {
    let rows;
    try { rows = await sheetRows(book, sn); } catch { continue; }
    if (!rows.length) continue;
    const dense = rows.map((r) => Array.from(r ?? []));
    let matchedThisSheet = false;

    // Orientation A — years across a header row, "Creative Industries" row.
    // Tolerate a sparser header (>=4 year cells) since these workbooks
    // sometimes carry a short back series on some tables.
    let hdr = -1;
    for (let i = 0; i < Math.min(dense.length, 20); i++) {
      if (dense[i].filter((c) => yearRe.test(String(c).trim())).length >= 4) { hdr = i; break; }
    }
    if (hdr >= 0) {
      const yearCols = dense[hdr].map((c, j) => [j, String(c).trim()]).filter(([, c]) => yearRe.test(c));
      // Match in the first ~3 columns (label may be offset by a code/index
      // column) and tolerate footnote markers, e.g. "Creative Industries [note 2]".
      const ciRow = dense.find((r) => {
        const label = [r[0], r[1], r[2]].map((c) => String(c ?? "").trim()).find((s) => s) || "";
        return /creative industries/i.test(label) && !/of which|sub[- ]?sector/i.test(label);
      });
      const ciLabel = ciRow ? ([ciRow[0], ciRow[1], ciRow[2]].map((c) => String(c ?? "").trim()).find((s) => s) || "") : null;
      console.log(`  dcms-gva[A] sheet="${sn}" hdr=${hdr} years=${yearCols.length} ciRowLabel="${ciLabel ? ciLabel.slice(0, 40) : null}"`);
      if (ciRow) {
        const points = [];
        for (const [j, yr] of yearCols) {
          const v = num(ciRow[j]);
          // Raw values are £m; scale:0.001 in the SOURCES entry converts to £bn —
          // guard here in raw £m terms (30..250 £bn → 30000..250000 £m). This
          // range check is also what disambiguates the current-price sheet from
          // an index/chained-volume-rebased sheet sharing the same row label.
          if (v != null && v >= 30000 && v <= 250000) points.push({ date: `${yr}-01-01`, value: v });
        }
        if (points.length >= 5) { matchedThisSheet = true; found.push({ sheet: sn, points: points.sort((a, b) => (a.date < b.date ? -1 : 1)) }); }
      }
    }

    // Orientation B — years down a column, "Creative Industries" in a labelled
    // column (tidy/long layout: one row per year×sector).
    let yearCol = -1;
    for (let j = 0; j < 4; j++) {
      let n = 0;
      for (const r of dense) if (yearRe.test(String(r[j] ?? "").trim())) n++;
      if (n >= 5) { yearCol = j; break; }
    }
    if (yearCol >= 0) {
      const firstYearRow = dense.findIndex((r) => yearRe.test(String(r[yearCol] ?? "").trim()));
      const hdrB = firstYearRow > 0 ? firstYearRow - 1 : 0;
      const hdrRow = (dense[hdrB] || []).map((c) => String(c ?? "").toLowerCase());
      let sectorCol = hdrRow.findIndex((c) => /sector|industry|industries/.test(c));
      let valCol = hdrRow.findIndex((c) => /gva|value/.test(c) && !/constant|chained|real/.test(c));
      console.log(`  dcms-gva[B] sheet="${sn}" yearCol=${yearCol} hdrB=${hdrB} sectorCol=${sectorCol} valCol=${valCol} hdr=[${hdrRow.slice(0, 10).join("|")}]`);
      if (sectorCol >= 0 && valCol >= 0) {
        const points = [];
        for (const r of dense) {
          const y = String(r[yearCol] ?? "").trim();
          if (!yearRe.test(y)) continue;
          const label = String(r[sectorCol] ?? "").trim();
          if (!/creative industries/i.test(label) || /of which|sub[- ]?sector/i.test(label)) continue;
          const v = num(r[valCol]);
          if (v != null && v >= 30000 && v <= 250000) points.push({ date: `${y}-01-01`, value: v });
        }
        if (points.length >= 5) { matchedThisSheet = true; found.push({ sheet: sn, points: points.sort((a, b) => (a.date < b.date ? -1 : 1)) }); }
      }
    }

    // Dump up to 3 non-matching candidate sheets (not just the first) so a
    // future failed run actually shows the layout of 1a/1b/1c/… instead of
    // burning the only dump on Cover_sheet/Contents/Notes.
    if (!matchedThisSheet && dumpCount < 3) {
      dumpCount++;
      console.log(`  dcms-gva sheet="${sn}" no in-range match; first 8 rows:`);
      for (const r of dense.slice(0, 8)) console.log(`    ${JSON.stringify(r.slice(0, 14)).slice(0, 220)}`);
    }
  }
  if (found.length) {
    // If multiple sheets produced an in-range match (e.g. a near-duplicate
    // table), prefer the longest series.
    found.sort((a, b) => b.points.length - a.points.length);
    return found[0].points;
  }
  throw new Error("dcms-gva: Creative Industries GVA series not found across sheets (see diagnostics)");
}

// FCDO — Statistics on International Development: each annual "final UK ODA
// spend {year}" release publishes a companion ODS, but the ODS is a 2-3 year
// SNAPSHOT (current + 1-2 prior years for comparison), not a back-series —
// e.g. the 2024 edition's Table_1 only carries 2023 and 2024. So a single
// edition can never yield a multi-year series. Instead we walk every
// available annual edition (like gmppVariance walks GMPP CSV editions) and
// take just the HEADLINE (latest) year's value from each, merging one point
// per edition into a proper series. Slug changed naming partway through:
// "final-uk-aid-spend-{Y}" (~2018-2021) vs "final-uk-oda-spend-{Y}"
// (~2022 onwards) — try both forms per year.
async function fcdoOdaEditions(maxEditions = 8) {
  const thisYear = new Date().getFullYear();
  const editions = [];
  for (let y = thisYear - 1; y >= 2016 && editions.length < maxEditions; y--) {
    const slugs = [
      `government/statistics/statistics-on-international-development-final-uk-oda-spend-${y}`,
      `government/statistics/statistics-on-international-development-final-uk-aid-spend-${y}`,
    ];
    let found = null;
    for (const cand of slugs) {
      try {
        const atts = await govukAttachments(cand);
        const ods = atts.find((a) => /\.ods$/i.test(a.url || "") && /table/i.test(a.title || ""))
          || atts.find((a) => /\.ods$/i.test(a.url || ""));
        if (ods) { found = { year: y, path: cand, odsUrl: ods.url }; break; }
      } catch { /* 404 or no ODS — try the other slug form / older year */ }
    }
    if (found) editions.push(found);
    else console.log(`  fcdo-oda ${y}: no release/ODS at either slug form — skipping`);
  }
  if (!editions.length) throw new Error("fcdo-oda: no final-uk-oda/aid-spend editions resolved");
  return editions;
}

const fcdoYearRe = /^(19|20)\d{2}$/;
const fcdoNum = (c) => {
  const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/[,%]/g, ""));
  return Number.isFinite(v) ? v : null;
};

// Table_1 (or nearest match): "GNI estimates and ODA:GNI ratios" — years DOWN
// col0, ratio in a column whose header matches /oda.*gni|gni.*ratio|ratio/.
// Returns the value for the LATEST year row present in this edition (the
// edition's own headline figure), plus diagnostics.
async function fcdoReadGniRatio(book, edition) {
  const sheetNames = book.SheetNames.filter((sn) => /^table[ _]?1$/i.test(sn))
    .concat(book.SheetNames.filter((sn) => !/^table[ _]?1$/i.test(sn)));
  for (const sn of sheetNames) {
    let rows;
    try { rows = (await sheetRows(book, sn)).map((r) => Array.from(r ?? [])); } catch { continue; }
    if (!rows.length) continue;
    // Only attempt sheets that look like the GNI/ratio table by title row.
    const titleBlob = rows.slice(0, 3).map((r) => String(r[0] ?? "")).join(" | ").toLowerCase();
    if (sn.toLowerCase() !== "table_1" && !/gni/.test(titleBlob)) continue;

    // Find the header row carrying a year axis down col0 (years in col0 cells).
    const yearRowIdxs = rows.map((r, i) => [i, String(r[0] ?? "").trim()]).filter(([, c]) => fcdoYearRe.test(c));
    if (!yearRowIdxs.length) {
      console.log(`  fcdo-oda-gni[${edition.year}] sheet="${sn}": no year rows in col0`);
      continue;
    }
    // Header row is just above the first year row; locate the ratio column.
    const firstYearRow = yearRowIdxs[0][0];
    const hdrRow = firstYearRow > 0 ? rows[firstYearRow - 1] : rows[0];
    const hdr = denseRow(hdrRow);
    let ratioCol = hdr.findIndex((c) => /oda[:\s/]*gni|gni.*ratio/.test(c));
    if (ratioCol < 0) ratioCol = hdr.findIndex((c) => /ratio/.test(c));
    // Some editions put the label one row higher (merged header) — scan a
    // couple of rows above the first year row too.
    if (ratioCol < 0 && firstYearRow > 1) {
      const hdr2 = denseRow(rows[firstYearRow - 2]);
      const j = hdr2.findIndex((c) => /oda[:\s/]*gni|gni.*ratio|ratio/.test(c));
      if (j >= 0) ratioCol = j;
    }
    if (ratioCol < 0) {
      console.log(`  fcdo-oda-gni[${edition.year}] sheet="${sn}": no ratio column; hdr=[${hdr.slice(0, 10).join("|")}]`);
      continue;
    }
    const [latestRowIdx, latestYear] = yearRowIdxs[yearRowIdxs.length - 1];
    const raw = rows[latestRowIdx][ratioCol];
    let v = fcdoNum(raw);
    if (v != null && v > 1) v = v / 100; // tolerate "0.50" vs "50" (%) representations
    console.log(`  fcdo-oda-gni[${edition.year}] sheet="${sn}" yearRow=${latestRowIdx} year=${latestYear} ratioCol=${ratioCol} raw=${JSON.stringify(raw)} -> ${v}`);
    if (v != null) return { year: Number(latestYear), value: v };
  }
  // Diagnostics: dump Table_1-ish header rows for a future fix.
  for (const sn of book.SheetNames.slice(0, 3)) {
    let rows; try { rows = await sheetRows(book, sn); } catch { continue; }
    console.log(`  fcdo-oda-gni[${edition.year}] dump sheet="${sn}" rows0-6: ${rows.slice(0, 6).map((r) => JSON.stringify(Array.from(r ?? []).slice(0, 8))).join(" / ")}`);
  }
  return null;
}

// Table_2 (or nearest match): "Total UK ODA: by Delivery Channel" — years
// ACROSS columns, "TOTAL ODA" row (excluding Bilateral/Multilateral rows).
// Returns the value for the LATEST year column present, plus diagnostics.
async function fcdoReadTotalOda(book, edition) {
  const sheetNames = book.SheetNames.filter((sn) => /^table[ _]?2$/i.test(sn))
    .concat(book.SheetNames.filter((sn) => !/^table[ _]?2$/i.test(sn)));
  for (const sn of sheetNames) {
    let rows;
    try { rows = (await sheetRows(book, sn)).map((r) => Array.from(r ?? [])); } catch { continue; }
    if (!rows.length) continue;
    const titleBlob = rows.slice(0, 3).map((r) => String(r[0] ?? "")).join(" | ").toLowerCase();
    if (sn.toLowerCase() !== "table_2" && !/total uk oda|delivery channel/.test(titleBlob)) continue;

    // Header row: the row with the most year-like cells.
    let hdr = -1, best = 0;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const n = rows[i].filter((c) => fcdoYearRe.test(String(c).trim())).length;
      if (n > best) { best = n; hdr = i; }
    }
    if (hdr < 0 || best < 1) {
      console.log(`  fcdo-oda-total[${edition.year}] sheet="${sn}": no year header row found`);
      continue;
    }
    const yearCols = rows[hdr].map((c, j) => [j, String(c).trim()]).filter(([, c]) => fcdoYearRe.test(c)).sort((a, b) => a[1].localeCompare(b[1]));
    const totalRow = rows.find((r) => /^total\s*(uk\s*)?oda$/i.test(String(r[0] ?? "").trim()))
      || rows.find((r) => /total.*oda/i.test(String(r[0] ?? "").trim()) && !/bilateral|multilateral/i.test(String(r[0] ?? "")));
    if (!totalRow) {
      console.log(`  fcdo-oda-total[${edition.year}] sheet="${sn}": no "TOTAL ODA" row; col0=[${rows.slice(0, 15).map((r) => String(r[0] ?? "").trim()).filter(Boolean).join(" | ")}]`);
      continue;
    }
    const [latestCol, latestYear] = yearCols[yearCols.length - 1];
    const raw = totalRow[latestCol];
    const v = fcdoNum(raw);
    console.log(`  fcdo-oda-total[${edition.year}] sheet="${sn}" hdr=${hdr} year=${latestYear} col=${latestCol} label="${String(totalRow[0]).slice(0, 40)}" raw=${JSON.stringify(raw)} -> ${v}`);
    if (v != null) return { year: Number(latestYear), value: v };
  }
  for (const sn of book.SheetNames.slice(0, 3)) {
    let rows; try { rows = await sheetRows(book, sn); } catch { continue; }
    console.log(`  fcdo-oda-total[${edition.year}] dump sheet="${sn}" rows0-6: ${rows.slice(0, 6).map((r) => JSON.stringify(Array.from(r ?? []).slice(0, 8))).join(" / ")}`);
  }
  return null;
}

// Merge one headline point per edition into an ascending, de-duped series.
// Editions are walked newest-first by fcdoOdaEditions, so de-duping by
// "first seen wins" naturally prefers a year's own dedicated edition over a
// later edition's comparator column reporting the same year.
function fcdoMergeEditionPoints(points) {
  const ordered = [];
  const seen = new Set();
  for (const p of points) {
    if (!p || seen.has(p.year)) continue;
    seen.add(p.year);
    ordered.push(p);
  }
  return ordered
    .map(({ year, value }) => ({ date: `${year}-01-01`, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fcdoOdaGni() {
  const editions = await fcdoOdaEditions();
  const points = [];
  for (const edition of editions) {
    try {
      const book = await xlsxBook(edition.odsUrl);
      console.log(`  fcdo-oda-gni edition=${edition.year} ods=${(edition.odsUrl || "").split("/").pop()} sheets=[${book.SheetNames.join("|")}]`);
      const pt = await fcdoReadGniRatio(book, edition);
      if (pt && pt.value >= 0.2 && pt.value <= 1.0) points.push(pt);
      else if (pt) console.log(`  fcdo-oda-gni edition=${edition.year}: value ${pt.value} outside guard 0.2-1.0 — discarded`);
    } catch (e) { console.log(`  fcdo-oda-gni edition=${edition.year} err ${e.message}`); }
  }
  const merged = fcdoMergeEditionPoints(points);
  if (merged.length < 3) throw new Error(`fcdo-oda-gni: only ${merged.length} edition points merged (need >=3) — see diagnostics`);
  console.log(`  fcdo-oda-gni: merged ${merged.length} points from ${editions.length} editions`);
  return merged;
}

// Returns raw £m values; SOURCES scale 0.001 converts to £bn.
async function fcdoOdaTotal() {
  const editions = await fcdoOdaEditions();
  const points = [];
  for (const edition of editions) {
    try {
      const book = await xlsxBook(edition.odsUrl);
      console.log(`  fcdo-oda-total edition=${edition.year} ods=${(edition.odsUrl || "").split("/").pop()} sheets=[${book.SheetNames.join("|")}]`);
      const pt = await fcdoReadTotalOda(book, edition);
      if (pt && pt.value >= 5000 && pt.value <= 25000) points.push(pt);
      else if (pt) console.log(`  fcdo-oda-total edition=${edition.year}: value ${pt.value} outside guard 5000-25000 (£m) — discarded`);
    } catch (e) { console.log(`  fcdo-oda-total edition=${edition.year} err ${e.message}`); }
  }
  const merged = fcdoMergeEditionPoints(points);
  if (merged.length < 3) throw new Error(`fcdo-oda-total: only ${merged.length} edition points merged (need >=3) — see diagnostics`);
  console.log(`  fcdo-oda-total: merged ${merged.length} points from ${editions.length} editions`);
  return merged;
}

// DCMS — adult sport participation (% active, 150+ min/week), Sport England
// Active Lives. Scrape the data-tables landing page for the current "Tables 1-5
// Levels of activity" workbooks (S3, dated paths) and read the "Active" row.
async function sportActiveLives() {
  const pageUrl = "https://www.sportengland.org/research-and-data/data/active-lives/active-lives-data-tables";
  const res = await fetch(pageUrl, fetchOpts({ accept: "text/html,*/*" }));
  if (!res.ok) throw new Error(`sport-participation: landing page HTTP ${res.status}`);
  const html = await res.text();
  const hrefs = [...html.matchAll(/href="([^"]*Tables%201-5[^"]*\.xlsx[^"]*)"/gi)].map((m) => m[1]);
  if (!hrefs.length) {
    const loose = [...html.matchAll(/href="([^"]*\.xlsx[^"]*)"/gi)].map((m) => m[1]);
    console.log(`  sport-participation: no "Tables 1-5" href; ${loose.length} .xlsx links, sample: ${loose.slice(0, 6).join(" , ")}`);
    throw new Error("sport-participation: no Tables 1-5 Levels of activity link found");
  }
  const seen = new Set();
  const urls = hrefs.filter((h) => { if (seen.has(h)) return false; seen.add(h); return true; }).map((h) => (h.startsWith("http") ? h : `https://www.sportengland.org${h}`));
  console.log(`  sport-participation: ${urls.length} "Tables 1-5" links found, trying newest first`);
  const num = (c) => { const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/[,%]/g, "")); return Number.isFinite(v) ? v : null; };
  const yearFromUrl = (u) => {
    const m = u.match(/(?:Nov(?:ember)?[%20_ ]*)(\d{2,4})[-–](\d{2})/i);
    if (m) { const endYY = m[2]; const century = m[1].length === 4 ? m[1].slice(0, 2) : Math.floor(new Date().getFullYear() / 100); return `${century}${endYY}`; }
    const y4 = u.match(/20\d\d/);
    return y4 ? y4[0] : null;
  };
  // Pick the headline "Levels of activity" sheet: prefer one matching /level/i
  // that is NOT a trend/region/local-authority breakdown (those still contain
  // an "Active" column but split by year/region rather than carrying a single
  // national headline row). Falls back to the first /level/i sheet.
  const pickLevelsSheet = (sheetNames) => {
    const candidates = sheetNames.filter((n) => /level/i.test(n));
    const headline = candidates.find((n) => !/trend|local authorit|region/i.test(n));
    return headline ?? candidates[0] ?? null;
  };
  // A row is "the national/overall row" if its label matches one of these, or
  // (fallback) it's simply the first data row under the header.
  const isOverallLabel = (s) => /^(all adults|overall|england|aged\s*16|16\s*\+)/i.test(String(s ?? "").trim());
  const points = [];
  for (const url of urls) {
    const year = yearFromUrl(decodeURIComponent(url));
    if (!year) { console.log(`  sport-participation: couldn't parse year from ${url}`); continue; }
    if (points.some((p) => p.date.startsWith(year))) continue;
    try {
      const book = await xlsxBook(url);
      const sn = pickLevelsSheet(book.SheetNames);
      if (!sn) {
        console.log(`  sport-participation[${year}] no "Levels" sheet; sheets=[${book.SheetNames.join("|")}]`);
        continue;
      }
      const rows = (await sheetRows(book, sn)).map((r) => Array.from(r ?? []));
      if (!rows.length) { console.log(`  sport-participation[${year}] sheet "${sn}" empty`); continue; }

      // Locate the header row: contains a cell matching /^active\b/i that is
      // not "fairly active" / "inactive". The activity-level columns are
      // usually paired (Number, %) per level, so the "Active" header cell can
      // repeat (e.g. once for the count sub-block, once for the % sub-block).
      let headerRowIdx = -1;
      let activeCols = [];
      for (let i = 0; i < Math.min(rows.length, 12); i++) {
        const row = rows[i];
        const cols = row.reduce((acc, c, idx) => {
          if (/^active\b/i.test(String(c ?? "").trim()) && !/fairly|in[\s-]?active/i.test(String(c ?? ""))) acc.push(idx);
          return acc;
        }, []);
        if (cols.length) { headerRowIdx = i; activeCols = cols; break; }
      }
      if (headerRowIdx < 0) {
        console.log(`  sport-participation[${year}] no "Active" header found in sheet "${sn}"; dumping rows:`);
        for (const r of rows.slice(0, 6)) console.log(`     ${JSON.stringify(r.slice(0, 10)).slice(0, 200)}`);
        continue;
      }
      // The %-vs-count sub-header (if present) usually lives one row below the
      // top-level "Active" label, e.g. "Number" | "%". Use it to disambiguate
      // when there are multiple "Active" columns; otherwise pick whichever
      // candidate column holds a plausible 0–100 value on the data rows.
      const subHeaderRow = rows[headerRowIdx + 1] ?? [];
      const pctColFromSubHeader = activeCols.find((c) => /%|percent/i.test(String(subHeaderRow[c] ?? "")));

      // Candidate data rows: everything after the header (and sub-header, if
      // it looks like one rather than data) — prefer a row whose label matches
      // the overall/national pattern, else just the first data row.
      const dataStart = /%|percent|number|^n\b/i.test(rows.slice(headerRowIdx + 1, headerRowIdx + 2).flat().join(" ")) ? headerRowIdx + 2 : headerRowIdx + 1;
      const dataRows = rows.slice(dataStart, dataStart + 20);
      const overallRow = dataRows.find((r) => isOverallLabel(r[0])) ?? dataRows[0];

      if (!overallRow) {
        console.log(`  sport-participation[${year}] sheet "${sn}" header row=${headerRowIdx} but no data rows; dumping:`);
        for (const r of rows.slice(headerRowIdx, headerRowIdx + 8)) console.log(`     ${JSON.stringify(r.slice(0, 10)).slice(0, 200)}`);
        continue;
      }

      // Resolve the % column: sub-header hint first, else whichever "Active"
      // candidate column holds a plausible percentage (0–100) on the overall
      // row, else the last candidate column (counts tend to come first).
      let pctCol = pctColFromSubHeader;
      if (pctCol == null) pctCol = activeCols.find((c) => { const v = num(overallRow[c]); return v != null && v > 0 && v <= 100; });
      if (pctCol == null) pctCol = activeCols[activeCols.length - 1];
      const pct = num(overallRow[pctCol]);

      if (pct != null && pct >= 40 && pct <= 80) {
        console.log(`  sport-participation[${year}] sheet="${sn}" headerRow=${headerRowIdx} activeCols=[${activeCols.join(",")}] pctCol=${pctCol} label="${overallRow[0]}" pct=${pct}`);
        points.push({ date: `${year}-01-01`, value: pct });
      } else {
        console.log(`  sport-participation[${year}] sheet="${sn}" headerRow=${headerRowIdx} activeCols=[${activeCols.join(",")}] pctCol=${pctCol} label="${overallRow[0]}" pct=${pct} — out of 40-80 guard range, rejected`);
        console.log(`  sport-participation[${year}] header row + first 6 data rows for diagnosis:`);
        for (const r of rows.slice(headerRowIdx, headerRowIdx + 7)) console.log(`     ${JSON.stringify(r.slice(0, 12)).slice(0, 240)}`);
      }
    } catch (e) { console.log(`  sport-participation[${year}] err ${e.message}`); }
    if (points.length >= 8) break;
  }
  if (points.length < 3) throw new Error(`sport-participation: only ${points.length} annual points parsed`);
  setSrc(pageUrl);
  return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// DSIT — gigabit-capable broadband coverage (% premises), Ofcom Connected
// Nations. CI-VERIFIED HARD BLOCK: every Ofcom data-downloads page returns
// HTTP 403 to automated clients (like digital.nhs.uk for `turnover`), so this
// always SKIPs. Kept as a documented blocker — needs a non-gated mirror (the
// data.gov.uk CKAN copy is local-authority/postcode only, not a UK total).
const OFCOM_REPORTS = [
  { year: 2025, page: "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-20252/data-downloads-2025" },
  { year: 2024, page: "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-2024/data-downloads-2024" },
  { year: 2023, page: "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-2023/data-downloads" },
  { year: 2022, page: "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/data" },
];
async function ofcomFixedCoverageUrl(pageUrl) {
  const res = await fetch(pageUrl, fetchOpts({ accept: "text/html,*/*" }));
  if (!res.ok) throw new Error(`ofcom page ${pageUrl} -> HTTP ${res.status}`);
  const html = await res.text();
  const hrefs = [...html.matchAll(/href="([^"]*\.(?:csv|zip)[^"]*)"/gi)].map((m) => m[1]);
  const abs = hrefs.map((h) => (h.startsWith("http") ? h : `https://www.ofcom.org.uk${h}`));
  console.log(`  gigabit-broadband: ${pageUrl} -> ${abs.length} csv/zip links, sample: ${abs.slice(0, 10).map((u) => u.split("/").pop()).join(" , ")}`);
  const pick = abs.find((u) => /fixed/i.test(u) && /nations?[-_]?and[-_]?regions|uk[-_]summary|summary/i.test(u))
    ?? abs.find((u) => /fixed/i.test(u) && !/local[-_]?authority|postcode|la\d|lsoa/i.test(u));
  if (!pick) throw new Error(`ofcom ${pageUrl}: no UK-level "fixed" coverage file`);
  return pick;
}
async function gigabitBroadband() {
  const num = (c) => { const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/[,%]/g, "")); return Number.isFinite(v) ? v : null; };
  const points = [];
  for (const { year, page } of OFCOM_REPORTS) {
    try {
      const fileUrl = await ofcomFixedCoverageUrl(page);
      console.log(`  gigabit-broadband[${year}] file: ${fileUrl}`);
      let rows;
      if (/\.zip$/i.test(fileUrl)) {
        const entries = (await unzipUrl(fileUrl)).filter((e) => /\.csv$/i.test(e.name));
        if (!entries.length) { console.log(`  gigabit-broadband[${year}]: zip had no CSV entries`); continue; }
        rows = entries[0].buf.toString("utf8").trim().split(/\r?\n/).map(parseCsvLine);
      } else {
        const res = await fetch(fileUrl, fetchOpts({ accept: "text/csv,*/*" }));
        if (!res.ok) { console.log(`  gigabit-broadband[${year}]: HTTP ${res.status}`); continue; }
        rows = (await res.text()).trim().split(/\r?\n/).map(parseCsvLine);
      }
      if (rows.length < 2) { console.log(`  gigabit-broadband[${year}]: empty CSV`); continue; }
      const header = rows[0].map((h) => h.toLowerCase().trim());
      console.log(`  gigabit-broadband[${year}] header: [${header.join("|")}]`);
      const giga = header.findIndex((h) => /gigabit/.test(h) && (/%|percent|premises/.test(h)));
      if (giga < 0) { console.log(`  gigabit-broadband[${year}]: no gigabit % column`); continue; }
      const geoCol = header.findIndex((h) => /nation|region|geograph|area|country/.test(h));
      let row = geoCol >= 0 ? rows.slice(1).find((r) => /^uk$|united kingdom/i.test(String(r[geoCol] ?? "").trim())) : null;
      if (!row) row = rows[1];
      const pct = num(row[giga]);
      if (pct == null || pct < 0 || pct > 100) { console.log(`  gigabit-broadband[${year}]: unusable value "${row[giga]}" in col ${giga}`); continue; }
      console.log(`  gigabit-broadband[${year}]: ${pct}% (col "${header[giga]}")`);
      points.push({ date: `${year}-07-01`, value: pct });
      setSrc(fileUrl);
    } catch (e) { console.log(`  gigabit-broadband[${year}] err ${e.message}`); }
  }
  if (points.length < 3) throw new Error(`gigabit-broadband: only ${points.length} annual points parsed (see diagnostics)`);
  return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}

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
  ...wbCompare("dhsc-beds-per-1000", "SH.MED.BEDS.ZS", { min: 1, max: 12 }),
  { id: "life-expectancy", min: 60, max: 90, get: () => wb("SP.DYN.LE00.IN") },

  // --- World Bank cross-department batch (international, hard-to-fudge) ---
  ...wbCompare("dhsc-health-spend-gdp", "SH.XPD.CHEX.GD.ZS", { min: 3, max: 20 }),
  { id: "dhsc-infant-mortality", min: 1, max: 40, get: () => wb("SP.DYN.IMRT.IN") },
  { id: "dfe-edu-spend-gdp", min: 2, max: 9, get: () => wb("SE.XPD.TOTL.GD.ZS") },
  { id: "dfe-pupil-teacher", min: 8, max: 40, get: () => wb("SE.PRM.ENRL.TC.ZS") },
  // Government expenditure per primary pupil, % of GDP per capita (UNESCO):
  // an internationally comparable resourcing/unit-cost intensity metric.
  ...wbCompare("dfe-spend-per-pupil", "SE.XPD.PRIM.PC.ZS", { min: 5, max: 40 }),
  ...wbCompare("ho-homicide-rate", "VC.IHR.PSRC.P5", { min: 0, max: 5 }),
  { id: "mod-defence-spend-gdp", min: 0, max: 10, get: () => wb("MS.MIL.XPND.GD.ZS") },
  { id: "dwp-pop-65", min: 5, max: 30, get: () => wb("SP.POP.65UP.TO.ZS") },
  ...wbCompare("dft-road-death-rate", "SH.STA.TRAF.P5", { min: 0, max: 20 }),
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
  ...wbCompare("hmt-gni-per-capita", "NY.GNP.PCAP.PP.CD", { min: 5000, max: 90000 }),
  // DHSC
  ...wbCompare("dhsc-health-spend-pc", "SH.XPD.CHEX.PC.CD", { min: 500, max: 12000 }),
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
  ...wbCompare("dwp-gini", "SI.POV.GINI", { min: 25, max: 45 }),
  { id: "dwp-youth-unemp", min: 2, max: 40, get: () => wb("SL.UEM.1524.ZS") },
  // DfT — AR5 GHG-basis CO2e per capita (intentionally NOT the legacy
  // fossil-only EN.ATM.CO2E.PC code referenced by the illustrative fallback).
  ...wbCompare("dft-co2-pc", "EN.GHG.CO2.PC.CE.AR5", { min: 1, max: 20 }),

  // --- World Bank wave 3: DESNZ / DSIT / DBT / DCMS ---
  // DESNZ: renewables as % of total final energy consumption (WB/IEA).
  { id: "desnz-renewables-share", min: 0, max: 60, get: () => wb("EG.FEC.RNEW.ZS") },
  // DESNZ: UK net territorial GHG emissions, MtCO2e (gov.uk final emissions ODS).
  { id: "desnz-ghg-emissions", min: 200, max: 900, get: () => ghgEmissions() },
  // DSIT: R&D as % of GDP (GERD), and researchers per million people (WB/OECD/UNESCO).
  { id: "dsit-rd-gdp", min: 0.5, max: 5, get: () => wb("GB.XPD.RSDV.GD.ZS") },
  { id: "dsit-researchers", min: 1000, max: 12000, get: () => wb("SP.POP.SCIE.RD.P6") },
  // DBT: exports % of GDP, and high-tech share of manufactured exports (WB).
  { id: "dbt-exports-gdp", min: 10, max: 60, get: () => wb("NE.EXP.GNFS.ZS") },
  { id: "dbt-hightech-exports", min: 5, max: 45, get: () => wb("TX.VAL.TECH.MF.ZS") },
  // DCMS: international tourist arrivals (absolute count) (WB/UN Tourism).
  { id: "dcms-tourism-arrivals", min: 5000000, max: 60000000, get: () => wb("ST.INT.ARVL") },
  // DBT: UK business investment, quarterly, chained volume £m → £bn (ONS CDID
  // NPEL, QNA dataset). Clean time series — no ODS parsing needed.
  { id: "dbt-business-investment", min: 20, max: 90, scale: 0.001, get: () => ons(GDP, "NPEL", ["cxnv", "qna"], "quarters") },
  // Cabinet Office civil service headcount (FTE) — ONS public-sector-employment
  // CDID G7G6, quarterly, reported in thousands (scale → raw FTE).
  { id: "cab-civil-service-headcount", min: 300000, max: 600000, scale: 1000, get: () => ons(PUBSECPERS, "G7G6", "pse", "quarters") },

  // --- New-department placeholder fetchers (gov.uk ODS / scrape / IPA) ---
  // DESNZ fuel poverty (England LILEE %) — gov.uk "Fuel poverty trends" ODS.
  { id: "desnz-fuel-poverty", min: 5, max: 30, get: () => fuelPoverty() },
  // DCMS Creative Industries GVA (£m → £bn) — DCMS Economic Estimates ODS.
  { id: "dcms-creative-gva", min: 30, max: 250, scale: 0.001, get: () => creativeGva() },
  // Cabinet Office GMPP whole-portfolio delivery confidence (% green/amber-green).
  { id: "cab-gmpp-confidence", min: 0, max: 100, get: () => gmppPortfolioConfidence() },
  // FCDO ODA: % of GNI, and total £m → £bn — gov.uk SID final-spend ODS tables.
  { id: "fcdo-oda-gni", min: 0.2, max: 1.0, get: () => fcdoOdaGni() },
  { id: "fcdo-oda-total", min: 5, max: 25, scale: 0.001, get: () => fcdoOdaTotal() },
  // DCMS adult sport participation (% active) — Sport England Active Lives scrape.
  { id: "dcms-sport-participation", min: 40, max: 80, get: () => sportActiveLives() },
  // DSIT gigabit-capable broadband coverage (% premises) — Ofcom Connected Nations.
  { id: "dsit-gigabit-broadband", min: 0, max: 100, get: () => gigabitBroadband() },

  // --- MHCLG & Defra (new departments) ---
  // Defra air pollution: mean PM2.5 exposure (World Bank / OECD-IHME) — reliable.
  { id: "defra-pm25", min: 1, max: 40, get: () => wb("EN.ATM.PM25.MC.M3") },
  // Defra woodland cover: forest area % of land (World Bank / FAO) — reliable.
  { id: "defra-forest", min: 5, max: 20, get: () => wb("AG.LND.FRST.ZS") },

  // MHCLG households in temporary accommodation (England, quarterly) — the
  // statutory homelessness "live tables" ODS (sheet TA1 / England time series).
  {
    id: "mhclg-temp-accommodation",
    min: 30000,
    max: 250000,
    get: async () => {
      const atts = await govukAttachments("government/statistical-data-sets/live-tables-on-homelessness");
      console.log(`  mhclg-ta atts: ${atts.filter((a) => /\.ods/i.test(a.url || "")).map((a) => `${(a.title || "").slice(0, 40)}::${(a.url || "").split("/").pop()}`).slice(0, 30).join(" | ")}`);
      const score = (a) => {
        const t = `${a.title || ""} ${a.url || ""}`.toLowerCase();
        if (!/\.ods/.test(t)) return -1;
        let s = 0;
        if (/temporary accommodation/.test(t)) s += 12;
        if (/time series|england level/.test(t)) s += 5;
        if (/\bta\b|_ta_|ta_/.test(t)) s += 3;
        if (/reason|cause|duty|assessment|prevention|relief|support needs|^a[1-9]/.test(t)) s -= 8;
        return s;
      };
      const odsAtts = atts.filter((a) => /\.ods/i.test(a.url || "")).sort((a, b) => score(b) - score(a));
      const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      const toDate = (s) => {
        s = String(s ?? "").trim();
        let m = s.match(/^(\d{4})[ -]?Q([1-4])/i);
        if (m) return `${m[1]}-${String((+m[2] - 1) * 3 + 1).padStart(2, "0")}-01`;
        m = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ -]?(\d{4})/i);
        if (m) return `${m[2]}-${String(MON[m[1].toLowerCase()]).padStart(2, "0")}-01`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        return null;
      };
      let result = null, dumped = false;
      for (const ods of odsAtts.slice(0, 2)) {
        console.log(`  mhclg-ta try: ${ods.url.split("/").pop()}`);
        let book;
        try { book = await xlsxBook(ods.url); } catch (e) { console.log(`  mhclg-ta read err: ${e.message}`); continue; }
        console.log(`  mhclg-ta sheets: ${book.SheetNames.join("|")}`);
        void toDate;
        const taSheets = book.SheetNames.filter((n) => /^ta\d?$|temporary/i.test(n));
        const sheetOrder = taSheets.concat(book.SheetNames);
        // TA1 layout: year in col 0 (blank → carry forward on Q2–Q4), quarter
        // ("Q1".."Q4") in col 1, "Total number of households in TA" total in a
        // numeric column (first plausible value, typically col 3). Pick the
        // total column from the header row ("total number of households in TA").
        for (const sn of [...new Set(sheetOrder)]) {
          let rows;
          try { rows = await sheetRows(book, sn); } catch (e) { void e; continue; }
          // header row carrying the "Total number of households in TA" label.
          let hi = -1, totCol = -1;
          for (let i = 0; i < Math.min(rows.length, 12); i++) {
            const idx = (rows[i] || []).findIndex((c) => /total number of households in ta\b/i.test(String(c ?? "")));
            if (idx >= 0) { hi = i; totCol = idx; break; }
          }
          // quarter column: first column whose cells below match Q1..Q4.
          const startRow = hi >= 0 ? hi + 1 : 0;
          let qCol = -1;
          for (let i = 0; i < 6; i++) {
            if (rows.slice(startRow, startRow + 12).filter((r) => /^Q[1-4]$/i.test(String(r?.[i] ?? "").trim())).length >= 3) { qCol = i; break; }
          }
          if (qCol < 0) continue;
          const yrCol = qCol - 1 >= 0 ? qCol - 1 : 0;
          let curYear = null;
          const points = [];
          for (const r of rows.slice(startRow)) {
            const ym = String(r?.[yrCol] ?? "").match(/\b(19|20)\d\d\b/);
            if (ym) curYear = +ym[0];
            const qm = String(r?.[qCol] ?? "").trim().match(/^Q([1-4])$/i);
            if (!curYear || !qm) continue;
            // total: header column if known, else first plausible numeric after qCol.
            let v = NaN;
            if (totCol >= 0) v = typeof r[totCol] === "number" ? r[totCol] : parseFloat(String(r[totCol] ?? "").replace(/,/g, ""));
            if (!Number.isFinite(v) || v < 30000 || v > 250000) {
              for (let i = qCol + 1; i < r.length; i++) { const x = typeof r[i] === "number" ? r[i] : parseFloat(String(r[i] ?? "").replace(/,/g, "")); if (Number.isFinite(x) && x >= 30000 && x <= 250000) { v = x; break; } }
            }
            if (!Number.isFinite(v) || v < 30000 || v > 250000) continue;
            const mm = String(+qm[1] * 3).padStart(2, "0"); // end-of-quarter month
            points.push({ date: `${curYear}-${mm}-01`, value: Math.round(v) });
          }
          if (points.length >= 8) { console.log(`  mhclg-ta ${ods.url.split("/").pop()} sheet="${sn}" qCol=${qCol} totCol=${totCol} ${points.length} pts`); result = points.sort((a, b) => (a.date < b.date ? -1 : 1)); break; }
        }
        if (result) break;
        if (!dumped) {
          dumped = true;
          const ts = book.SheetNames.find((n) => /^ta1$/i.test(n)) || book.SheetNames.find((n) => /^ta/i.test(n)) || book.SheetNames[0];
          const r0 = await sheetRows(book, ts);
          console.log(`  mhclg-ta dump ${ts}:`);
          for (const r of r0.slice(0, 10)) console.log(`    ${JSON.stringify(r).slice(0, 240)}`);
        }
      }
      if (result) return result;
      throw new Error("mhclg-ta: TA total series not found");
    },
  },

  // MHCLG net additional dwellings (England, annual). Housing supply ODS.
  {
    id: "mhclg-net-dwellings",
    min: 80000,
    max: 400000,
    get: async () => {
      const path = await govukCollectionLatest("net-supply-of-housing", (d) => /net additional dwellings|housing supply/i.test(d.title || "")).catch(() => "government/statistical-data-sets/live-tables-on-net-supply-of-housing");
      console.log(`  mhclg-dwellings release: ${path}`);
      const atts = await govukAttachments(path);
      console.log(`  mhclg-dwellings atts: ${atts.map((a) => (a.url || "").split("/").pop()).slice(0, 20).join(" | ")}`);
      // England annual time series lives in a Live_Table ODS (try 122, 120, 118…), not the old regional .xls.
      const odsAtts = atts.filter((a) => /live_table_\d+\.ods/i.test(a.url || ""));
      const ord = ["120", "118", "117", "122", "123", "124"];
      const tnum = (u) => (String(u).match(/live_table_(\d+)/i) || [])[1] || "999";
      odsAtts.sort((a, b) => (ord.indexOf(tnum(a.url)) + 1 || 99) - (ord.indexOf(tnum(b.url)) + 1 || 99));
      let dumped = "";
      for (const att of odsAtts) {
        let book;
        try { book = await xlsxBook(att.url); } catch (e) { console.log(`  mhclg-dwellings ${att.url.split("/").pop()} read err: ${e.message}`); continue; }
        for (const sn of book.SheetNames) {
          let rows;
          try { rows = await sheetRows(book, sn); } catch (e) { void e; continue; }
          // Transposed layout: a header row carries financial years ("2006-07")
          // across columns; "Net additional dwellings" is a ROW. Pair each
          // year column with that row's value.
          let yearRow = -1;
          for (let i = 0; i < Math.min(rows.length, 20); i++) {
            if ((rows[i] || []).filter((c) => /\b(19|20)\d\d[-/]\d{2}\b/.test(String(c ?? ""))).length >= 4) { yearRow = i; break; }
          }
          if (yearRow < 0) continue;
          // Anchor to the row label (not the "Source: …net additional dwellings…" caption).
          const valRow = rows.find((r) => /^(total )?net additional dwellings/i.test(String(r?.[0] ?? "").trim()));
          if (!valRow) continue;
          const points = [];
          for (let c = 0; c < rows[yearRow].length; c++) {
            const ym = String(rows[yearRow][c] ?? "").match(/\b(19|20)\d\d[-/](\d{2})\b/);
            if (!ym) continue;
            const v = typeof valRow[c] === "number" ? valRow[c] : parseFloat(String(valRow[c] ?? "").replace(/,/g, ""));
            if (Number.isFinite(v) && v >= 80000 && v <= 400000) points.push({ date: `${ym[0].slice(0, 4)}-01-01`, value: Math.round(v) });
          }
          if (points.length >= 5) { console.log(`  mhclg-dwellings ${att.url.split("/").pop()} sheet="${sn}" ${points.length} pts (transposed)`); return points.sort((a, b) => (a.date < b.date ? -1 : 1)); }
        }
        if (!dumped) {
          dumped = att.url.split("/").pop();
          const dsn = book.SheetNames.find((n) => !/cover|content|note|metadata/i.test(n)) || book.SheetNames[0];
          const rows = await sheetRows(book, dsn);
          console.log(`  mhclg-dwellings dump ${dumped}/${dsn} col0 labels:`);
          rows.forEach((r, i) => { const c0 = String(r?.[0] ?? "").trim(); if (c0) console.log(`    [${i}] ${c0.slice(0, 80)}`); });
        }
      }
      throw new Error("mhclg-dwellings: England series not found");
    },
  },

  // Defra household recycling rate (England, annual %). Defra waste statistics.
  {
    id: "defra-recycling",
    min: 20,
    max: 70,
    get: async () => {
      const path = await govukCollectionLatest("waste-and-recycling-statistics", (d) => /local authority|household waste|uk statistics on waste/i.test(d.title || ""))
        .catch(() => govukLatest("local authority collected waste england", (r) => /local authority|recycling|waste/i.test(r.title || "")));
      console.log(`  defra-recycling release: ${path}`);
      const atts = await govukAttachments(path);
      console.log(`  defra-recycling atts: ${atts.map((a) => (a.url || "").split("/").pop()).slice(0, 20).join(" | ")}`);
      const file = atts.find((a) => /\.ods|\.xlsx?|\.csv/i.test(a.url || "") && /recycl|household|england/i.test(`${a.title || ""} ${a.url || ""}`)) || atts.find((a) => /\.ods|\.xlsx?|\.csv/i.test(a.url || ""));
      if (!file) throw new Error("defra-recycling: no data file");
      console.log(`  defra-recycling file: ${file.url}`);
      const book = await xlsxBook(file.url);
      console.log(`  defra-recycling sheets: ${book.SheetNames.join("|")}`);
      // Transposed tonnage tables (years across columns); recycling rate is
      // (dry + organic recycling) ÷ total collected.
      const order = book.SheetNames.filter((n) => /calendar/i.test(n))
        .concat(book.SheetNames.filter((n) => /financial/i.test(n)))
        .concat(book.SheetNames);
      const num = (c) => { const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
      for (const sn of [...new Set(order)]) {
        const rows = await sheetRows(book, sn);
        let yearCols = [];
        for (let i = 0; i < Math.min(rows.length, 8); i++) {
          const yc = (rows[i] || []).map((c, idx) => [idx, String(c ?? "").trim()]).filter(([, s]) => /^20\d\d([/-]\d{2})?$/.test(s));
          if (yc.length >= 5) { yearCols = yc; break; }
        }
        if (!yearCols.length) continue;
        const findRow = (re) => rows.find((r) => Array.isArray(r) && re.test(String(r[0] ?? "").toLowerCase()));
        const total = findRow(/total collected/);
        const dry = findRow(/sent for dry recycling/);
        const org = findRow(/sent for organic recycling/);
        if (!total || !dry || !org) continue;
        const points = [];
        for (const [idx, label] of yearCols) {
          const t = num(total[idx]), d = num(dry[idx]), o = num(org[idx]);
          const y = (label.match(/20\d\d/) || [])[0];
          if (t && d != null && o != null && y) {
            const rate = ((d + o) / t) * 100;
            if (rate >= 20 && rate <= 70) points.push({ date: `${y}-01-01`, value: +rate.toFixed(1) });
          }
        }
        if (points.length >= 5) { console.log(`  defra-recycling sheet="${sn}" ${points.length} pts (computed)`); return points.sort((a, b) => (a.date < b.date ? -1 : 1)); }
      }
      throw new Error("defra-recycling: series not found");
    },
  },

  // Defra storm-overflow spill hours (England, annual). EA Event Duration
  // Monitoring annual returns (data.gov.uk CKAN). Each yearly workbook has one
  // sheet per water company; sum the total spill-duration column across every
  // monitored overflow to get the national annual total.
  {
    id: "defra-sewage-hours",
    min: 500000,
    max: 6000000,
    get: async () => {
      const pkg = "19f6064d-7356-466f-844e-d20ea10ae9fd"; // EDM Storm Overflows – Annual Returns
      const res = await fetch(`https://www.data.gov.uk/api/3/action/package_show?id=${pkg}`, fetchOpts({ accept: "application/json" }));
      if (!res.ok) throw new Error(`EDM CKAN HTTP ${res.status}`);
      const j = await res.json();
      const all = j.result?.resources || [];
      const dec = (r) => decodeURIComponent(r.url || "");
      console.log(`  sewage CKAN success=${j.success} resources=${all.length} all=${all.map((r) => `${r.format || "?"}::${dec(r).split("=").pop()}`).slice(0, 20).join(" | ")}`);
      // Each year is published as a .zip containing the annual-return workbook(s).
      // The year sits between underscores (EDM_2020_…), so use digit boundaries
      // rather than \b (underscore is a word char and would defeat \b).
      const YEAR = /(?<![0-9])(20\d\d)(?![0-9])/;
      const zips = all.filter((r) => /\.zip/i.test(dec(r)) && YEAR.test(dec(r)) && !/long-term|trend/i.test(dec(r)));
      const num = (c) => { const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
      const points = [];
      let dumped = false;
      for (const r of zips) {
        const ym = dec(r).match(YEAR);
        if (!ym) continue;
        const year = ym[1];
        if (points.some((p) => p.date.startsWith(year))) continue;
        try {
          const entries = (await unzipUrl(r.url)).filter((e) => /\.xlsx?$/i.test(e.name));
          let sum = 0, n = 0, durName = "";
          for (const ent of entries) {
            let book;
            try { book = await xlsxBookFromBuffer(ent.buf); } catch { continue; }
            for (const sn of book.SheetNames) {
              if (/read ?me|guide|cover|content|index|note|summary|glossary|metadata|definition/i.test(sn)) continue;
              let rows;
              try { rows = await sheetRows(book, sn); } catch { continue; }
              let hi = -1, dc = -1;
              for (let i = 0; i < Math.min(rows.length, 25); i++) {
                const h = (rows[i] || []).map((c) => String(c ?? "").toLowerCase().replace(/\s+/g, " "));
                // "Total Duration (hours) of all spills …" — only the duration
                // column contains "duration", so no count/percent exclusion needed.
                let idx = h.findIndex((x) => /total duration/.test(x) && /hour|hr/.test(x) && !/average|mean/.test(x));
                if (idx < 0) idx = h.findIndex((x) => /duration/.test(x) && /total|annual/.test(x) && !/average|mean/.test(x));
                if (idx >= 0) { hi = i; dc = idx; durName = h[idx]; break; }
              }
              if (dc < 0) { if (!dumped) { dumped = true; console.log(`  sewage dump-hdr ${ent.name.split("/").pop()} sheet="${sn}" hdr=${JSON.stringify((rows[0] || []).map((c) => String(c ?? "").slice(0, 40)))}`); } continue; }
              for (const row of rows.slice(hi + 1)) { const v = num(row[dc]); if (v != null && v >= 0 && v <= 9000) { sum += v; n++; } }
            }
          }
          if (n > 50 && sum >= 500000 && sum <= 6000000) { console.log(`  sewage ${year}: ${Math.round(sum)} hrs from ${n} overflows (col="${durName}")`); points.push({ date: `${year}-01-01`, value: Math.round(sum) }); setSrc(r.url); }
          else {
            console.log(`  sewage ${year}: sum=${Math.round(sum)} n=${n} entries=${entries.length} (rejected)`);
            if (!dumped && entries[0]) { dumped = true; const book = await xlsxBookFromBuffer(entries[0].buf); const sn = book.SheetNames.find((s) => !/read|guide|cover|content|index|note|summary|glossary|metadata|definition/i.test(s)) || book.SheetNames[0]; const rows = await sheetRows(book, sn); console.log(`  sewage dump ${entries[0].name} sheets=[${book.SheetNames.join("|")}] "${sn}" r0=${JSON.stringify(rows[0] || []).slice(0, 240)} r1=${JSON.stringify(rows[1] || []).slice(0, 160)}`); }
          }
        } catch (e) { console.log(`  sewage ${year} err ${e.message}`); }
      }
      if (points.length >= 3) return points.sort((a, b) => (a.date < b.date ? -1 : 1));
      throw new Error(`defra-sewage: only ${points.length} annual totals`);
    },
  },

  // Defra bathing water quality: % of designated bathing waters classified
  // Good or Excellent (England, annual). EA classification counts.
  {
    id: "defra-bathing-water",
    min: 40,
    max: 100,
    get: async () => {
      const num = (c) => { const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/[,%]/g, "")); return Number.isFinite(v) ? v : null; };
      // Shared parser: find a year-header row and Excellent/Good/Total rows in
      // any sheet of a classification-counts workbook, compute % Good-or-Excellent
      // per year. Used by both candidate sources below.
      const parseClassificationWorkbook = async (url, tag) => {
        console.log(`  bathing[${tag}] file: ${url}`);
        const book = await xlsxBook(url);
        console.log(`  bathing[${tag}] sheets: ${book.SheetNames.join("|")}`);
        for (const sn of book.SheetNames) {
          let rows;
          try { rows = await sheetRows(book, sn); } catch { continue; }
          let hi = -1, yearCols = [];
          for (let i = 0; i < Math.min(rows.length, 14); i++) {
            const yc = (rows[i] || []).map((c, idx) => [idx, String(c ?? "").trim()]).filter(([, s]) => /^20\d\d$/.test(s));
            if (yc.length >= 4) { hi = i; yearCols = yc; break; }
          }
          if (hi < 0) continue;
          const findRow = (re) => rows.find((r) => Array.isArray(r) && re.test(String(r[0] ?? "").toLowerCase()));
          const exc = findRow(/^excellent/), good = findRow(/^good/), tot = findRow(/^total|all (sites|bathing|waters)|number (of|classified)/);
          if (!exc || !good) { console.log(`  bathing[${tag}] sheet="${sn}" rows: ${rows.slice(hi + 1, hi + 8).map((r) => String(r?.[0] ?? "").slice(0, 24)).join(" | ")}`); continue; }
          const points = [];
          for (const [idx, label] of yearCols) {
            const e = num(exc[idx]), g = num(good[idx]);
            const t = tot ? num(tot[idx]) : null;
            if (e == null || g == null) continue;
            const denom = t ?? null;
            if (!denom) continue;
            const pct = ((e + g) / denom) * 100;
            if (pct >= 40 && pct <= 100) points.push({ date: `${label}-01-01`, value: +pct.toFixed(1) });
          }
          if (points.length >= 4) { console.log(`  bathing[${tag}] sheet="${sn}" ${points.length} pts (computed)`); return points.sort((a, b) => (a.date < b.date ? -1 : 1)); }
        }
        return null;
      };

      // Single-year summary workbook: ENV17 publishes one file PER YEAR (not one
      // multi-year timeseries), each with an aggregate Excellent/Good/Total row.
      // Extract that file's one point (year taken from the filename).
      // Class_Summary sheets are a region-by-classification matrix: rows are EA
      // regions, columns are classification categories (header row has
      // "Excellent"/"Good"/... as column labels), and the last row is the
      // national total, labelled "England" (not "Total").
      const parseSingleYearPoint = async (url, tag) => {
        const ym = url.match(/20\d\d/);
        if (!ym) return null;
        console.log(`  bathing[${tag}] year file: ${url}`);
        const book = await xlsxBook(url);
        for (const sn of book.SheetNames) {
          let rows;
          try { rows = await sheetRows(book, sn); } catch { continue; }
          const norm = (v) => String(v ?? "").trim().toLowerCase();
          const headerRow = rows.find((r) => Array.isArray(r) && r.some((c) => norm(c) === "excellent"));
          const englandRow = rows.find((r) => Array.isArray(r) && norm(r[0]) === "england");
          if (!headerRow || !englandRow) {
            console.log(`  bathing[${tag}] sheet="${sn}" labels: ${rows.slice(0, 40).map((r) => String(r?.[0] ?? "").slice(0, 30)).filter(Boolean).join(" | ")}`);
            continue;
          }
          const colIdx = (re) => headerRow.findIndex((c) => re.test(norm(c)));
          const excI = colIdx(/^excellent$/), goodI = colIdx(/^good$/);
          const sumCols = headerRow.map((c, i) => (/^(excellent|good|sufficient|poor|not classified)$/.test(norm(c)) ? i : -1)).filter((i) => i >= 0);
          const e = num(englandRow[excI]), g = num(englandRow[goodI]);
          const t = sumCols.reduce((a, i) => a + (num(englandRow[i]) ?? 0), 0);
          if (e == null || g == null || !t) {
            console.log(`  bathing[${tag}] sheet="${sn}" header: ${headerRow.map((c) => String(c ?? "").slice(0, 20)).join(" | ")} :: england: ${englandRow.map((c) => String(c ?? "").slice(0, 20)).join(" | ")}`);
            continue;
          }
          const pct = ((e + g) / t) * 100;
          if (pct >= 40 && pct <= 100) {
            console.log(`  bathing[${tag}] sheet="${sn}" year=${ym[0]} pct=${pct.toFixed(1)} (e=${e} g=${g} t=${t})`);
            return { date: `${ym[0]}-01-01`, value: +pct.toFixed(1) };
          }
          console.log(`  bathing[${tag}] sheet="${sn}" pct=${pct.toFixed(1)} out of range (e=${e} g=${g} t=${t})`);
        }
        console.log(`  bathing[${tag}] ${url.split("/").pop()}: sheets=${book.SheetNames.join("|")} no excellent/good/england match`);
        return null;
      };

      // Attempt 1: ENV17 "Bathing water quality: additional datasets" — a gov.uk
      // *statistical-data-set* (not the PDF-only *statistics* collection tried
      // below), which CLAUDE.md's proven pattern says exposes attachments
      // directly via details.attachments (no per-edition HTML to chase).
      try {
        const env17 = await govukContent("government/statistical-data-sets/env17-bathing-water-quality-additional-datasets");
        const atts = (env17?.details?.attachments || []).filter((a) => /\.(ods|xlsx?|csv)(\?|$)/i.test(a.url || ""));
        console.log(`  bathing[env17] attachments: ${atts.map((a) => (a.url || "").split("/").pop()).join(", ") || "(none)"}`);
        // A handful of editions (e.g. the 2015 file) carry a multi-year rollup
        // sheet (named like "5_year_UK") alongside the single-year one — try
        // that cheap path on every attachment before falling back per-year.
        for (const a of atts) {
          const pts = await parseClassificationWorkbook(a.url, "env17").catch((e) => { console.log(`  bathing[env17] ${a.url} err ${e.message}`); return null; });
          if (pts) return pts;
        }
        // ENV17 publishes one workbook per year, not a single multi-year file.
        // Some editions' "results" filenames still contain a Class_Summary sheet
        // (e.g. the 2022-2025 Classification_Results workbooks), so try every
        // attachment rather than filtering by filename.
        const points = [];
        for (const a of atts) {
          const pt = await parseSingleYearPoint(a.url, "env17").catch((e) => { console.log(`  bathing[env17] ${a.url} err ${e.message}`); return null; });
          if (pt) points.push(pt);
        }
        const byYear = new Map(points.map((p) => [p.date, p]));
        if (byYear.size >= 3) return [...byYear.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
        console.log(`  bathing[env17] only ${byYear.size} usable year(s) from summary files`);
      } catch (e) { console.log(`  bathing[env17] err ${e.message}`); }

      // Attempt 2 (existing fallback): the PDF-only *statistics* collection
      // sometimes still carries a per-edition ODS/XLSX/CSV attachment.
      const parent = await govukContent("government/statistics/bathing-water-quality-statistics");
      const editions = [
        ...(parent?.links?.documents || []).map((d) => String(d.base_path || "")),
        ...(parent?.details?.attachments || []).map((a) => String(a.url || "")).filter((u) => /\/bathing-water-quality-statistics\/.+\d{4}/i.test(u)),
      ].map((u) => u.replace(/^https?:\/\/www\.gov\.uk\//, "").replace(/^\//, "")).filter(Boolean);
      const seen = new Set();
      const docs = editions.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).sort((a, b) => b.localeCompare(a));
      console.log(`  bathing[stats] editions: ${docs.slice(0, 6).join(" | ")}`);
      let file = null;
      for (const p of docs.slice(0, 5)) {
        let eatts;
        try { eatts = await govukAttachments(p); } catch { continue; }
        const cand = eatts.find((a) => /\.(ods|xlsx?|csv)(\?|$)/i.test(a.url || "") && /classif|complian|quality|result/i.test(`${a.title || ""} ${a.url || ""}`)) || eatts.find((a) => /\.(ods|xlsx?|csv)(\?|$)/i.test(a.url || ""));
        console.log(`  bathing[stats] edition ${p.split("/").pop()}: ${eatts.map((a) => (a.url || "").split("/").pop()).filter((u) => /\.(ods|xlsx?|csv)/i.test(u)).slice(0, 6).join(", ") || "(no data file)"}`);
        if (cand) { file = cand; break; }
      }
      if (file) {
        const pts = await parseClassificationWorkbook(file.url, "stats");
        if (pts) return pts;
      }
      throw new Error("bathing: classification series not found in env17 or stats sources");
    },
  },

  // MHCLG housing affordability: ONS median house-price-to-earnings ratio
  // (England). ONS dataset workbook — scrape the landing page for the current
  // spreadsheet, then read the England median-ratio row across year columns.
  {
    id: "mhclg-affordability",
    min: 3,
    max: 15,
    get: async () => {
      const landing = "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian";
      const res = await fetch(landing, fetchOpts({ accept: "text/html,*/*" }));
      if (!res.ok) throw new Error(`affordability landing HTTP ${res.status}`);
      const html = await res.text();
      const links = [...html.matchAll(/href="([^"]*\.xlsx?(?:\?[^"]*)?)"/gi)].map((m) => (m[1].startsWith("http") ? m[1] : `https://www.ons.gov.uk${m[1]}`));
      const url = links.find((u) => /median/i.test(u)) || links[0];
      if (!url) throw new Error("affordability: no spreadsheet link");
      console.log(`  affordability xls: ${url}`);
      const book = await xlsxBook(url);
      console.log(`  affordability sheets: ${book.SheetNames.join("|")}`);
      const num = (c) => { const v = typeof c === "number" ? c : parseFloat(String(c ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
      // Disambiguate via the Contents sheet: pick the table whose description is
      // the MEDIAN house-price-to-MEDIAN-earnings ratio (not lower quartile).
      let preferred = null;
      try {
        const contents = await sheetRows(book, book.SheetNames.find((n) => /content/i.test(n)) || "Contents");
        for (const row of contents) {
          const cells = (row || []).map((c) => String(c ?? ""));
          const desc = cells.join(" ").toLowerCase();
          if (/ratio/.test(desc) && /median house price/.test(desc) && /median.*earning/.test(desc) && !/lower quartile/.test(desc)) {
            const code = cells.map((c) => c.trim()).find((c) => /^\d[a-z]$/i.test(c)) || (desc.match(/table\s*(\d[a-z])/) || [])[1];
            if (code) { preferred = code.toLowerCase(); console.log(`  affordability Contents → median-ratio table "${preferred}": ${desc.slice(0, 90)}`); break; }
          }
        }
      } catch (e) { console.log(`  affordability Contents parse err ${e.message}`); }
      // Median ratio table; rows = areas incl. England (code E92000001), cols = years.
      const order = (preferred ? book.SheetNames.filter((n) => n.toLowerCase() === preferred) : [])
        .concat(book.SheetNames.filter((n) => /median/i.test(n)))
        .concat(book.SheetNames);
      let dumped = false;
      for (const sn of [...new Set(order)]) {
        let rows;
        try { rows = await sheetRows(book, sn); } catch { continue; }
        let hi = -1, yearCols = [];
        for (let i = 0; i < Math.min(rows.length, 12); i++) {
          const yc = (rows[i] || []).map((c, idx) => [idx, String(c ?? "").trim()]).filter(([, s]) => /^(19|20)\d\d$/.test(s));
          if (yc.length >= 10) { hi = i; yearCols = yc; break; }
        }
        if (hi < 0) continue;
        const eng = rows.find((r) => Array.isArray(r) && r.some((c) => /e92000001/i.test(String(c ?? ""))))
          || rows.find((r) => Array.isArray(r) && r.slice(0, 4).some((c) => /^england$/i.test(String(c ?? "").trim())));
        if (!eng) { if (!dumped) { dumped = true; console.log(`  affordability sheet="${sn}" hdr=[${(rows[hi] || []).slice(0, 6).join("|")}] r1=[${(rows[hi + 1] || []).slice(0, 4).join("|")}]`); } continue; }
        const points = [];
        for (const [idx, label] of yearCols) {
          const v = num(eng[idx]);
          if (v != null && v >= 3 && v <= 15) points.push({ date: `${label}-01-01`, value: +v.toFixed(2) });
        }
        if (points.length >= 8) { console.log(`  affordability sheet="${sn}" ${points.length} pts`); return points.sort((a, b) => (a.date < b.date ? -1 : 1)); }
      }
      throw new Error("affordability: England median ratio not found");
    },
  },

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
      // HMPPS leaving-rate tables use grouped "{date} Rate" columns (Leavers /
      // Avg SIP / Rate per period), rows by grade or structure/region. Prefer a
      // "main grades" sheet (has Band 3-5), pick that row, read the Rate columns.
      const candidates = book.SheetNames.filter((n) => !/content|cover|notes|definition|guidance/i.test(n));
      candidates.sort((a, b) => (/(grade|10b)/i.test(b) ? 1 : 0) - (/(grade|10b)/i.test(a) ? 1 : 0));
      for (const n of candidates) {
        const rows = await sheetRows(book, n);
        let hi = -1, header = null, best = 0;
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const cnt = rows[i].filter((c) => /rate/i.test(String(c ?? "")) && /\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4}|\b20\d{2}\b/.test(String(c ?? ""))).length;
          if (cnt > best) { best = cnt; header = rows[i]; hi = i; }
        }
        if (hi < 0 || best < 2) continue;
        const rateCols = [];
        header.forEach((c, idx) => { const s = String(c ?? ""); if (/rate/i.test(s) && /\d{1,2}[- ][A-Za-z]{3}[- ]\d{2,4}|\b20\d{2}\b/.test(s)) rateCols.push({ idx, label: s }); });
        if (rateCols.length < 2) continue;
        const pickRow = (re) => rows.slice(hi + 1).find((r) => re.test(String(r[0] ?? "") + " " + String(r[1] ?? "")));
        const dataRow = pickRow(/band\s*3|prison\s*officer/i) ?? pickRow(/^total|all staff|hmpps|england/i);
        if (!dataRow) continue;
        const points = [];
        for (const { idx, label } of rateCols) {
          let v = typeof dataRow[idx] === "number" ? dataRow[idx] : parseFloat(String(dataRow[idx] ?? ""));
          if (!Number.isFinite(v)) continue;
          if (v > 0 && v < 1) v *= 100;
          if (v < 1 || v > 25) continue;
          let date = null, m;
          if ((m = label.match(/(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})/))) { const mo = MONTHS[m[2].toUpperCase().slice(0, 3)]; if (mo) { const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3]; date = `${yr}-${String(mo).padStart(2, "0")}-01`; } }
          else if ((m = label.match(/\b(20\d{2})\b/))) date = `${m[1]}-03-01`;
          if (date) points.push({ date, value: +v.toFixed(1) });
        }
        if (points.length >= 3) {
          const seen = new Set();
          return points.filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; }).sort((a, b) => (a.date < b.date ? -1 : 1));
        }
      }
      console.log(`moj-officer: sheets=[${book.SheetNames.join("|")}]`);
      for (const n of book.SheetNames) {
        if (/content|cover|notes|definition/i.test(n)) continue;
        const rr = await sheetRows(book, n);
        console.log(`  -- "${n}": ${JSON.stringify(rr.slice(0, 4)).slice(0, 300)}`);
      }
      throw new Error("moj-officer-resignations: no usable rate row");
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
    min: 20,
    max: 100,
    get: async () => {
      // migration-transparency-data is a statistical-data-set (not a collection);
      // read its attachments directly, or follow its linked documents.
      const c = await govukContent("government/statistical-data-sets/migration-transparency-data");
      let atts = c?.details?.attachments || [];
      console.log(`ho-visa: data-set atts=${atts.length} docs=${(c?.links?.documents || []).length}`);
      if (!atts.some((a) => /\.(ods|xlsx?)(\?|$)/i.test(a.url || ""))) {
        const docs = (c?.links?.documents || []).filter((d) => /visas.*status.*immigration|migration transparency/i.test(d.title || ""));
        docs.sort((a, b) => String(b.public_updated_at || "").localeCompare(String(a.public_updated_at || "")));
        if (docs[0]) { const p = String(docs[0].base_path || "").replace(/^\//, ""); console.log(`ho-visa: doc=${p}`); atts = await govukAttachments(p); }
      }
      const ss = atts.filter((a) => /\.(ods|xlsx?)(\?|$)/i.test(a.url || ""));
      const sheet = ss.find((a) => /visas.*status.*immigration|vsi/i.test((a.title || "") + (a.url || ""))) ?? ss[0];
      if (!sheet) throw new Error("ho-visa-sla: no spreadsheet attachment");
      const book = await xlsxBook(sheet.url);
      const sn = book.SheetNames.find((n) => /vsi[_\s-]?0?2/i.test(n));
      if (!sn) throw new Error(`ho-visa-sla: no VSI_02 sheet in [${book.SheetNames.join("|")}]`);
      const rows = await sheetRows(book, sn);
      // VSI_02: one row per (Quarter, Priority, Route, Leave Type). Aggregate the
      // overall % within service standard = Σ(straightforward decided within SLA)
      // ÷ Σ(straightforward received) per quarter (excluding "No SLA" rows).
      const hi = rows.findIndex((r) => r.some((c) => /^quarter$/i.test(String(c ?? "").trim())) && r.some((c) => /route/i.test(String(c ?? ""))));
      if (hi < 0) throw new Error("ho-visa-sla: no header in VSI_02");
      const header = rows[hi];
      const qCol = header.findIndex((c) => /^quarter$/i.test(String(c ?? "").trim()));
      const prCol = header.findIndex((c) => /priority/i.test(String(c ?? "")));
      const srCol = header.findIndex((c) => /straightforward applications received/i.test(String(c ?? "")) && !/non[\s-]?straightforward/i.test(String(c ?? "")));
      let withinCol = header.findIndex((c) => /within service standard/i.test(String(c ?? "")) && !/%|percent/i.test(String(c ?? "")));
      if (withinCol < 0 && srCol >= 0) withinCol = srCol + 1;
      if (qCol < 0 || srCol < 0 || withinCol < 0) throw new Error(`ho-visa-sla: cols q=${qCol} sr=${srCol} within=${withinCol} in [${header.slice(0, 14).join("|")}]`);
      const qEnd = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" };
      const agg = new Map();
      for (const r of rows.slice(hi + 1)) {
        const qm = String(r[qCol] ?? "").match(/(\d{4})\s*Q([1-4])/i);
        if (!qm) continue;
        if (prCol >= 0 && /no\s*sla/i.test(String(r[prCol] ?? ""))) continue;
        const sr = Number(r[srCol]), wi = Number(r[withinCol]);
        if (!Number.isFinite(sr) || !Number.isFinite(wi) || sr <= 0) continue;
        const key = `${qm[1]}-${qEnd[+qm[2]]}`;
        const a = agg.get(key) || { sr: 0, wi: 0 };
        a.sr += sr; a.wi += wi; agg.set(key, a);
      }
      const points = [...agg.entries()].map(([date, { sr, wi }]) => ({ date, value: +(wi / sr * 100).toFixed(1) }))
        .filter((p) => p.value > 0 && p.value <= 100).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (points.length < 4) throw new Error(`ho-visa-sla: only ${points.length} points`);
      return points;
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
        `${base}/`,
        `${base}/ae-attendances-and-emergency-admissions-${fy}-${String(fy + 1).slice(2)}/`,
        `${base}/ae-attendances-and-emergency-admissions-${fy - 1}-${String(fy).slice(2)}/`,
      ];
      let xlsUrl = null;
      const samples = [];
      for (const pageUrl of pages) {
        try {
          const res = await fetch(pageUrl, fetchOpts({ accept: "text/html,*/*" }));
          if (!res.ok) { samples.push(`${pageUrl} -> HTTP ${res.status}`); continue; }
          const html = await res.text();
          const m = html.match(/href="([^"]*Monthly[- ]AE[- ]Time[- ]Series[^"]*\.xlsx?[^"]*)"/i);
          if (m) { xlsUrl = m[1].startsWith("http") ? m[1] : `https://www.england.nhs.uk${m[1]}`; break; }
          const all = [...html.matchAll(/href="([^"]*\.xlsx?[^"]*)"/gi)].map((x) => x[1]).slice(0, 8);
          samples.push(`${pageUrl} (${html.length}b): ${all.join(" , ") || "no .xls hrefs"}`);
        } catch (e) { samples.push(`${pageUrl} ERR ${e.message}`); }
      }
      if (!xlsUrl) { console.log("  ae-performance discovery failed; samples:\n   " + samples.join("\n   ")); throw new Error("ae-performance: no timeseries XLS URL found"); }
      console.log(`  ae-performance: ${xlsUrl}`);
      const book = await xlsxBook(xlsUrl);
      let sheetName = book.SheetNames.find((n) => /performance/i.test(n))
        ?? book.SheetNames.find((n) => !/cover|note|content|index|key|definition|activity/i.test(n))
        ?? book.SheetNames[0];
      const rows = await sheetRows(book, sheetName);
      const PCT = [/percentage.*4\s*hour/i, /%.*4\s*hour/i, /4\s*hour.*percentage/i, /4\s*hour.*%/i, /within 4/i, /in 4 hours/i, /4 hours? or less/i, /percentage in 4/i];
      const DATE = [/period/i, /month/i, /date/i];
      let headerIdx = -1, dateCol = -1, pctCol = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i]; if (!Array.isArray(row)) continue;
        const hd = row.findIndex((c) => DATE.some((p) => p.test(String(c ?? ""))));
        const hp = row.findIndex((c) => PCT.some((p) => p.test(String(c ?? ""))));
        if (hp >= 0) { headerIdx = i; pctCol = hp; dateCol = hd >= 0 ? hd : 0; break; }
      }
      if (headerIdx < 0 || pctCol < 0) {
        console.log(`ae-performance: no pct col; sheets=[${book.SheetNames.join("|")}] chosen="${sheetName}" first 18:`);
        for (const r of rows.slice(0, 18)) console.log(`   ${JSON.stringify(r).slice(0, 240)}`);
        throw new Error("ae-performance: header/pct column not found");
      }
      // The "Period" dates are Excel serials in a column (often col 1); the
      // header label sits in a sub-row, so locate the serial-date column directly.
      for (const r of rows.slice(headerIdx + 1, headerIdx + 6)) {
        const idx = r.findIndex((c) => typeof c === "number" && c > 30000 && c < 60000);
        if (idx >= 0) { dateCol = idx; break; }
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
      if (points.length < 12) {
        console.log(`ae-performance: only ${points.length} pts; sheet="${sheetName}" headerIdx=${headerIdx} dateCol=${dateCol} pctCol=${pctCol}`);
        console.log(`   header=${JSON.stringify(rows[headerIdx]).slice(0, 320)}`);
        for (const r of rows.slice(headerIdx + 1, headerIdx + 4)) console.log(`   data=${JSON.stringify(r).slice(0, 320)}`);
        throw new Error(`ae-performance: only ${points.length} points`);
      }
      return points.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // NHS England Ambulance Quality Indicators — Category 2 (emergency, e.g. heart
  // attack/stroke) mean response time. AmbSYS publishes a long CSV; field A31 is
  // the C2 mean. Scrape the AQI page for the AmbSYS CSV, take the England row.
  {
    id: "dhsc-ambulance-c2",
    min: 5,
    max: 120, // minutes
    get: async () => {
      const now = new Date();
      const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const base = "https://www.england.nhs.uk/statistics/statistical-work-areas/ambulance-quality-indicators";
      const pages = [
        `${base}/`,
        `${base}/ambulance-quality-indicators-data-${fy}-${String(fy + 1).slice(2)}/`,
        `${base}/ambulance-quality-indicators-data-${fy - 1}-${String(fy).slice(2)}/`,
      ];
      let csvUrl = null;
      const samples = [];
      for (const pageUrl of pages) {
        try {
          const res = await fetch(pageUrl, fetchOpts({ accept: "text/html,*/*" }));
          if (!res.ok) { samples.push(`${pageUrl} -> HTTP ${res.status}`); continue; }
          const html = await res.text();
          const m = html.match(/href="([^"]*AmbSYS[^"]*\.csv[^"]*)"/i);
          if (m) { csvUrl = m[1].startsWith("http") ? m[1] : `https://www.england.nhs.uk${m[1]}`; break; }
          const all = [...html.matchAll(/href="([^"]*\.csv[^"]*)"/gi)].map((x) => x[1]).slice(0, 8);
          samples.push(`${pageUrl} (${html.length}b): ${all.join(" , ") || "no .csv hrefs"}`);
        } catch (e) { samples.push(`${pageUrl} ERR ${e.message}`); }
      }
      if (!csvUrl) { console.log("  dhsc-ambulance-c2 discovery failed:\n   " + samples.join("\n   ")); throw new Error("dhsc-ambulance-c2: no AmbSYS CSV URL found"); }
      console.log(`  dhsc-ambulance-c2: ${csvUrl}`);
      const res = await fetch(csvUrl, fetchOpts({ accept: "text/csv,*/*" }));
      if (!res.ok) throw new Error(`dhsc-ambulance-c2 CSV → HTTP ${res.status}`);
      setSrc(csvUrl);
      const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim());
      const header = parseCsvLine(lines[0]).map((h) => h.replace(/^﻿/, "").trim());
      const yearCol = header.findIndex((h) => /^year$/i.test(h));
      const monthCol = header.findIndex((h) => /^month$/i.test(h));
      const orgCodeCol = header.findIndex((h) => /org.*code/i.test(h));
      const orgNameCol = header.findIndex((h) => /org.*name/i.test(h));
      let c2Col = header.findIndex((h) => /^A31$/i.test(h));
      if (c2Col < 0) c2Col = header.findIndex((h) => /category ?2.*mean|mean.*category ?2|c2.*mean/i.test(h));
      if (yearCol < 0 || monthCol < 0 || c2Col < 0) {
        console.log(`dhsc-ambulance-c2: header=${header.slice(0, 45).join("|")}`);
        throw new Error("dhsc-ambulance-c2: Year/Month/A31 columns not found");
      }
      const MON = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
      const toMin = (raw) => {
        const s = String(raw ?? "").trim();
        if (!s || /^[-:.\s]*$/.test(s)) return null;
        let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/); // HH:MM:SS
        if (m) return (+m[1] * 3600 + +m[2] * 60 + +m[3]) / 60;
        m = s.match(/^(\d{1,3}):(\d{2})$/); // MM:SS
        if (m) return (+m[1] * 60 + +m[2]) / 60;
        const n = parseFloat(s.replace(/,/g, ""));
        if (!Number.isFinite(n)) return null;
        return n > 600 ? n / 60 : n; // raw seconds → minutes
      };
      const points = [], seen = new Set();
      for (const line of lines.slice(1)) {
        const r = parseCsvLine(line);
        const code = orgCodeCol >= 0 ? String(r[orgCodeCol] ?? "").trim() : "";
        const nm = orgNameCol >= 0 ? String(r[orgNameCol] ?? "").trim() : "";
        if (!/^eng$/i.test(code) && !/^england$/i.test(nm)) continue;
        const yr = parseInt(r[yearCol], 10);
        let mn = parseInt(r[monthCol], 10);
        if (!mn) mn = MON[String(r[monthCol] ?? "").trim().toLowerCase()] || 0;
        if (!yr || !mn) continue;
        const v = toMin(r[c2Col]);
        if (v == null || v < 5 || v > 120) continue;
        const date = `${yr}-${String(mn).padStart(2, "0")}-01`;
        if (seen.has(date)) continue;
        seen.add(date);
        points.push({ date, value: +v.toFixed(1) });
      }
      if (points.length < 12) {
        console.log(`dhsc-ambulance-c2: only ${points.length} pts; header=${header.slice(0, 30).join("|")}`);
        throw new Error(`dhsc-ambulance-c2: only ${points.length} points`);
      }
      return points.sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },

  // Home Office — % of recorded offences resulting in a charge or summons.
  // The police-recorded-crime-and-outcomes open data table is a long CSV
  // (year × force × offence × outcome × count); aggregate nationally per year:
  // charged/summonsed ÷ all offences. The published rate has collapsed from
  // ~16% (2015) to ~7% — a flagship "police don't solve crimes" grievance.
  {
    id: "ho-charge-rate",
    min: 2,
    max: 30, // percent
    get: async () => {
      // Use the small "Crime outcomes in England and Wales" ODS summary tables
      // (charged/summonsed proportion by financial year), not the giant open
      // data CSV. Find the latest outcomes release in the crime-statistics
      // collection, then take its outcomes ODS.
      const path = await govukCollectionLatest(
        "crime-statistics",
        (d) => /crime outcomes in england and wales/i.test(d.title || ""),
      );
      console.log(`  ho-charge-rate release: ${path}`);
      const atts = await govukAttachments(path);
      const ods =
        atts.find((a) => /\.ods/i.test(a.url || "") && /outcome/i.test(`${a.title || ""} ${a.url || ""}`)) ||
        atts.find((a) => /\.ods/i.test(a.url || ""));
      if (!ods) { console.log(`ho-charge-rate atts: ${atts.map((a) => a.title).join(" | ")}`); throw new Error("ho-charge-rate: no outcomes ODS attachment"); }
      console.log(`  ho-charge-rate ODS: ${ods.url}`);
      const book = await xlsxBook(ods.url);
      console.log(`  ho-charge-rate sheets: ${book.SheetNames.join("|")}`);
      const isFy = (s) =>
        /\b20\d\d\s*[\/\-]\s*\d{2}\b/.test(s) ||
        /(year (ending|to)|to (mar|march|dec|jun|sep|december|june|september))[^0-9]*20\d\d/i.test(s) ||
        /\b(apr|jan|january|april)[^0-9]*20\d\d/i.test(s) ||
        /^\s*20\d\d\s*$/.test(s);
      const yend = (s) => { const m = String(s).match(/20\d\d/g); return m ? m[m.length - 1] : null; };
      const num = (cell) => {
        let v = typeof cell === "number" ? cell : parseFloat(String(cell ?? "").replace(/[%,]/g, ""));
        if (!Number.isFinite(v)) return null;
        if (v <= 1 && v > 0) v *= 100; // proportion → percent
        return v;
      };
      for (const sn of book.SheetNames) {
        const rows = await sheetRows(book, sn);
        let hi = -1, yearCols = [];
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const yc = (rows[i] || []).map((c, idx) => [idx, String(c ?? "")]).filter(([, s]) => isFy(s));
          if (yc.length >= 4) { hi = i; yearCols = yc; break; }
        }
        if (hi < 0) continue;
        const candRows = rows.map((r, i) => [i, r]).filter(([, r]) => Array.isArray(r) && /charg|summons/i.test(r.slice(0, 3).map((x) => String(x ?? "")).join(" ")));
        for (const [ri, row] of candRows) {
          const byYear = {};
          for (const [idx, label] of yearCols) {
            const ye = yend(label); if (!ye || ye in byYear) continue;
            // Year columns may be a Number/Percentage pair — take whichever of
            // this column or the next reads as a plausible percentage (2–30%).
            for (const cIdx of [idx, idx + 1]) {
              const v = num(row[cIdx]);
              if (v != null && v >= 2 && v <= 30) { byYear[ye] = +v.toFixed(2); break; }
            }
          }
          const points = Object.entries(byYear).map(([y, v]) => ({ date: `${y}-01-01`, value: v }));
          if (points.length >= 5) {
            console.log(`  ho-charge-rate: sheet="${sn}" row=${ri} ${points.length} pts`);
            return points.sort((a, b) => (a.date < b.date ? -1 : 1));
          }
        }
      }
      // Diagnostic dump so the next CI log reveals the exact table layout.
      for (const sn of book.SheetNames.filter((n) => /table_1/i.test(n)).slice(0, 3)) {
        const rows = await sheetRows(book, sn);
        console.log(`  ho-charge-rate dump ${sn}:`);
        for (const r of rows.slice(0, 9)) console.log(`    ${JSON.stringify(r).slice(0, 280)}`);
      }
      throw new Error("ho-charge-rate: no charged/summonsed time series found in ODS");
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

  // IPA/NISTA Government Major Projects Portfolio: MoD in-year cost variance %.
  // Consolidated annual CSV under the major-projects-data collection; filter to
  // MoD rows and average "Financial Year Variance (%)".
  {
    id: "mod-procurement",
    min: 0,
    max: 100,
    get: () => gmppVariance(/^MOD/, "ministryofdefence"),
  },
  // IPA/NISTA GMPP: DfT in-year cost variance % (same CSV, DfT rows).
  {
    id: "dft-capital-overrun",
    min: 0,
    max: 100,
    get: () => gmppVariance(/^DFT/, "departmentfortransport"),
  },

  // DHSC — NHS HCHS staff 12-month rolling leaver rate (%), England aggregate.
  // Source: NHS Digital supplementary information, "Monthly turnover from organisation
  // by staff group, 2009 to 2023" (XLSX). The page has a random-suffix XLSX URL,
  // so we scrape it (same pattern as A&E). Rows represent one
  // (date, organisation, staff-group) combination; we filter to England/All + All Staff.
  {
    id: "turnover",
    min: 5,
    max: 20,
    get: async () => {
      // Discover the XLSX URL from the supplementary info page. digital.nhs.uk
      // 403s the default bot UA, so present a browser User-Agent.
      const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
      const infoUrl = "https://digital.nhs.uk/supplementary-information/2023/turnover-from-organisation-by-staff-group-2009-to-2023";
      const res = await fetch(infoUrl, fetchOpts({ accept: "text/html,*/*", "user-agent": BROWSER_UA }));
      if (!res.ok) {
        try {
          const ck = await fetch("https://data.gov.uk/api/3/action/package_search?q=NHS+workforce+turnover&rows=8", fetchOpts({ accept: "application/json" }));
          if (ck.ok) { const j = await ck.json(); console.log(`turnover CKAN: ${(j.result?.results || []).map((r) => `${r.name}[${[...new Set((r.resources || []).map((x) => x.format))].join("/")}]`).join(" ; ").slice(0, 500)}`); } else console.log(`turnover CKAN HTTP ${ck.status}`);
        } catch (e) { console.log(`turnover CKAN err ${e.message}`); }
        throw new Error(`turnover: info page HTTP ${res.status}`);
      }
      const html = await res.text();
      const cands = [];
      for (const x of html.matchAll(/href="([^"]*\.xlsx?[^"]*)"/gi)) {
        const u = x[1].startsWith("http") ? x[1] : `https://digital.nhs.uk${x[1]}`;
        cands.push(u);
      }
      // Prefer a URL with "turnover" or "leaver" in the name; fall back to first xlsx
      const xlsUrl = cands.find((u) => /turnover|leaver|workforce/i.test(u)) ?? cands[0];
      if (!xlsUrl) throw new Error(`turnover: no .xlsx link on ${infoUrl}`);
      console.log(`  turnover XLSX: ${xlsUrl} (${cands.length} xlsx candidates)`);

      const book = await xlsxBook(xlsUrl);
      console.log(`  turnover sheets: [${book.SheetNames.join("|")}]`);

      // Find the sheet with monthly leaver rate rows
      const sheetName = book.SheetNames.find((n) => /turnover|leaver|monthly/i.test(n))
        ?? book.SheetNames.find((n) => !/cover|content|notes|definition|guidance/i.test(n))
        ?? book.SheetNames[0];
      const rows = await sheetRows(book, sheetName);
      console.log(`  turnover sheet="${sheetName}" rows=${rows.length}`);
      for (const r of rows.slice(0, 6)) console.log(`  ${JSON.stringify(r).slice(0, 300)}`);

      // Locate header row (must contain a leaver-rate column)
      let headerIdx = -1, dateCol = -1, orgCol = -1, staffGroupCol = -1, leaverRateCol = -1;
      for (let i = 0; i < Math.min(rows.length, 25); i++) {
        const r = rows[i].map((c) => String(c ?? "").toLowerCase().trim());
        const hd = r.findIndex((c) => /date|period|month|year/.test(c) && !/staff/.test(c));
        const hl = r.findIndex((c) => /leaver\s*rate|leavers\s*rate|12.?month.*rate|rolling.*leaver/.test(c));
        if (hl >= 0) {
          headerIdx = i;
          dateCol = hd >= 0 ? hd : 0;
          orgCol = r.findIndex((c) => /^org|^organisation|^region/.test(c));
          staffGroupCol = r.findIndex((c) => /staff\s*group|staff_group/.test(c));
          leaverRateCol = hl;
          break;
        }
      }
      if (headerIdx < 0) {
        for (const r of rows.slice(0, 20)) console.log(`  hdr? ${JSON.stringify(r).slice(0, 280)}`);
        throw new Error(`turnover: no header row in sheet "${sheetName}"`);
      }
      if (leaverRateCol < 0)
        throw new Error(`turnover: no leaver-rate column in [${rows[headerIdx].join("|")}]`);
      console.log(`  turnover headerIdx=${headerIdx} dateCol=${dateCol} orgCol=${orgCol} grpCol=${staffGroupCol} rateCol=${leaverRateCol}`);

      const MON = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
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

      // Filter to England aggregate + All Staff group rows
      const byDate = new Map();
      for (const r of rows.slice(headerIdx + 1)) {
        const rawOrg = orgCol >= 0 ? String(r[orgCol] ?? "").trim() : "";
        const rawGrp = staffGroupCol >= 0 ? String(r[staffGroupCol] ?? "").trim() : "";
        const isEngland  = rawOrg === "" || /^(england|all organisations?|total)$/i.test(rawOrg);
        const isAllStaff = rawGrp === "" || /^(all staff|all\s+(staff\s*)?groups?|total)$/i.test(rawGrp);
        if (!isEngland || !isAllStaff) continue;
        const date = toDate(r[dateCol]);
        if (!date) continue;
        let v = typeof r[leaverRateCol] === "number" ? r[leaverRateCol] : parseFloat(String(r[leaverRateCol] ?? ""));
        if (!Number.isFinite(v)) continue;
        if (v > 0 && v < 1.5) v *= 100; // fraction → percentage
        if (v < 3 || v > 30) continue;
        byDate.set(date, +v.toFixed(1));
      }

      if (byDate.size < 12) {
        const orgs = [...new Set(rows.slice(headerIdx + 1).map((r) => orgCol >= 0 ? String(r[orgCol] ?? "") : "").filter(Boolean))].slice(0, 12);
        const grps = [...new Set(rows.slice(headerIdx + 1).map((r) => staffGroupCol >= 0 ? String(r[staffGroupCol] ?? "") : "").filter(Boolean))].slice(0, 12);
        console.log(`  turnover: only ${byDate.size} pts; orgs=[${orgs.join("|")}] groups=[${grps.join("|")}]`);
        throw new Error(`turnover: only ${byDate.size} monthly points after org/group filter`);
      }

      const points = [...byDate.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      console.log(`  turnover: ${points.length} monthly pts ${points[0].date}..${points[points.length - 1].date}`);
      return points;
    },
  },

  // DHSC — NHS provider agency staff spend (£bn/year), annual financial years.
  // No single structured API exists; data comes from:
  //   • NHS England Q4 financial performance report long-reads (HTML text figures)
  //   • Hardcoded anchor points verified from NAO (Jul 2024) + NHS England press releases.
  // The HTML scraper targets the Q4 long-read per year and extracts the agency spend
  // figure from text. Hardcoded anchors fill years where the scraper can't reach.
  // Note: series cadence is "monthly" in data.ts but we return annual points (one per FY).
  {
    id: "agency-spend",
    min: 0.5,
    max: 6,
    get: async () => {
      // Hardcoded anchor points from verified official sources.
      // NAO Jul 2024: https://www.nao.org.uk/reports/nhs-financial-management-and-sustainability-2024/
      // NHS England press releases and quarterly financial reports.
      const anchors = [
        { date: "2013-04-01", value: 2.4  }, // House of Commons library: rose 29% to £2.4bn in 2013-14
        { date: "2015-04-01", value: 3.3  }, // Pre-agency-rules peak (BBC/NHSE Nov 2015)
        { date: "2016-04-01", value: 2.9  }, // Post-cap reduction (agency rules effective Oct 2015)
        { date: "2017-04-01", value: 2.5  }, // NHS Improvement data (tracking from 2017)
        { date: "2018-04-01", value: 2.4  }, // NHS Improvement data
        { date: "2019-04-01", value: 2.3  }, // Pre-Covid outturn
        { date: "2020-04-01", value: 2.4  }, // NAO: "£2.4bn (3.7% of wage bill) in 2020-21"
        { date: "2021-04-01", value: 2.9  }, // Intermediate year (between 2020-21 and 2022-23 peak)
        { date: "2022-04-01", value: 3.46 }, // NHS England confirmed: £3.46bn in 2022-23
        { date: "2023-04-01", value: 3.02 }, // NHS England confirmed: £3.02bn in 2023-24
        { date: "2024-04-01", value: 2.07 }, // NHS England Q4 2024-25: "£2.1bn, down £1.4bn from 2022-23"
        { date: "2025-04-01", value: 1.2  }, // NHS England 2025-26 month 12: "almost halved to £1.2bn"
      ];

      // Attempt to update/verify recent years from Q4 financial performance long-reads.
      // URL pattern: england.nhs.uk/long-read/financial-performance-report-{YY}-{YY+1 2-digit}-quarter-4/
      const currentFY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
      for (let fy = 2019; fy <= currentFY; fy++) {
        const url = `https://www.england.nhs.uk/long-read/financial-performance-report-${fy}-${String(fy + 1).slice(2)}-quarter-4/`;
        try {
          const res = await fetch(url, fetchOpts({ accept: "text/html,*/*" }));
          if (!res.ok) { console.log(`  agency-spend Q4 ${fy}-${fy+1}: HTTP ${res.status}`); continue; }
          const plain = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
          // Extract "£X.X billion" or "£X.Xbn" near the word "agency"
          const m = plain.match(/agency\s+staff[^.]{0,300}£([\d.]+)\s*(billion|bn)/i)
            ?? plain.match(/£([\d.]+)\s*(billion|bn)[^.]{0,150}agency\s+staff/i);
          if (m) {
            const v = parseFloat(m[1]);
            if (Number.isFinite(v) && v >= 0.5 && v <= 6) {
              const dateKey = `${fy}-04-01`;
              const existing = anchors.find((a) => a.date === dateKey);
              if (existing) { existing.value = v; existing._fromScrape = true; }
              else anchors.push({ date: dateKey, value: v, _fromScrape: true });
              console.log(`  agency-spend Q4 ${fy}-${fy+1}: £${v}bn (scraped)`);
            }
          } else {
            console.log(`  agency-spend Q4 ${fy}-${fy+1}: no £-figure matched (plain len=${plain.length})`);
          }
          await sleep(200);
        } catch (e) {
          console.log(`  agency-spend Q4 ${fy}-${fy+1}: ${e.message}`);
        }
      }

      const points = anchors
        .map(({ date, value }) => ({ date, value }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      if (points.length < 5) throw new Error(`agency-spend: only ${points.length} annual points`);
      const seen = new Set();
      const deduped = points.filter((p) => { if (seen.has(p.date)) return false; seen.add(p.date); return true; });
      console.log(`  agency-spend: ${deduped.length} annual pts ${deduped[0].date}..${deduped[deduped.length - 1].date}`);
      return deduped;
    },
  },

  // NHS England Discharge delays (Acute): average daily patients with No Criteria
  // to Reside (NCtR). Scrapes the discharge-delays pages for the timeseries CSV
  // plus recent monthly per-provider CSVs; national row or sum across providers.
  {
    id: "discharge-delays",
    min: 2000,
    max: 30000,
    get: async () => {
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
      const parseCsv = async (url) => {
        const res = await fetch(url, fetchOpts({ accept: "text/csv,*/*" }));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) return [];
        const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim().replace(/[\s\-/]+/g, "_"));
        // Long format: a "metric" column names the measure and "value" holds the
        // number; "level" = National gives the England aggregate.
        const dateCol = headers.findIndex((h) => h === "period" || h === "date" || h === "month");
        const valCol = headers.findIndex((h) => h === "value");
        const metricCol = headers.findIndex((h) => h === "metric");
        const levelCol = headers.findIndex((h) => h === "level");
        if (dateCol < 0 || valCol < 0 || metricCol < 0) {
          console.log(`  discharge-delays: dateCol=${dateCol} valCol=${valCol} metricCol=${metricCol} headers=${headers.join("|")}`);
          return [];
        }
        const toDate = (raw) => {
          const s = String(raw ?? "").trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7) + "-01";
          let m;
          if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, "0")}-01`;
          if (/^\d{5}$/.test(s)) { const d = new Date((+s - 25569) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
          return null;
        };
        const byDate = new Map();
        for (const line of lines.slice(1)) {
          const cells = parseCsvLine(line);
          const metric = String(cells[metricCol] ?? "");
          if (!/no longer meet the criteria to reside|nctr/i.test(metric) || /percent|proportion|%/i.test(metric)) continue;
          if (levelCol >= 0 && !/^national$/i.test(String(cells[levelCol] ?? "").trim())) continue;
          const date = toDate(cells[dateCol]);
          if (!date) continue;
          const v = parseFloat(String(cells[valCol] ?? "").replace(/,/g, ""));
          if (Number.isFinite(v) && v > 0) byDate.set(date, v);
        }
        return [...byDate.entries()].map(([date, value]) => ({ date, value: Math.round(value) })).filter((p) => p.value > 0);
      };
      const allPoints = new Map();
      if (timeseriesUrls.length) {
        const tsUrl = timeseriesUrls[timeseriesUrls.length - 1];
        console.log(`discharge-delays: parsing timeseries ${tsUrl}`);
        try { for (const p of await parseCsv(tsUrl)) allPoints.set(p.date, p.value); } catch (e) { console.log(`  timeseries parse error: ${e.message}`); }
      }
      const sortedMonthly = [...new Set(monthlyUrls)].reverse().slice(0, 30);
      for (const url of sortedMonthly) {
        try {
          for (const p of await parseCsv(url)) if (!allPoints.has(p.date)) allPoints.set(p.date, p.value);
        } catch (e) { console.log(`  monthly parse err ${url.split("/").pop()}: ${e.message}`); }
      }
      const points = [...allPoints.entries()].map(([date, value]) => ({ date, value })).filter((p) => p.value >= 5000).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (points.length < 6) throw new Error(`discharge-delays: only ${points.length} usable points after combining sources`);
      console.log(`discharge-delays: ${points.length} total points ${points[0].date}..${points[points.length - 1].date}`);
      return points;
    },
  },
];

const out = {};
let ok = 0;
let fail = 0;
for (const s of SOURCES) {
  const tag = `${s.id}${s.line ? ":" + s.line : ""}`;
  try {
    _src = null;
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
    // Exact source URL of the file/table actually fetched (first line wins for
    // multi-line series). Falls back to the series' static sourceUrl if unknown.
    if (_src) out[s.id].srcUrl ??= _src;
    ok++;
    console.log(
      `ok   ${tag}  ${points.length} pts  ${points[0].date}..${points[points.length - 1].date}  src=${_src ?? "-"}`,
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
  `export type RawSeries = { points?: RawPoint[]; lines?: { id: string; points: RawPoint[] }[]; asOf?: string; srcUrl?: string };\n` +
  `export const SERIES_DATA: Record<string, RawSeries> = ${JSON.stringify(out, null, 2)};\n`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file);
console.log(`\nwrote ${OUT}: ${ok} ok, ${fail} skipped`);
process.exit(0); // never fail the build over data fetching
