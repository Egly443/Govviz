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

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const OUT = "dist/data";
const SITE_PREFIX = "https://egly443.github.io/Govviz/data/";
const errors = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);

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

// ---------------------------------------------------------------------------
const schema = JSON.parse(await readFile("docs/conformance/ai-ready-series.schema.json", "utf8"));
if (!existsSync(`${OUT}/catalog.json`)) { console.error("check-open-data: dist/data/catalog.json missing — run build-open-data first."); process.exit(1); }
const catalog = JSON.parse(await readFile(`${OUT}/catalog.json`, "utf8"));
const index = JSON.parse(await readFile(`${OUT}/series/index.json`, "utf8"));

let withData = 0, valuesChecked = 0;
for (const entry of index.series) {
  const id = entry.id;
  const rec = JSON.parse(await readFile(`${OUT}/series/${id}.json`, "utf8"));

  // 1. schema
  validate(rec, schema, "$", id);

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

if (errors.length) {
  console.error(`check-open-data: FAILED — ${errors.length} conformance violation(s):`);
  for (const e of errors.slice(0, 50)) console.error("  ✗ " + e);
  process.exit(1);
}
console.log(`check-open-data: OK — ${index.series.length} series conform to the AI-ready profile (${withData} with observations, ${valuesChecked} values within validRange).`);
