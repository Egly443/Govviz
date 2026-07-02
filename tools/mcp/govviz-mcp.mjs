#!/usr/bin/env node
// Govviz Open Data — reference MCP server (the M5 "open agent interface").
//
// This is the agent layer *over* the open-data foundation (DCAT/CSVW/tidy CSV)
// the build publishes. Because the data underneath is independently usable, the
// interface carries no lock-in — "standards under standards" (the essay's
// Phase 4). Zero dependencies: it speaks newline-delimited JSON-RPC 2.0 over
// stdio (the MCP stdio transport) directly, so the protocol is plain to read.
//
// It serves the *published* catalogue, so it works against the live site with
// no local checkout:
//   GOVVIZ_DATA_BASE  (default https://egly443.github.io/Govviz/data)
//
// Run:   node tools/mcp/govviz-mcp.mjs
// Wire into Claude Desktop / any MCP client — see tools/mcp/README.md.

import { createInterface } from "node:readline";

const BASE = (process.env.GOVVIZ_DATA_BASE || "https://egly443.github.io/Govviz/data").replace(/\/+$/, "");
const NAME = "govviz-open-data";
const VERSION = "0.2.0";

async function getJson(url) {
  const r = await fetch(url, { headers: { "user-agent": `${NAME}/${VERSION}` } });
  if (!r.ok) throw new Error(`GET ${url} → HTTP ${r.status}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: { "user-agent": `${NAME}/${VERSION}` } });
  if (!r.ok) throw new Error(`GET ${url} → HTTP ${r.status}`);
  return r.text();
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  if (!lines.length || !lines[0]) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string" && value.trim()) return Number(value);
  return NaN;
}

function periodMatches(period, periodicity) {
  if (!periodicity) return { status: "skipped", reason: "No periodicity metadata is published." };
  const p = String(period ?? "").trim();
  if (!p) return { status: "skipped", reason: "No proposed period supplied." };

  if (periodicity === "P1Y") {
    return /^\d{4}$/.test(p)
      ? { status: "passed", reason: "Annual period matches YYYY." }
      : { status: "failed", reason: "Annual series expects a YYYY period." };
  }
  if (periodicity === "P1M") {
    return /^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(p)
      ? { status: "passed", reason: "Monthly period matches YYYY-MM or YYYY-MM-DD." }
      : { status: "failed", reason: "Monthly series expects YYYY-MM or YYYY-MM-DD." };
  }
  if (periodicity === "P3M") {
    const m = p.match(/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/);
    if (!m) return { status: "failed", reason: "Quarterly series expects a quarter-start YYYY-MM or YYYY-MM-DD period." };
    return ["01", "04", "07", "10"].includes(m[1])
      ? { status: "passed", reason: "Quarterly period starts in Jan, Apr, Jul or Oct." }
      : { status: "failed", reason: "Quarterly period should start in Jan, Apr, Jul or Oct." };
  }
  return { status: "skipped", reason: `No validator for periodicity ${periodicity}.` };
}

const checkSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["passed", "failed", "skipped"] },
    reason: { type: "string" },
  },
  required: ["status", "reason"],
  additionalProperties: false,
};

// ---- tool implementations --------------------------------------------------
const TOOLS = {
  list_series: {
    description:
      "List published Govviz AI-ready series with pagination and optional filters. Use the id with the other tools.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        cursor: { type: "string", description: "Opaque cursor returned by the previous page." },
        department: { type: "string", description: "Department code or name, e.g. dhsc or Health & Social Care." },
        theme: { type: "string", description: "Keyword/theme match from the DCAT keyword list." },
        cadence: { type: "string", description: "Expected cadence or ISO periodicity, e.g. monthly, quarterly, annual, P1M." },
        q: { type: "string", description: "Case-insensitive text search over id, title and description." },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        count: { type: "integer" },
        total: { type: "integer" },
        limit: { type: "integer" },
        nextCursor: { type: ["string", "null"] },
        series: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              description: { type: ["string", "null"] },
              department: {
                type: ["object", "null"],
                properties: { code: { type: "string" }, name: { type: "string" } },
                required: ["code", "name"],
                additionalProperties: false,
              },
              unit: { type: ["string", "null"] },
              periodicity: { type: ["string", "null"] },
              expectedCadence: { type: ["string", "null"] },
              keywords: { type: "array", items: { type: "string" } },
              observationCount: { type: ["integer", "null"] },
              record: { type: "string" },
            },
            required: ["id", "title", "record"],
            additionalProperties: false,
          },
        },
      },
      required: ["count", "total", "limit", "nextCursor", "series"],
      additionalProperties: false,
    },
    async run({ limit = 50, cursor, department, theme, cadence, q } = {}) {
      const idx = await getJson(`${BASE}/series/index.json`);
      const cat = await getJson(`${BASE}/catalog.json`);
      const byId = new Map((cat["dcat:dataset"] || []).map((d) => [d["dct:identifier"], d]));
      const metadata = await Promise.all(idx.series.map(async (s) => {
        try {
          return [s.id, await getJson(`${BASE}/series/${encodeURIComponent(s.id)}.json`)];
        } catch {
          return [s.id, null];
        }
      }));
      const metaById = new Map(metadata);
      const start = Math.max(0, Number.parseInt(cursor || "0", 10) || 0);
      const pageSize = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 50));
      const filters = { department: norm(department), theme: norm(theme), cadence: norm(cadence), q: norm(q) };
      const rows = idx.series.map((s) => {
        const d = byId.get(s.id) || {};
        const meta = metaById.get(s.id) || {};
        return {
          id: s.id,
          title: meta.title || s.title,
          description: meta.description || d["dct:description"] || null,
          department: meta.department || null,
          unit: meta.unit || null,
          periodicity: meta.periodicity || d["dct:accrualPeriodicity"] || null,
          expectedCadence: meta.expectedCadence || null,
          keywords: d["dcat:keyword"] || [],
          observationCount: Number.isInteger(meta.observationCount) ? meta.observationCount : null,
          record: s.record,
        };
      }).filter((s) => {
        const departmentText = norm(`${s.department?.code || ""} ${s.department?.name || ""}`);
        const keywordText = norm(s.keywords.join(" "));
        const cadenceText = norm(`${s.expectedCadence || ""} ${s.periodicity || ""}`);
        const searchText = norm(`${s.id} ${s.title} ${s.description || ""}`);
        return (!filters.department || departmentText.includes(filters.department))
          && (!filters.theme || keywordText.includes(filters.theme))
          && (!filters.cadence || cadenceText.includes(filters.cadence))
          && (!filters.q || searchText.includes(filters.q));
      });
      const series = rows.slice(start, start + pageSize);
      const next = start + pageSize < rows.length ? String(start + pageSize) : null;
      return { count: series.length, total: rows.length, limit: pageSize, nextCursor: next, series };
    },
  },
  get_series_metadata: {
    description:
      "Get the full AI-ready metadata record for a series id: unit, coverage, periodicity, revision status, provenance, licence and the published validRange (use it to reject a wrong-but-plausible value).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Series id, e.g. defra-sewage-hours" } },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        unit: { type: ["string", "null"] },
        periodicity: { type: ["string", "null"] },
        validRange: {
          type: "object",
          properties: { min: { type: "number" }, max: { type: "number" } },
          required: ["min", "max"],
          additionalProperties: false,
        },
      },
      additionalProperties: true,
    },
    async run({ id }) {
      return getJson(`${BASE}/series/${encodeURIComponent(id)}.json`);
    },
  },
  get_observations: {
    description:
      "Get the tidy observations for a series id as rows of {period,value,unit,unit_multiplier,status}. Base-unit value = value × 10^unit_multiplier.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Series id, e.g. defra-sewage-hours" } },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              period: { type: "string" },
              value: { type: "string" },
              unit: { type: "string" },
              unit_multiplier: { type: "string" },
              status: { type: "string" },
            },
            required: ["period", "value", "unit", "unit_multiplier", "status"],
            additionalProperties: true,
          },
        },
      },
      required: ["id", "observations"],
      additionalProperties: false,
    },
    async run({ id }) {
      const csv = await getText(`${BASE}/series/${encodeURIComponent(id)}/data.csv`);
      return { id, observations: parseCsv(csv) };
    },
  },
  validate_value: {
    description:
      "Validate a proposed observation value against the series validRange, unit and periodicity metadata where Govviz publishes those checks.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Series id, e.g. defra-sewage-hours" },
        value: { type: ["number", "string"], description: "Proposed observation value in the published display unit." },
        period: { type: "string", description: "Proposed period, e.g. 2026, 2026-03, or 2026-03-01." },
        unit: { type: "string", description: "Proposed unit label to compare with the metadata unit." },
      },
      required: ["id", "value"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        valid: { type: "boolean" },
        checks: {
          type: "object",
          properties: { range: checkSchema, unit: checkSchema, periodicity: checkSchema },
          required: ["range", "unit", "periodicity"],
          additionalProperties: false,
        },
        metadata: {
          type: "object",
          properties: {
            title: { type: "string" },
            unit: { type: ["string", "null"] },
            unitLabel: { type: ["string", "null"] },
            periodicity: { type: ["string", "null"] },
            validRange: { type: ["object", "null"] },
          },
          required: ["title", "unit", "unitLabel", "periodicity", "validRange"],
          additionalProperties: false,
        },
      },
      required: ["id", "valid", "checks", "metadata"],
      additionalProperties: false,
    },
    async run({ id, value, period, unit }) {
      const meta = await getJson(`${BASE}/series/${encodeURIComponent(id)}.json`);
      const n = toNumber(value);
      const checks = {
        range: { status: "skipped", reason: "No validRange metadata is published." },
        unit: { status: "skipped", reason: "No proposed unit supplied." },
        periodicity: periodMatches(period, meta.periodicity),
      };

      if (meta.validRange && Number.isFinite(meta.validRange.min) && Number.isFinite(meta.validRange.max)) {
        checks.range = Number.isFinite(n) && n >= meta.validRange.min && n <= meta.validRange.max
          ? { status: "passed", reason: `Value is inside ${meta.validRange.min}..${meta.validRange.max}.` }
          : { status: "failed", reason: `Value must be a number inside ${meta.validRange.min}..${meta.validRange.max}.` };
      }
      if (unit && (meta.unit || meta.unitLabel)) {
        const allowed = [meta.unit, meta.unitLabel].filter(Boolean).map(norm);
        checks.unit = allowed.includes(norm(unit))
          ? { status: "passed", reason: "Unit matches the published metadata." }
          : { status: "failed", reason: `Unit should match ${[meta.unit, meta.unitLabel].filter(Boolean).join(" or ")}.` };
      }

      return {
        id,
        valid: Object.values(checks).every((c) => c.status !== "failed"),
        checks,
        metadata: {
          title: meta.title,
          unit: meta.unit || null,
          unitLabel: meta.unitLabel || null,
          periodicity: meta.periodicity || null,
          validRange: meta.validRange || null,
        },
      };
    },
  },
  get_data_health: {
    description:
      "Return current catalogue health plus recent rolling health-history snapshots when the published file is available.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        built: { type: ["string", "null"] },
        totalSeries: { type: "integer" },
        withObservations: { type: "integer" },
        withValidRange: { type: "integer" },
        freshness: { type: "object", additionalProperties: { type: "integer" } },
        historyEntries: { type: "integer" },
        history: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      required: ["built", "totalSeries", "withObservations", "withValidRange", "freshness", "historyEntries", "history"],
      additionalProperties: false,
    },
    async run() {
      const idx = await getJson(`${BASE}/series/index.json`);
      const records = await Promise.all(idx.series.map((s) => getJson(`${BASE}/series/${encodeURIComponent(s.id)}.json`)));
      let history = [];
      try {
        const health = await getJson(`${BASE}/health-history.json`);
        history = Array.isArray(health.entries) ? health.entries.slice(0, 5) : [];
      } catch {
        history = [];
      }
      const freshness = {};
      for (const record of records) freshness[record.freshnessStatus || "unknown"] = (freshness[record.freshnessStatus || "unknown"] || 0) + 1;
      return {
        built: idx.built || null,
        totalSeries: records.length,
        withObservations: records.filter((r) => (r.observationCount || 0) > 0).length,
        withValidRange: records.filter((r) => r.validRange).length,
        freshness,
        historyEntries: history.length,
        history,
      };
    },
  },
};

// ---- JSON-RPC 2.0 over stdio ----------------------------------------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function result(id, res) { send({ jsonrpc: "2.0", id, result: res }); }
function error(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return result(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: NAME, version: VERSION },
      instructions:
        "Govviz publishes UK government performance indicators as AI-ready open data. Call list_series, then get_series_metadata / get_observations. Always honour validRange.",
    });
  }
  if (method === "notifications/initialized" || method === "initialized") return; // no response to notifications
  if (method === "ping") return result(id, {});
  if (method === "tools/list") {
    return result(id, {
      tools: Object.entries(TOOLS).map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
      })),
    });
  }
  if (method === "tools/call") {
    const tool = TOOLS[params?.name];
    if (!tool) return error(id, -32602, `Unknown tool: ${params?.name}`);
    try {
      const out = await tool.run(params.arguments || {});
      return result(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      return result(id, { isError: true, content: [{ type: "text", text: `Error: ${e.message}` }] });
    }
  }
  if (id !== undefined) error(id, -32601, `Method not found: ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return; }
  Promise.resolve(handle(msg)).catch((e) => {
    if (msg?.id !== undefined) error(msg.id, -32603, String(e?.message || e));
  });
});
process.stdin.on("close", () => process.exit(0));
