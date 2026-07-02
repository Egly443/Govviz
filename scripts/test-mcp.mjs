#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DATA_DIR = resolve(ROOT, "dist/data");
const SERVER = resolve(ROOT, "tools/mcp/govviz-mcp.mjs");

const TYPES = new Map([
  [".csv", "text/csv; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function serveStatic(root) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
    const file = resolve(root, `.${sep}${safePath}`);
    if (!file.startsWith(`${root}${sep}`)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("Not a file");
    } catch {
      res.writeHead(404).end("Not found");
      return;
    }
    const stream = createReadStream(file);
    stream.on("error", () => res.destroy());
    res.writeHead(200, { "content-type": TYPES.get(extname(file)) || "application/octet-stream" });
    stream.pipe(res);
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

function callFactory(child) {
  let id = 1;
  const pending = new Map();
  const stderr = [];
  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const item = pending.get(msg.id);
    if (!item) return;
    pending.delete(msg.id);
    if (msg.error) item.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else item.resolve(msg.result);
  });
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));

  return {
    stderr,
    call(method, params) {
      const requestId = id++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
      return new Promise((resolveCall, rejectCall) => {
        pending.set(requestId, { resolve: resolveCall, reject: rejectCall });
        setTimeout(() => {
          if (!pending.has(requestId)) return;
          pending.delete(requestId);
          rejectCall(new Error(`Timed out waiting for ${method}`));
        }, 10000);
      });
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
  };
}

function toolText(result) {
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Tool call returned no text content.");
  return JSON.parse(text);
}

async function main() {
  await access(join(DATA_DIR, "series/index.json"));
  const http = await serveStatic(DATA_DIR);
  const port = http.address().port;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, GOVVIZ_DATA_BASE: base },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const rpc = callFactory(child);

  try {
    const init = await rpc.call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "govviz-smoke", version: "0.1.0" } });
    if (init.serverInfo?.name !== "govviz-open-data") throw new Error("Unexpected MCP server name.");
    rpc.notify("notifications/initialized", {});

    const listed = await rpc.call("tools/list", {});
    const tools = new Map((listed.tools || []).map((tool) => [tool.name, tool]));
    for (const name of ["list_series", "get_series_metadata", "get_observations", "validate_value", "get_data_health"]) {
      if (!tools.has(name)) throw new Error(`Missing MCP tool: ${name}`);
      if (!tools.get(name).inputSchema || !tools.get(name).outputSchema) throw new Error(`Missing schemas for MCP tool: ${name}`);
    }

    const page = toolText(await rpc.call("tools/call", { name: "list_series", arguments: { limit: 5, department: "dhsc" } }));
    if (!Array.isArray(page.series) || page.series.length === 0) throw new Error("list_series returned no series.");
    const series = page.series[0].id;

    const metadata = toolText(await rpc.call("tools/call", { name: "get_series_metadata", arguments: { id: series } }));
    if (!metadata.title) throw new Error("get_series_metadata returned no title.");

    const observations = toolText(await rpc.call("tools/call", { name: "get_observations", arguments: { id: series } }));
    if (!Array.isArray(observations.observations)) throw new Error("get_observations returned no observation array.");

    const validation = toolText(await rpc.call("tools/call", {
      name: "validate_value",
      arguments: { id: series, value: 1, period: "2026-01", unit: metadata.unit || "unknown" },
    }));
    if (typeof validation.valid !== "boolean") throw new Error("validate_value returned no boolean validity.");

    const health = toolText(await rpc.call("tools/call", { name: "get_data_health", arguments: {} }));
    if (!Number.isInteger(health.totalSeries) || !health.freshness || !Array.isArray(health.history)) {
      throw new Error("get_data_health returned no catalogue summary/history.");
    }

    console.log(`MCP smoke ok: ${listed.tools.length} tools, sample series ${series}`);
  } finally {
    child.stdin.end();
    child.kill();
    await new Promise((resolveClose) => http.close(resolveClose));
  }
}

main().catch((error) => {
  console.error(`MCP smoke failed: ${error.message}`);
  process.exitCode = 1;
});
