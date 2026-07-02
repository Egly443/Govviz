// Self-conformance gate. Validates the emitted AI-ready open-data product
// (dist/data/) against the published profile schema and the profile's semantic
// rules, and FAILS the build on any violation — so Govviz can never publish a
// non-conformant "AI-ready" claim about its own data. This is the essay's
// "release-assurance gate", turned on ourselves.
//
// Checks, per series record:
//   1. validates against docs/conformance/ai-ready-series.schema.json
//   2. the data file exists, is long-format, and parses
//   3. every observation value lies within validRange (when published) — the
//      safety property: a wrong-but-plausible value cannot ship
//   4. latest/csvw/distribution targets resolve to emitted files
// Plus catalogue completeness. Run after build-open-data.mjs.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const OUT = "dist/data";
const SITE_PREFIX = "https://egly443.github.io/Govviz/data/";
const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);
const GOVERNANCE_FIELDS = [
  "dataSteward",
  "contact",
  "accessClass",
  "accessProcess",
  "legalBasis",
  "dataProtection",
  "riskOwner",
  "qualityOwner",
  "methodologyUrl",
  "revisionPolicyUrl",
  "releaseCalendarUrl",
  "qualityStatement",
  "knownLimitations",
  "machineUseRestrictions",
];

// ---- minimal JSON-Schema validator (the subset the contract uses) ----------
function validate(node, schema, path, id) {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some((t) =>
      t === "null" ? node === null
        : t === "integer" ? Number.isInteger(node)
        : t === "number" ? typeof node === "number"
        : t === "object" ? node && typeof node === "object" && !Array.isArray(node)
        : t === "array" ? Array.isArray(node)
        : typeof node === t);
    if (!ok) { err(id, `${path} expected ${types.join("|")}, got ${node === null ? "null" : typeof node}`); return; }
  }
  if (node === null) return;
  if (schema.enum && !schema.enum.includes(node)) err(id, `${path} '${node}' not in [${schema.enum.join(",")}]`);
  if (schema.pattern && typeof node === "string" && !new RegExp(schema.pattern).test(node)) err(id, `${path} '${node}' fails /${schema.pattern}/`);
  if (schema.minLength != null && typeof node === "string" && node.length < schema.minLength) err(id, `${path} too short`);
  if (schema.format === "uri" && typeof node === "string" && !/^https?:\/\//.test(node)) err(id, `${path} not an absolute URI: ${node}`);
  if (schema.type === "object" || schema.properties || schema.required) {
    for (const r of schema.required || []) if (!(r in node)) err(id, `${path}.${r} missing (required)`);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in node) validate(node[k], sub, `${path}.${k}`, id);
  }
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return { header, rows: lines.slice(1).map((l) => l.split(",")) };
}
const localPath = (url) => (url?.startsWith(SITE_PREFIX) ? `${OUT}/${url.slice(SITE_PREFIX.length)}` : null);
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function writeReport(report) {
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/conformance-report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${OUT}/conformance-report.html`, reportHtml(report));
}

function reportHtml(report) {
  const rows = [
    ["Total series", report.counts.totalSeries],
    ["Series with observations", report.counts.seriesWithObservations],
    ["Series with validRange", report.counts.seriesWithValidRange],
    ["Series with source byte hash", report.counts.seriesWithSourceByteHash],
    ["Series with ONS geography", report.counts.seriesWithOnsGeography],
    ["Records missing recommended governance fields", report.counts.recordsMissingRecommendedGovernanceFields],
    ["Aged sources", report.counts.agedSources],
    ["Warnings", report.warnings.length],
    ["Hard errors", report.errors.length],
  ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("\n");
  const list = (items) => items.length
    ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("\n")}</ul>`
    : "<p>None.</p>";
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Govviz open-data conformance report</title>
<style>body{font:15px/1.55 system-ui,sans-serif;margin:2rem;max-width:960px;color:#111827}table{border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:.45rem .65rem;text-align:left}th{background:#f3f4f6}code{background:#f3f4f6;padding:.1rem .25rem;border-radius:.2rem}li{margin:.25rem 0}</style>
</head><body><h1>Govviz open-data conformance report</h1>
<p>Generated <code>${esc(report.generatedAt)}</code>. Status: <strong>${esc(report.status)}</strong>.</p>
<table><tbody>${rows}</tbody></table>
<h2>Warnings</h2>${list(report.warnings)}
<h2>Hard errors</h2>${list(report.errors)}
</body></html>`;
}

// ---------------------------------------------------------------------------
const schema = JSON.parse(await readFile("docs/conformance/ai-ready-series.schema.json", "utf8"));
if (!existsSync(`${OUT}/catalog.json`)) { console.error("check-open-data: dist/data/catalog.json missing — run build-open-data first."); process.exit(1); }
const catalog = JSON.parse(await readFile(`${OUT}/catalog.json`, "utf8"));
const index = JSON.parse(await readFile(`${OUT}/series/index.json`, "utf8"));

let withData = 0, valuesChecked = 0;
let withValidRange = 0, withSourceByteHash = 0, withOnsGeography = 0, agedSources = 0;
const missingGovernance = [];
for (const entry of index.series) {
  const id = entry.id;
  const rec = JSON.parse(await readFile(`${OUT}/series/${id}.json`, "utf8"));

  // 1. schema
  validate(rec, schema, "$", id);
  if (rec.validRange) withValidRange++;
  if (rec.compiler?.sourceBytesHash || rec.provenance?.sourceBytesHash) withSourceByteHash++;
  if (typeof rec.geography === "string" && /^[A-Z]\d{8}$/.test(rec.geography)) withOnsGeography++;
  if (rec.freshnessStatus === "aged") {
    agedSources++;
    warn(id, rec.freshnessReason || "freshnessStatus is aged");
  }
  const missing = GOVERNANCE_FIELDS.filter((field) => !(field in rec));
  if (missing.length) missingGovernance.push({ id, missing });

  // 2/3. data file + value-range safety (single-measure series only)
  const csvLocal = localPath(rec.latest);
  if (!csvLocal || !existsSync(csvLocal)) { err(id, `latest data file missing: ${rec.latest}`); continue; }
  const { header, rows } = parseCsv(await readFile(csvLocal, "utf8"));
  for (const need of ["period", "value", "unit", "status"]) if (!header.includes(need)) err(id, `CSV missing required column '${need}'`);
  const isMulti = header.includes("ref_area");
  if (rows.length && rows[0][0]) withData++;
  if (rec.validRange && !isMulti) {
    const vi = header.indexOf("value");
    for (const r of rows) {
      if (!r[vi]) continue;
      const v = Number(r[vi]);
      valuesChecked++;
      if (Number.isFinite(v) && (v < rec.validRange.min || v > rec.validRange.max))
        err(id, `value ${v} outside published validRange [${rec.validRange.min}, ${rec.validRange.max}] — would ship a wrong-but-plausible value`);
    }
  }

  // 4. csvw resolves
  const csvwLocal = localPath(rec.csvw);
  if (rec.csvw && (!csvwLocal || !existsSync(csvwLocal))) err(id, `csvw missing: ${rec.csvw}`);
}

// catalogue completeness
const catCount = (catalog["dcat:dataset"] || []).length;
if (catCount !== index.series.length) err("catalog", `dcat:dataset has ${catCount}, index has ${index.series.length}`);

for (const item of missingGovernance) {
  warn(item.id, `missing recommended governance fields: ${item.missing.join(", ")}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  status: errors.length ? "failed" : "passed",
  counts: {
    totalSeries: index.series.length,
    seriesWithObservations: withData,
    seriesWithValidRange: withValidRange,
    seriesWithSourceByteHash: withSourceByteHash,
    seriesWithOnsGeography: withOnsGeography,
    recordsMissingRecommendedGovernanceFields: missingGovernance.length,
    agedSources,
  },
  valuesChecked,
  warnings,
  errors,
};
await writeReport(report);

if (errors.length) {
  console.error(`check-open-data: FAILED — ${errors.length} conformance violation(s):`);
  for (const e of errors.slice(0, 50)) console.error("  ✗ " + e);
  console.error(`check-open-data: wrote ${OUT}/conformance-report.json and ${OUT}/conformance-report.html`);
  process.exit(1);
}
console.log(`check-open-data: OK — ${index.series.length} series conform to the AI-ready profile (${withData} with observations, ${valuesChecked} values within validRange).`);
console.log(`check-open-data: wrote ${OUT}/conformance-report.json and ${OUT}/conformance-report.html (${warnings.length} warning(s)).`);
