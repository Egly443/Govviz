// Build the AI-ready open-data product: Govviz published as a reference
// implementation of its own "AI-ready series profile"
// (docs/conformance/ai-ready-series-profile.md), so an agent — or a 15-line
// script — can `resolve id → GET tidy data` for every series, with semantics
// in-band and no way to silently fetch a plausible-wrong measure.
//
// Emits under dist/data/:
//   catalog.json                         DCAT-AP catalogue (one dcat:Dataset / series)
//   profile.json / suppression/v1.json   the served, versioned contracts
//   series/index.json                    machine index
//   series/{id}.json                     the per-series METADATA RECORD (the stable id)
//   series/{id}/data.csv                 tidy long-format CSV (the `latest` alias)
//   series/{id}/data-{hash}.csv          content-versioned twin (cache-busting)
//   series/{id}/data.csv-metadata.json   CSVW table schema
//   index.html                           human portal, rendered FROM the catalogue
//
// Doctrine (from the essay): machine-first, human-rendered; stable identity +
// `latest` alias; semantics in-band; disclosure control encoded not erased;
// safe-by-construction (a published validRange lets a consumer reject a
// wrong-but-plausible value). Runs AFTER `vite build` and after the CI data
// fetch has populated src/generated/seriesData.ts.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const SITE = "https://egly443.github.io/Govviz";
const DATA_BASE = `${SITE}/data`;
const PROFILE_URL = `${DATA_BASE}/profile.json`;
const SUPPRESSION_URL = `${DATA_BASE}/suppression/v1`;
const OGL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
const CCBY = "https://creativecommons.org/licenses/by/4.0/";
const BUILT = new Date().toISOString().slice(0, 10);
const OUT = "dist/data";

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------------------
// Load the real registry + data accessors (single source of truth) via esbuild.
// ---------------------------------------------------------------------------
let mod;
try {
  const entry = `export * from ${JSON.stringify(resolve("src/components/data.ts"))};
export { departments, SPEND_BASIS } from ${JSON.stringify(resolve("src/components/departments.ts"))};`;
  const out = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  });
  const tmp = join(tmpdir(), `govviz-od-${process.pid}.mjs`);
  await writeFile(tmp, out.outputFiles[0].text, "utf8");
  mod = await import(pathToFileURL(tmp).href);
} catch (err) {
  console.error("build-open-data: failed to load registry:", err.message);
  process.exit(1);
}
const { departments, realAsOf, realSourceUrl, realGuard, realHash, realSourceBytesHash } = mod;

// ---------------------------------------------------------------------------
// Unit resolver. Values are stored in DISPLAY magnitude (e.g. waiting list 7.01
// = 7.01 million; spend in £bn), and "count" is heterogeneous — so the unit is
// derived by PROBING each series' own formatter and classified into an SDMX
// {unit, unitMultiplier (power of ten)} pair. The build asserts every series
// resolves and dumps the mapping for human verification, so a wrong/ambiguous
// unit can never ship (safe-by-construction).
// ---------------------------------------------------------------------------
function classifyUnit(s) {
  const probe = (fn, v) => { try { return String(fn(v)); } catch { return ""; } };
  const sf = s.shortFormat, f = s.format;
  const a = probe(sf, 1), b = probe(sf, 1234567), c = probe(f, 1234.5);
  const has = (re) => re.test(a) || re.test(b) || re.test(c);
  const U = (unit, mult, label, sdmx) => ({ unit, unitMultiplier: mult, unitLabel: label, sdmxUnit: sdmx });

  if (has(/%/)) return U("percent", 0, "percent (%)", "PT");
  if (has(/£/)) {
    if (has(/m\/day/)) return U("GBP per day", 6, "£ million per day", "GBP");
    if (has(/\/yr/)) return U("GBP per year", 0, "£ per year", "GBP");
    if (has(/tn|bn/)) return U("GBP", 9, "£ billion", "GBP"); // stored in £bn
    return U("GBP", 0, "£", "GBP"); // raw pounds (per head / per pupil / per prisoner)
  }
  if (has(/\$/)) return U("USD", 0, "US$", "USD");
  if (has(/\bmin\b|minute/)) return U("minutes", 0, "minutes", "1");
  if (has(/hrs?\b|hour/)) return U("hours", 0, "hours", "1"); // raw hours (display scales to 'm hrs')
  if (has(/×/)) return U("ratio", 0, "ratio (dimensionless)", "1");
  if (has(/beds/)) return U("beds", 0, "beds (daily)", "1");
  if (has(/\/\s*100\b/)) return U("index", 0, "index (0–100)", "1");
  if (has(/month/)) return U("months", 0, "months", "1");
  if (has(/yrs?\b|year/)) return U("years", 0, "years", "1");
  if (has(/days?\b/)) return U("days", 0, "days", "1");
  if (s.unit === "people" || has(/\dM\b/)) return U("persons", 6, "persons (millions shown)", "1");
  // A plain number whose own title/subtitle declares it an index (CPI/RPI/price index).
  if (/\bindex\b/i.test(`${s.title} ${s.subtitle || ""} ${s.definition || ""}`))
    return U("index", 0, "index (rebased)", "1");
  if (s.unit === "count" || s.unit === "currency" || has(/k\b/) || /^[\d,]+$/.test(b.trim()))
    return U("number", 0, "number", "1");
  throw new Error(`unclassified unit for ${s.id}: probes=${JSON.stringify([a, b, c])}`);
}

// ---------------------------------------------------------------------------
// Coverage → ONS statistical-geography code (only when unambiguous; never guess).
// ---------------------------------------------------------------------------
const GEO = {
  "england": "E92000001",
  "uk": "K02000001",
  "united kingdom": "K02000001",
  "great britain": "K03000001",
  "england & wales": "K04000001",
  "england and wales": "K04000001",
  "wales": "W92000004",
  "scotland": "S92000003",
  "northern ireland": "N92000002",
};
function geographyOf(coverage) {
  if (!coverage) return null;
  const key = coverage.trim().toLowerCase();
  if (GEO[key]) return { code: GEO[key], label: coverage };
  // comparator coverage like "UK vs Germany & France" — anchor on the UK subject.
  if (/\buk\b|united kingdom/i.test(coverage)) return { code: "K02000001", label: coverage, partial: true };
  if (/\bengland\b/i.test(coverage)) return { code: "E92000001", label: coverage, partial: true };
  return { code: null, label: coverage };
}

const ISO3 = { gbr: "GBR", deu: "DEU", fra: "FRA" };
const PERIODICITY = { monthly: "P1M", quarterly: "P3M", annual: "P1Y" };

function isWorldBank(s) { return /world bank/i.test(s.source || ""); }
function statisticTypeOf(s) {
  if (isWorldBank(s)) return "Aggregated international statistic";
  return "Official Statistic"; // conservative: never over-claim a National Statistic badge
}
function licenceOf(s) { return isWorldBank(s) ? CCBY : OGL; }

// Estimated next data period (one cadence step past the latest observation).
// Flagged estimated — we do not know publishers' actual release calendars.
function nextReleaseOf(latestDate, cadence) {
  if (!latestDate) return null;
  const d = new Date(latestDate);
  if (Number.isNaN(d.getTime())) return null;
  if (cadence === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else if (cadence === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const csvCell = (v) =>
  v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

// ---------------------------------------------------------------------------
// Build one series → { record, csv, csvw, dcatDataset, unitInfo, nPoints }.
// ---------------------------------------------------------------------------
function buildSeries(s, dept) {
  const id = `${DATA_BASE}/series/${s.id}.json`;
  const dataLatest = `${DATA_BASE}/series/${s.id}/data.csv`;
  const csvwUrl = `${DATA_BASE}/series/${s.id}/data.csv-metadata.json`;
  const unit = classifyUnit(s);
  const geo = geographyOf(s.coverage);
  const asOf = realAsOf(s.id) || (s.derivedFrom?.map(realAsOf).filter(Boolean).sort()[0]);
  const guard = realGuard(s.id) || (s.target ? undefined : undefined);
  const caveatProvisional = /provisional|interim|revised|forecast/i.test(s.caveat || "");

  // Observations (already baked into series.points / series.lines).
  const multi = Array.isArray(s.lines) && s.lines.filter((l) => l.points?.length).length > 1;
  const rows = [];
  if (multi) {
    for (const l of s.lines) {
      const area = ISO3[l.id] || l.id;
      for (const p of l.points || []) rows.push({ period: yr(p.date, s.cadence), ref_area: area, ...p });
    }
  } else {
    const pts = (s.points && s.points.length ? s.points : s.lines?.find((l) => l.points?.length)?.points) || [];
    for (const p of pts) rows.push({ period: yr(p.date, s.cadence), ...p });
  }
  const hasBand = rows.some((r) => r.lo != null && r.hi != null);
  // Per-row status: an observation's own baked status wins (e.g. a provisional
  // trailing point), else the series default derived from its caveat. Encoded,
  // not erased — so a downstream consumer can drop/keep provisional rows itself.
  const rowStatus = (r) => r.status || (caveatProvisional ? "provisional" : "final");
  // The series-level status is provisional if it is caveated as such OR any
  // individual observation is provisional.
  const revisionStatus =
    caveatProvisional || rows.some((r) => r.status === "provisional") ? "provisional" : "final";

  // CSV (long-format, one observation per row, typed; suppression-ready `status`).
  const cols = ["period"];
  if (multi) cols.push("ref_area");
  cols.push("value", "unit", "unit_multiplier", "status");
  if (hasBand) cols.push("lower", "upper");
  const header = cols.join(",");
  const lines = rows.map((r) => {
    const cells = [csvCell(r.period)];
    if (multi) cells.push(csvCell(r.ref_area));
    cells.push(csvCell(r.value), csvCell(unit.unit), csvCell(unit.unitMultiplier), csvCell(rowStatus(r)));
    if (hasBand) cells.push(csvCell(r.lo ?? ""), csvCell(r.hi ?? ""));
    return cells.join(",");
  });
  const csv = [header, ...lines].join("\n") + "\n";
  const dataHash = createHash("sha256").update(csv).digest("hex").slice(0, 12);
  const versioned = `${DATA_BASE}/series/${s.id}/data-${dataHash}.csv`;

  // Provenance — exceeds the profile: the exact upstream file + content/byte
  // fingerprints CI fetched, so lineage is independently verifiable.
  const provenance = {
    source: s.source,
    methodology: s.methodology || s.sourceUrl,
    derivation: s.derivedFrom
      ? `Computed from ${s.derivedFrom.join(", ")}${s.methodology ? `: ${s.methodology}` : ""}`
      : (s.methodology || "Direct from source; latest value validated against validRange"),
    upstreamUrl: realSourceUrl(s.id) || s.sourceUrl,
    fetchedAt: asOf || null,
    contentHash: realHash(s.id) || dataHash,
    sourceBytesHash: realSourceBytesHash(s.id) || null,
    compiledBy: "Govviz (downstream compiler — not the primary producer)",
  };

  const record = {
    "@context": PROFILE_URL,
    id,
    title: s.title,
    description: s.definition || s.subtitle || s.title,
    producer: s.source,
    statisticType: statisticTypeOf(s),
    measure: s.definition || s.subtitle || s.title,
    unit: unit.unit,
    unitMultiplier: unit.unitMultiplier,
    unitLabel: unit.unitLabel,
    geography: geo?.code || null,
    geographyLabel: geo?.label || s.coverage || null,
    periodicity: PERIODICITY[s.cadence] || null,
    ...(guard ? { validRange: { min: guard.min, max: guard.max } } : {}),
    suppressionScheme: SUPPRESSION_URL,
    revisionStatus,
    licence: licenceOf(s),
    provenance,
    nextRelease: nextReleaseOf(asOf, s.cadence),
    nextReleaseEstimated: true,
    latest: dataLatest,
    distribution: [dataLatest, versioned, csvwUrl, id],
    csvw: csvwUrl,
    agent: `${DATA_BASE}/mcp.json`,
    // Honest, additive context.
    basis: s.basis || null,
    caveat: s.caveat || null,
    lens: s.lens || null,
    goodDirection: s.goodDirection,
    ...(s.target ? { target: { value: s.target.value, label: s.target.label, kind: s.target.kind || "standard" } } : {}),
    department: { code: dept.code, name: dept.fullName },
    observationCount: rows.length,
  };

  // CSVW table schema (W3C) — semantics travel WITH the file.
  const columns = [
    { name: "period", titles: "period", datatype: "string", "dc:description": "Observation period (year, or ISO date)", propertyUrl: "http://purl.org/linked-data/sdmx/2009/dimension#timePeriod" },
  ];
  if (multi) columns.push({ name: "ref_area", titles: "ref_area", datatype: "string", "dc:description": "Reference area (ISO-3166 alpha-3 where a country)", propertyUrl: "http://purl.org/linked-data/sdmx/2009/dimension#refArea" });
  columns.push(
    { name: "value", titles: "value", datatype: "number", "dc:description": `Observation value in ${unit.unitLabel}`, propertyUrl: "http://purl.org/linked-data/sdmx/2009/measure#obsValue" },
    { name: "unit", titles: "unit", datatype: "string", "dc:description": "Unit of measure", propertyUrl: "http://purl.org/linked-data/sdmx/2009/attribute#unitMeasure" },
    { name: "unit_multiplier", titles: "unit_multiplier", datatype: "integer", "dc:description": "Power-of-ten multiplier: base value = value × 10^unit_multiplier", propertyUrl: "http://purl.org/linked-data/sdmx/2009/attribute#unitMult" },
    { name: "status", titles: "status", datatype: "string", "dc:description": "Observation status / suppression code", propertyUrl: "http://purl.org/linked-data/sdmx/2009/attribute#obsStatus" },
  );
  if (hasBand) columns.push(
    { name: "lower", titles: "lower", datatype: "number", "dc:description": "Lower bound of published confidence interval" },
    { name: "upper", titles: "upper", datatype: "number", "dc:description": "Upper bound of published confidence interval" },
  );
  const csvw = {
    "@context": ["http://www.w3.org/ns/csvw", { "@language": "en" }],
    url: `data-${dataHash}.csv`,
    "dc:title": s.title,
    "dc:description": record.description,
    "dc:publisher": { "schema:name": s.source },
    "dc:license": { "@id": record.licence },
    "dc:source": { "@id": provenance.upstreamUrl },
    tableSchema: { columns, primaryKey: multi ? ["period", "ref_area"] : ["period"] },
  };

  // DCAT-AP dataset entry.
  const dcatDataset = {
    "@type": "dcat:Dataset",
    "dct:identifier": s.id,
    "dct:title": s.title,
    "dct:description": record.description,
    "dct:publisher": { "@type": "foaf:Agent", "foaf:name": s.source },
    "dct:license": { "@id": record.licence },
    ...(geo?.code ? { "dct:spatial": { "@id": `https://statistics.data.gov.uk/id/statistical-geography/${geo.code}` } } : {}),
    "dct:accrualPeriodicity": record.periodicity,
    "dcat:keyword": [dept.fullName, ...(dept.themes || []), unit.unit],
    "dcat:landingPage": id,
    "dcat:distribution": [
      { "@type": "dcat:Distribution", "dcat:accessURL": dataLatest, "dcat:downloadURL": dataLatest, "dct:format": "text/csv", "dct:title": "Tidy CSV (latest)" },
      { "@type": "dcat:Distribution", "dcat:accessURL": csvwUrl, "dct:format": "application/csvm+json", "dct:title": "CSVW table schema" },
      { "@type": "dcat:Distribution", "dcat:accessURL": id, "dct:format": "application/json", "dct:title": "AI-ready series metadata record" },
    ],
  };

  return { record, csv, csvw, dcatDataset, unit, versionedName: `data-${dataHash}.csv`, nPoints: rows.length, hasGuard: !!guard };
}

function yr(date, cadence) {
  if (!date) return "";
  if (cadence === "annual") return String(new Date(date).getUTCFullYear());
  return String(date).slice(0, 7); // YYYY-MM
}

// ---------------------------------------------------------------------------
// Drive every department/series, write artifacts, assemble catalogue + portal.
// ---------------------------------------------------------------------------
const seen = new Set();
const built = [];
const unitDump = [];
let withData = 0, withGuard = 0;

for (const dept of departments) {
  for (const s of [dept.hero, ...dept.core, ...(dept.supporting ?? [])]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    let b;
    try { b = buildSeries(s, dept); }
    catch (err) { console.error(`build-open-data: ${s.id}: ${err.message}`); process.exit(1); }
    built.push({ s, dept, ...b });
    unitDump.push(`${s.id.padEnd(30)} ${b.unit.unit}×10^${b.unit.unitMultiplier}  (${b.unit.unitLabel})  pts=${b.nPoints}`);
    if (b.nPoints) withData++;
    if (b.hasGuard) withGuard++;

    const dir = `${OUT}/series/${s.id}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${OUT}/series/${s.id}.json`, JSON.stringify(b.record, null, 2));
    await writeFile(`${dir}/data.csv`, b.csv);
    await writeFile(`${dir}/${b.versionedName}`, b.csv);
    await writeFile(`${dir}/data.csv-metadata.json`, JSON.stringify(b.csvw, null, 2));
  }
}

// Machine index.
await mkdir(`${OUT}/series`, { recursive: true });
await writeFile(
  `${OUT}/series/index.json`,
  JSON.stringify(
    { built: BUILT, count: built.length, series: built.map((b) => ({ id: b.s.id, record: b.record.id, latest: b.record.latest, title: b.s.title })) },
    null, 2,
  ),
);

// DCAT catalogue.
const catalog = {
  "@context": {
    dcat: "http://www.w3.org/ns/dcat#", dct: "http://purl.org/dc/terms/",
    foaf: "http://xmlns.com/foaf/0.1/", "schema": "http://schema.org/",
  },
  "@type": "dcat:Catalog",
  "dct:title": "Govviz — AI-ready UK government performance series",
  "dct:description": "A reference implementation of the AI-ready series profile: every Govviz indicator published as stable-identified, CSVW-described tidy data with in-band semantics, provenance and a validation range. Govviz is a downstream compiler; each dataset names its primary producer.",
  "dct:publisher": { "@type": "foaf:Agent", "foaf:name": "Govviz" },
  "dct:modified": BUILT,
  "dct:license": { "@id": OGL },
  "dcat:dataset": built.map((b) => b.dcatDataset),
};
await writeFile(`${OUT}/catalog.json`, JSON.stringify(catalog, null, 2));

// Served profile + suppression scheme (the contracts the records reference).
await mkdir(`${OUT}/suppression`, { recursive: true });
await writeFile(`${OUT}/suppression/v1.json`, JSON.stringify(SUPPRESSION_SCHEME(), null, 2));
if (existsSync("docs/conformance/ai-ready-series-profile.md"))
  await writeFile(`${OUT}/profile.md`, await readFile("docs/conformance/ai-ready-series-profile.md", "utf8"));
await writeFile(`${OUT}/profile.json`, JSON.stringify(PROFILE_DOC(), null, 2));

// MCP descriptor (the agent layer points here).
await writeFile(`${OUT}/mcp.json`, JSON.stringify(MCP_DESCRIPTOR(), null, 2));

// Human portal, rendered FROM the catalogue (machine-first, human-rendered).
await writeFile(`${OUT}/index.html`, portalHtml(built));

// Register the data product in the sitemap + llms.txt (written by prerender-blog,
// which runs earlier in the chain) so crawlers and LLM agents discover it.
await patchDiscoverability(built);

console.log(`build-open-data: ${built.length} series (${withData} with observations, ${withGuard} with validRange)`);
console.log("UNIT MAP (verify against reality):\n" + unitDump.join("\n"));

// ---------------------------------------------------------------------------
async function patchDiscoverability(items) {
  // Sitemap: add the portal, catalogue, profile and every series record.
  try {
    const path = "dist/sitemap.xml";
    if (existsSync(path)) {
      let xml = await readFile(path, "utf8");
      const extra = [
        `${DATA_BASE}/`, `${DATA_BASE}/catalog.json`, `${DATA_BASE}/profile.json`,
        ...items.map((b) => b.record.id),
      ]
        .map((loc) => `  <url><loc>${loc}</loc><lastmod>${BUILT}</lastmod><priority>0.5</priority></url>`)
        .join("\n");
      xml = xml.replace("</urlset>", `${extra}\n</urlset>`);
      await writeFile(path, xml);
    }
  } catch (e) { console.warn("build-open-data: sitemap patch skipped:", e.message); }

  // llms.txt: add a Data section pointing agents at the catalogue + profile.
  try {
    const path = "dist/llms.txt";
    if (existsSync(path)) {
      let txt = await readFile(path, "utf8");
      if (!txt.includes("## Open data")) {
        txt += `\n## Open data (AI-ready, machine-first)\n- [DCAT catalogue](${DATA_BASE}/catalog.json): every Govviz series as a catalogued dataset with stable id, tidy CSV, CSVW and in-band semantics.\n- [AI-ready series profile](${DATA_BASE}/profile.json): the normative profile this data implements (resolve id → GET tidy data; published validRange to reject wrong-but-plausible values).\n- [Worked example](${DATA_BASE}/series/defra-sewage-hours.json): the essay's hardest case (sewage spill hours) collapsed to one record + one tidy file.\n- [Agent interface (MCP)](${DATA_BASE}/mcp.json): open agent layer over the catalogue.\n`;
        await writeFile(path, txt);
      }
    }
  } catch (e) { console.warn("build-open-data: llms.txt patch skipped:", e.message); }
}

function SUPPRESSION_SCHEME() {
  return {
    id: SUPPRESSION_URL,
    title: "Govviz observation-status & suppression scheme v1",
    description: "Codes used in the `status` column of every data file. Govviz publishes no statistically-disclosure-controlled microdata, so in practice only revision-status codes appear; suppression codes are defined so a consumer can rely on a single declared vocabulary, and so the scheme is forward-compatible with upstream SDC markers.",
    crosswalk: "SDMX OBS_STATUS; ONS/Code of Practice suppression markers",
    codes: {
      final: "Final / confirmed value",
      provisional: "Provisional value, subject to revision",
      revised: "Previously-published value, revised",
      estimated: "Estimated / modelled value",
      c: "Suppressed for statistical disclosure control (confidential, small cell)",
      x: "Not available / not applicable",
      z: "Not applicable (genuine zero or category does not exist)",
    },
  };
}

function PROFILE_DOC() {
  return {
    id: PROFILE_URL,
    title: "AI-ready series profile (v0.1) — served form",
    canonical: "https://github.com/Egly443/Govviz/blob/main/docs/conformance/ai-ready-series-profile.md",
    requiredFields: ["id", "title", "description", "producer", "statisticType", "measure", "unit", "geography", "periodicity", "validRange", "suppressionScheme", "revisionStatus", "licence", "provenance", "nextRelease", "latest"],
    optionalFields: ["csvw", "agent", "unitMultiplier", "basis", "caveat", "lens", "target"],
    dataFile: "Long-format, one observation per row: period,value,unit,unit_multiplier,status (+ref_area for multi-area, +lower,upper for published CIs).",
    note: "validRange may be absent on derived ratio series and on a local build with no CI-fetched data; it is present for directly-fetched series in the production build.",
  };
}

function MCP_DESCRIPTOR() {
  return {
    name: "govviz-open-data",
    description: "Open-agent (MCP) interface over the Govviz AI-ready series catalogue. Reference stdio server: tools/mcp/govviz-mcp.mjs in the repository.",
    transport: "stdio",
    repository: "https://github.com/Egly443/Govviz/blob/main/tools/mcp/govviz-mcp.mjs",
    catalogue: `${DATA_BASE}/catalog.json`,
    tools: [
      { name: "list_series", description: "List all series (id, title, unit, periodicity)." },
      { name: "get_series_metadata", description: "Get the AI-ready metadata record for a series id." },
      { name: "get_observations", description: "Get the tidy observations for a series id." },
    ],
    note: "Standards under standards: the data is independently usable via DCAT/CSVW, so the agent interface carries no lock-in.",
  };
}

function portalHtml(items) {
  const css = `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b0d12;color:#e7e9ee;font:15px/1.6 Inter,system-ui,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:2.5rem 1.25rem 5rem}a{color:#8ab4ff}h1{font-size:1.8rem;margin:0 0 .4rem}
.lead{color:#9aa3b2;max-width:60ch}code{background:#11141c;border:1px solid #232838;border-radius:.3rem;padding:.1rem .35rem;font:.85em ui-monospace,monospace}
pre{background:#11141c;border:1px solid #232838;border-radius:.5rem;padding:.8rem 1rem;overflow-x:auto;font-size:.82rem}
table{width:100%;border-collapse:collapse;margin-top:1.5rem;font-size:.84rem}th,td{border-bottom:1px solid #232838;padding:.45rem .5rem;text-align:left;vertical-align:top}
th{color:#9aa3b2;font-weight:600}.muted{color:#9aa3b2}.links a{margin-right:.6rem;white-space:nowrap}`;
  const rows = items.map((b) => {
    const r = b.record;
    const base = `series/${b.s.id}`;
    return `<tr><td><strong>${esc(r.title)}</strong><div class="muted">${esc(r.department.name)} · ${esc(r.unitLabel)} · ${esc(r.geographyLabel || "")}${r.observationCount ? ` · ${r.observationCount} obs` : ' · <em>no data locally</em>'}</div></td>
<td class="links"><a href="${base}.json">record</a><a href="${base}/data.csv">csv</a><a href="${base}/data.csv-metadata.json">csvw</a></td></tr>`;
  }).join("\n");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Govviz — AI-ready open data</title>
<meta name="description" content="Every Govviz UK-government performance series, published as AI-ready open data: stable IDs, tidy CSV, CSVW, DCAT catalogue, in-band semantics and a validation range — a reference implementation of the AI-ready series profile.">
<link rel="canonical" href="${DATA_BASE}/">
<link rel="alternate" type="application/ld+json" href="${DATA_BASE}/catalog.json">
<style>${css}</style></head><body><div class="wrap">
<nav class="muted"><a href="${SITE}/">← Govviz</a> · <a href="${SITE}/blog">The essay</a> · <a href="https://github.com/Egly443/Govviz/blob/main/docs/conformance/ai-ready-series-profile.md">Profile</a></nav>
<h1>AI-ready open data</h1>
<p class="lead">Govviz publishes every indicator as a <strong>reference implementation of its own <a href="${SITE}/blog">AI-ready series profile</a></strong>: resolve a stable id → tidy CSV, with unit, coverage, periodicity, revision status, provenance and a published <em>validation range</em> in-band. No scraping, no tab-guessing, no wrong-but-plausible measure. Govviz is a downstream compiler; every record names its primary producer.</p>
<p class="muted">Catalogue: <a href="catalog.json">catalog.json</a> (DCAT) · Profile: <a href="profile.json">profile.json</a> · Suppression scheme: <a href="suppression/v1.json">v1</a> · Agent: <a href="mcp.json">MCP</a></p>
<h2>Read any series in three lines</h2>
<pre>curl -s ${DATA_BASE}/series/defra-sewage-hours.json | jq '.title,.unit,.validRange'
curl -s ${DATA_BASE}/series/defra-sewage-hours/data.csv</pre>
<table><thead><tr><th>Series (${items.length})</th><th>Downloads</th></tr></thead><tbody>
${rows}
</tbody></table>
<p class="muted" style="margin-top:2rem">Built ${BUILT}. Licence: gov-sourced series under OGL v3; World-Bank-derived series under CC BY 4.0 (attribution preserved). See <a href="https://github.com/Egly443/Govviz/blob/main/DATA-LICENCE.md">DATA-LICENCE</a>.</p>
</div></body></html>`;
}
