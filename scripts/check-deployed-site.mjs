// Verify the public GitHub Pages deployment serves the key app, essay, data
// portal and machine-readable open-data URLs with useful content. Intended for
// a short post-deploy retry loop, but also runnable locally:
//   node scripts/check-deployed-site.mjs --base=https://egly443.github.io/Govviz

const DEFAULT_BASE = "https://egly443.github.io/Govviz";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [k, ...rest] = arg.slice(2).split("=");
      return [k, rest.length ? rest.join("=") : "true"];
    }),
);

const base = String(args.get("base") || process.env.DEPLOYED_SITE_URL || DEFAULT_BASE).replace(/\/+$/, "");
const retries = Number(args.get("retries") || process.env.DEPLOY_CHECK_RETRIES || 1);
const delayMs = Number(args.get("delay-ms") || process.env.DEPLOY_CHECK_DELAY_MS || 5000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function urlFor(path) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function hasAllowedType(actual, allowed) {
  const lower = (actual || "").toLowerCase();
  return allowed.some((type) => lower.includes(type));
}

async function get(path) {
  const res = await fetch(urlFor(path), {
    headers: {
      "user-agent": "govviz-deploy-check/1.0",
      accept: "*/*",
    },
  });
  const text = await res.text();
  return { path, url: urlFor(path), status: res.status, type: res.headers.get("content-type") || "", text };
}

async function checkEndpoint(check) {
  const result = await get(check.path);
  const errors = [];
  if (result.status !== (check.status || 200)) {
    errors.push(`expected HTTP ${check.status || 200}, got ${result.status}`);
  }
  if (check.type && !hasAllowedType(result.type, check.type)) {
    errors.push(`expected content-type including ${check.type.join(" or ")}, got ${result.type || "(none)"}`);
  }
  if (check.includes && !result.text.includes(check.includes)) {
    errors.push(`missing key string ${JSON.stringify(check.includes)}`);
  }
  if (check.excludes && result.text.includes(check.excludes)) {
    errors.push(`unexpected string ${JSON.stringify(check.excludes)}`);
  }
  if (check.json) {
    try {
      check.json(JSON.parse(result.text));
    } catch (err) {
      errors.push(`JSON assertion failed: ${err.message}`);
    }
  }
  if (errors.length) {
    throw new Error(`${check.path}: ${errors.join("; ")}`);
  }
  console.log(`ok ${check.path} ${result.status} ${result.type}`);
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runOnce() {
  const checks = [
    { path: "/", type: ["text/html"], includes: "Govviz" },
    { path: "/overview", type: ["text/html"], includes: "Whole of government" },
    { path: "/about", type: ["text/html"], includes: "How Govviz is built" },
    { path: "/blog", type: ["text/html"], includes: "Agentic Open Data" },
    { path: "/blog.md", type: ["text/markdown", "text/plain", "application/octet-stream"], includes: "Agentic Open Data" },
    {
      path: "/data/",
      type: ["text/html"],
      includes: "AI-ready open data",
      excludes: '<div id="root"></div>',
    },
    {
      path: "/data/catalog.json",
      type: ["application/json", "application/ld+json", "text/plain"],
      includes: "dcat:Catalog",
      json: (data) => assert(Array.isArray(data["dcat:dataset"]) && data["dcat:dataset"].length > 0, "catalog has no datasets"),
    },
    {
      path: "/data/series/index.json",
      type: ["application/json", "text/plain"],
      includes: '"series"',
      json: (data) => assert(Array.isArray(data.series) && data.series.length > 0, "series index is empty"),
    },
    {
      path: "/data/mcp.json",
      type: ["application/json", "text/plain"],
      includes: "list_series",
      json: (data) => assert(Array.isArray(data.tools) && data.tools.some((tool) => tool.name === "list_series"), "MCP tool list missing list_series"),
    },
  ];

  for (const check of checks) await checkEndpoint(check);

  const index = await get("/data/series/index.json");
  const series = JSON.parse(index.text).series?.find((item) => item?.id && item?.latest);
  assert(series, "could not choose a series from /data/series/index.json");
  const seriesBase = `/data/series/${series.id}`;

  await checkEndpoint({
    path: `${seriesBase}.json`,
    type: ["application/json", "text/plain"],
    includes: series.id,
    json: (data) => {
      assert(data.id && data.latest && data.csvw, "series record missing id/latest/csvw");
      assert(Array.isArray(data.distribution) && data.distribution.length >= 3, "series distribution is incomplete");
    },
  });
  await checkEndpoint({
    path: `${seriesBase}/data.csv`,
    type: ["text/csv", "text/plain", "application/octet-stream"],
    includes: "period,value",
  });
  await checkEndpoint({
    path: `${seriesBase}/data.csv-metadata.json`,
    type: ["application/json", "text/plain"],
    includes: "tableSchema",
    json: (data) => assert(data.tableSchema?.columns?.length > 0, "CSVW metadata missing columns"),
  });
}

let lastError;
for (let attempt = 1; attempt <= retries; attempt++) {
  try {
    if (attempt > 1) console.log(`retry ${attempt}/${retries}`);
    await runOnce();
    console.log(`deployed site checks passed for ${base}`);
    process.exit(0);
  } catch (err) {
    lastError = err;
    console.error(`attempt ${attempt}/${retries} failed: ${err.message}`);
    if (attempt < retries) await sleep(delayMs);
  }
}

console.error(`deployed site checks failed for ${base}: ${lastError?.message || "unknown error"}`);
process.exit(1);
