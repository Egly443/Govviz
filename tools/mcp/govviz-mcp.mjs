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
const VERSION = "0.1.0";

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
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

// ---- tool implementations --------------------------------------------------
const TOOLS = {
  list_series: {
    description:
      "List every published Govviz AI-ready series (id, title, unit, periodicity). Use the id with the other tools.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      const idx = await getJson(`${BASE}/series/index.json`);
      // Enrich from each record's lightweight fields via the catalogue.
      const cat = await getJson(`${BASE}/catalog.json`);
      const byId = new Map((cat["dcat:dataset"] || []).map((d) => [d["dct:identifier"], d]));
      const rows = idx.series.map((s) => {
        const d = byId.get(s.id) || {};
        return { id: s.id, title: s.title, periodicity: d["dct:accrualPeriodicity"] || null };
      });
      return { count: rows.length, series: rows };
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
    async run({ id }) {
      const csv = await getText(`${BASE}/series/${encodeURIComponent(id)}/data.csv`);
      return { id, observations: parseCsv(csv) };
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
      tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })),
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
