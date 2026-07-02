#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CASES_PATH = path.join(ROOT, "docs/conformance/test-cases.json");
const DIST_DATA = path.join(ROOT, "dist/data");
const GOVVIZ_BASE = "https://egly443.github.io/Govviz/data";

function parseArgs(argv) {
  const args = { target: "govviz", offline: false };
  for (const arg of argv) {
    if (arg === "--offline") args.offline = true;
    else if (arg.startsWith("--target=")) args.target = arg.slice("--target=".length);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/run-conformance-suite.mjs [--target=govviz] [--offline]",
    "",
    "--target=govviz  Check Govviz reference records. This is the supported target.",
    "--offline        Read local dist/data instead of the live GitHub Pages deployment.",
  ].join("\n");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json,text/csv,text/plain;q=0.9,*/*;q=0.8",
      "user-agent": "Govviz conformance suite/0.1 (+https://egly443.github.io/Govviz/)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function getText(ref, { offline }) {
  if (!offline) return fetchText(ref);
  const url = new URL(ref);
  const rel = url.pathname.replace(/^\/Govviz\/data\/?/, "");
  return readFile(path.join(DIST_DATA, rel), "utf8");
}

function parseCsvRows(csv) {
  const rows = csv.trim().split(/\r?\n/);
  if (!rows.length || !rows[0]) return { header: [], records: [] };
  const header = rows[0].split(",").map((s) => s.trim());
  const records = rows.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
  return { header, records };
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function checkRequired(condition, message, failures) {
  if (!condition) failures.push(message);
}

function checkWarning(condition, message, warnings) {
  if (!condition) warnings.push(message);
}

async function checkGovvizCase(testCase, options) {
  const failures = [];
  const warnings = [];
  const seriesId = testCase.govviz_series_id;
  const published = testCase.govviz_published || {};
  const recordUrl = published.record || `${GOVVIZ_BASE}/series/${seriesId}.json`;
  const dataUrl = published.data || `${GOVVIZ_BASE}/series/${seriesId}/data.csv`;
  const csvwUrl = published.csvw || `${GOVVIZ_BASE}/series/${seriesId}/data.csv-metadata.json`;

  let record = null;
  let csvRows = { header: [], records: [] };

  try {
    record = JSON.parse(await getText(recordUrl, options));
  } catch (error) {
    failures.push(`record not readable: ${error.message}`);
  }

  if (record) {
    checkRequired(String(record.id || "").endsWith(`/series/${seriesId}.json`), "record id is not the stable series URL", failures);
    checkRequired(hasValue(record.title), "missing title", failures);
    checkRequired(hasValue(record.description), "missing description", failures);
    checkRequired(hasValue(record.unit), "missing unit", failures);
    checkRequired(hasValue(record.periodicity), "missing periodicity", failures);
    checkRequired(record.provenance && hasValue(record.provenance.upstreamUrl), "missing provenance.upstreamUrl", failures);
    checkRequired(record.provenance && hasValue(record.provenance.methodology), "missing provenance.methodology", failures);
    checkRequired(Array.isArray(record.distribution) && record.distribution.includes(dataUrl), "distribution does not include data CSV", failures);
    checkRequired(Array.isArray(record.distribution) && record.distribution.includes(csvwUrl), "distribution does not include CSVW metadata", failures);
    checkRequired(record.csvw === csvwUrl, "csvw pointer does not match expected URL", failures);
    checkRequired(hasValue(record.conformanceLevel), "missing conformanceLevel", failures);
    checkRequired(Array.isArray(record.limitations) && record.limitations.length > 0, "missing downstream limitations", failures);
    checkWarning(record.publisherClaim === "not-asserted-by-primary-publisher", "publisherClaim should avoid implying upstream assertion", warnings);
    checkWarning(record.upstreamConformance === "not-asserted-by-primary-publisher", "upstreamConformance should avoid implying upstream assertion", warnings);
  }

  try {
    csvRows = parseCsvRows(await getText(dataUrl, options));
    for (const required of ["period", "value", "unit", "status"]) {
      checkRequired(csvRows.header.includes(required), `CSV missing ${required} column`, failures);
    }
    checkRequired(csvRows.records.length > 0, "CSV has no observations", failures);
  } catch (error) {
    failures.push(`data CSV not readable: ${error.message}`);
  }

  if (csvRows.records.length && testCase.guard) {
    const values = csvRows.records
      .map((row) => Number.parseFloat(String(row.value ?? "").replace(/,/g, "")))
      .filter(Number.isFinite);
    checkRequired(values.length === csvRows.records.length, "CSV contains non-numeric observation values", failures);
    const low = values.filter((v) => v < testCase.guard.min);
    const high = values.filter((v) => v > testCase.guard.max);
    checkRequired(low.length === 0 && high.length === 0, `values outside guard ${testCase.guard.min}-${testCase.guard.max} ${testCase.guard.unit || ""}`.trim(), failures);
    if (record?.unit && testCase.guard.unit) {
      const guardUnit = testCase.guard.unit.toLowerCase();
      const recordUnit = String(record.unit).toLowerCase();
      checkWarning(recordUnit.includes(guardUnit) || guardUnit.includes(recordUnit), `record unit "${record.unit}" does not obviously match guard unit "${testCase.guard.unit}"`, warnings);
    }
  }

  try {
    JSON.parse(await getText(csvwUrl, options));
  } catch (error) {
    failures.push(`CSVW metadata not readable: ${error.message}`);
  }

  return {
    id: testCase.id,
    title: testCase.title,
    domain: testCase.domain,
    seriesId,
    target: "govviz",
    mode: options.offline ? "offline" : "live",
    status: failures.length ? "fail" : "pass",
    failures,
    warnings,
    recordUrl,
    dataUrl,
    csvwUrl,
    observationCount: csvRows.records.length,
    guard: testCase.guard || null,
  };
}

function markdownReport(report) {
  const lines = [
    "# Govviz Conformance Suite Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Target: ${report.target}`,
    `Mode: ${report.mode}`,
    "",
    `Summary: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed.`,
    "",
    "| Case | Series | Status | Observations | Notes |",
    "| --- | --- | --- | ---: | --- |",
  ];
  for (const result of report.results) {
    const notes = result.status === "pass"
      ? (result.warnings.length ? `Warnings: ${result.warnings.join("; ")}` : "OK")
      : result.failures.join("; ");
    lines.push(`| ${result.id} | ${result.seriesId} | ${result.status.toUpperCase()} | ${result.observationCount} | ${notes.replace(/\|/g, "\\|")} |`);
  }
  lines.push("", "## Record Links", "");
  for (const result of report.results) {
    lines.push(`- ${result.id}: ${result.recordUrl}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.target !== "govviz") {
    throw new Error("--target=govviz is currently the supported executable target; upstream probes remain case-specific evidence.");
  }

  const suite = await readJson(CASES_PATH);
  const results = [];
  for (const testCase of suite.cases) {
    results.push(await checkGovvizCase(testCase, args));
  }

  const report = {
    name: suite.name,
    suiteVersion: suite.version,
    generatedAt: new Date().toISOString(),
    target: args.target,
    mode: args.offline ? "offline" : "live",
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
    },
    results,
  };

  if (existsSync(DIST_DATA)) {
    await mkdir(DIST_DATA, { recursive: true });
    await writeFile(path.join(DIST_DATA, "conformance-suite-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(DIST_DATA, "conformance-suite-report.md"), markdownReport(report));
  }

  console.log(`Govviz conformance: ${report.summary.passed}/${report.summary.total} passed (${report.mode})`);
  if (report.summary.failed) {
    for (const result of results.filter((r) => r.status === "fail")) {
      console.log(`- ${result.id}: ${result.failures.join("; ")}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
