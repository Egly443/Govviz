// Post-build prerender for top-level SPA routes that must be readable without
// JavaScript. This uses the built Vite shell so browsers still hydrate the app,
// while direct fetches of /overview and /about return HTTP 200 with meaningful
// static content inside #root.

import { mkdir, readFile, writeFile } from "node:fs/promises";

const SITE = "https://egly443.github.io/Govviz";
const MODIFIED = new Date().toISOString().slice(0, 10);

const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

let shell;
try {
  shell = await readFile("dist/index.html", "utf8");
} catch {
  console.warn("prerender-static-routes: dist/index.html not found, skipping.");
  process.exit(0);
}

function replaceTag(html, re, replacement, label, route) {
  if (!re.test(html)) {
    console.warn(`prerender-static-routes: ${route}: no match for ${label}`);
    return html;
  }
  return html.replace(re, replacement);
}

function page({ route, title, description, canonical, jsonld, body }) {
  let html = shell;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = replaceTag(
    html,
    /<meta\s+name="description"[\s\S]*?>/,
    `<meta name="description" content="${esc(description)}" />`,
    "description",
    route,
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:title"[\s\S]*?>/,
    `<meta property="og:title" content="${esc(title)}" />`,
    "og:title",
    route,
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:description"[\s\S]*?>/,
    `<meta property="og:description" content="${esc(description)}" />`,
    "og:description",
    route,
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:url"[\s\S]*?>/,
    `<meta property="og:url" content="${canonical}" />`,
    "og:url",
    route,
  );
  html = replaceTag(
    html,
    /<link\s+rel="canonical"[\s\S]*?>/,
    `<link rel="canonical" href="${canonical}" />`,
    "canonical",
    route,
  );
  html = html
    .replace(
      "</head>",
      `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n</head>`,
    )
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return html;
}

const staticCss =
  "max-width:62rem;margin:0 auto;padding:2rem 1.25rem 4rem;font:16px/1.65 Inter,system-ui,sans-serif;color:#e7e9ee";
const muted = "color:#9aa3b2";
const link = "color:#8ab4ff";

const overviewDescription =
  "Whole-of-government view of long-run UK department performance indicators, with direct links to the AI-ready open-data catalogue and essay.";
const overviewJsonld = [
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Govviz whole-of-government performance overview",
    description: overviewDescription,
    url: `${SITE}/overview`,
    inLanguage: "en-GB",
    isAccessibleForFree: true,
    dateModified: MODIFIED,
    creator: { "@type": "Organization", name: "Govviz", url: SITE },
    spatialCoverage: { "@type": "Place", name: "United Kingdom" },
    distribution: [
      { "@type": "DataDownload", contentUrl: `${SITE}/data/catalog.json`, encodingFormat: "application/ld+json" },
      { "@type": "DataDownload", contentUrl: `${SITE}/data/series/index.json`, encodingFormat: "application/json" },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Whole of government",
    url: `${SITE}/overview`,
    isPartOf: { "@type": "WebSite", name: "Govviz", url: SITE },
  },
];
const overviewBody = `<main style="${staticCss}">
<nav style="font-size:.8rem;${muted}"><a href="${SITE}/" style="${link}">Govviz</a> / Whole of government</nav>
<h1 style="font-size:2rem;font-weight:650;margin:.5rem 0">Whole of government</h1>
<p style="${muted};max-width:46rem">Every tracked indicator at a glance. Govviz groups long-run UK government performance measures by department, scores them against published targets where available, and marks stale or uncertain evidence instead of hiding it.</p>
<section>
  <h2 style="font-size:1.15rem;margin:1.6rem 0 .4rem">Open evidence behind the dashboard</h2>
  <p style="${muted};max-width:46rem">The interactive treemap requires JavaScript, but the underlying evidence is static and machine-readable. Use the <a href="${SITE}/data/catalog.json" style="${link}">DCAT catalogue</a>, the <a href="${SITE}/data/series/index.json" style="${link}">series index</a>, the <a href="${SITE}/blog" style="${link}">agentic open data essay</a>, or the <a href="https://github.com/Egly443/Govviz" style="${link}">source repository</a>.</p>
  <ul>
    <li><a href="${SITE}/data/" style="${link}">Static data portal</a></li>
    <li><a href="${SITE}/data/catalog.json" style="${link}">/data/catalog.json</a></li>
    <li><a href="${SITE}/data/series/index.json" style="${link}">/data/series/index.json</a></li>
    <li><a href="${SITE}/data/mcp.json" style="${link}">/data/mcp.json</a></li>
  </ul>
</section>
<p style="font-size:.85rem;${muted}">Interactive charts, modals and drill-down routes hydrate from this same page shell when JavaScript is available.</p>
</main>`;

const aboutDescription =
  "How Govviz sources, validates and republishes UK government performance data as AI-ready open data.";
const aboutJsonld = [
  {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "How Govviz is built",
    name: "How Govviz is built",
    description: aboutDescription,
    url: `${SITE}/about`,
    inLanguage: "en-GB",
    dateModified: MODIFIED,
    author: { "@type": "Organization", name: "Govviz", url: SITE },
    about: ["AI-ready data", "Open data", "UK government statistics", "CSVW", "Model Context Protocol"].map((name) => ({
      "@type": "Thing",
      name,
    })),
  },
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Govviz AI-ready open data",
    description: "Stable JSON records, tidy CSV, CSVW metadata, DCAT catalogue and MCP descriptor for Govviz performance indicators.",
    url: `${SITE}/data/`,
    distribution: [
      { "@type": "DataDownload", contentUrl: `${SITE}/data/catalog.json`, encodingFormat: "application/ld+json" },
      { "@type": "DataDownload", contentUrl: `${SITE}/data/series/index.json`, encodingFormat: "application/json" },
      { "@type": "DataDownload", contentUrl: `${SITE}/data/profile.json`, encodingFormat: "application/json" },
      { "@type": "DataDownload", contentUrl: `${SITE}/data/mcp.json`, encodingFormat: "application/json" },
    ],
  },
];
const aboutBody = `<main style="${staticCss}">
<nav style="font-size:.8rem;${muted}"><a href="${SITE}/" style="${link}">Govviz</a> / About</nav>
<h1 style="font-size:2rem;font-weight:650;margin:.5rem 0">How Govviz is built</h1>
<p style="${muted};max-width:46rem">Govviz is a static dashboard of long-run UK government performance indicators. Its production build is designed around real official data, visible provenance, guard-range validation and explicit freshness limits.</p>
<section>
  <h2 style="font-size:1.15rem;margin:1.6rem 0 .4rem">Methodology in brief</h2>
  <ul>
    <li>Every charted series is fetched from a public source such as ONS, NHS England, gov.uk, DfE or the World Bank.</li>
    <li>Each series records provenance, coverage, measurement basis, caveats and the source file used by the build.</li>
    <li>Guard ranges reject wrong-but-plausible values before they can ship.</li>
    <li>Stale or missing evidence is labelled instead of replaced with invented data.</li>
  </ul>
</section>
<section>
  <h2 style="font-size:1.15rem;margin:1.6rem 0 .4rem">AI-ready publication</h2>
  <p style="${muted};max-width:46rem">Govviz republishes each indicator as a stable JSON record pointing at tidy long-format CSV, CSVW schema metadata, a DCAT catalogue and an open MCP descriptor.</p>
  <ul>
    <li><a href="${SITE}/data/" style="${link}">Human data portal</a></li>
    <li><a href="${SITE}/data/catalog.json" style="${link}">JSON-LD/DCAT catalogue</a></li>
    <li><a href="${SITE}/data/series/waiting-list.json" style="${link}">Example series JSON</a></li>
    <li><a href="${SITE}/data/series/waiting-list/data.csv" style="${link}">Example tidy CSV</a></li>
    <li><a href="${SITE}/data/series/waiting-list/data.csv-metadata.json" style="${link}">Example CSVW metadata</a></li>
    <li><a href="${SITE}/data/profile.json" style="${link}">AI-ready series profile</a></li>
    <li><a href="${SITE}/data/mcp.json" style="${link}">MCP descriptor</a></li>
    <li><a href="https://github.com/Egly443/Govviz/blob/main/docs/conformance/test-cases.json" style="${link}">Conformance test cases</a></li>
  </ul>
</section>
<p style="font-size:.85rem;${muted}">This static page hydrates into the full React route for browsers with JavaScript enabled.</p>
</main>`;

const pages = [
  {
    dir: "dist/overview",
    html: page({
      route: "overview",
      title: "Whole of government - Govviz",
      description: overviewDescription,
      canonical: `${SITE}/overview`,
      jsonld: overviewJsonld,
      body: overviewBody,
    }),
  },
  {
    dir: "dist/about",
    html: page({
      route: "about",
      title: "How Govviz is built - Govviz",
      description: aboutDescription,
      canonical: `${SITE}/about`,
      jsonld: aboutJsonld,
      body: aboutBody,
    }),
  },
];

for (const p of pages) {
  await mkdir(p.dir, { recursive: true });
  await writeFile(`${p.dir}/index.html`, p.html, "utf8");
}

console.log("prerendered dist/overview/index.html and dist/about/index.html");
