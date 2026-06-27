// Post-build prerender + discoverability for the essay.
//
// The /blog SPA route returns only a JS shell to a non-browser client, so a
// direct fetch (an agent, a scraper, an AI search crawler) gets no content.
// This makes the canonical URL machine-readable AND maximises the chance that
// LLMs / AI search engines find, parse and cite it:
//   dist/blog/index.html  → static, no-JS page with the full essay + JSON-LD
//   dist/blog.md          → raw Markdown (the canonical machine artifact)
//   dist/sitemap.xml      → sitemap for crawlers
//   dist/llms.txt         → llms.txt convention (points LLMs at the Markdown)

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { marked } from "marked";

const SRC = "docs/blog-open-data-for-ai.md";
const SITE = "https://egly443.github.io/Govviz";
const CANONICAL = `${SITE}/blog`;
const PUBLISHED = "2026-06-21";
const MODIFIED = new Date().toISOString().slice(0, 10);
const KEYWORDS =
  "agentic open data, AI-ready data, machine-readable government data, open data, " +
  "UK government statistics, LLM, AI agents, FAIR data, CSVW, SDMX, DCAT, MCP, " +
  "Model Context Protocol, National Data Library, ODI, GDS, DSIT, open government data, " +
  "statistical disclosure control, conformance suite, generative engine optimization";

marked.setOptions({ gfm: true, breaks: false });

const md = await readFile(SRC, "utf8");
const body = marked.parse(md);

const title =
  (md.match(/^#\s+(.+)$/m)?.[1] ?? "Agentic Open Data").replace(/\s+/g, " ").trim();
const descRaw =
  md.match(/^\*(.+?)\*\s*$/m)?.[1] ??
  "Making UK public statistics readable by the machines acting for citizens.";
const description = descRaw.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Pull the FAQ Q&A pairs so they can become FAQPage structured data (which AI
// search engines and Google use to match and cite direct answers).
function extractFaq(src) {
  const after = src.split(/\n## Frequently asked questions\s*\n/)[1];
  if (!after) return [];
  const block = after.split(/\n## /)[0];
  return block
    .split(/\n### /)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf("\n");
      const q = chunk.slice(0, nl).trim();
      const a = chunk.slice(nl).replace(/\n---[\s\S]*$/, "").replace(/\s+/g, " ").trim();
      return { q, a };
    })
    .filter((x) => x.q && x.a);
}
const faq = extractFaq(md);

const jsonld = [
  {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    name: title,
    description,
    inLanguage: "en-GB",
    datePublished: PUBLISHED,
    dateModified: MODIFIED,
    keywords: KEYWORDS,
    url: CANONICAL,
    mainEntityOfPage: CANONICAL,
    author: { "@type": "Person", name: "VbirdAI", url: "https://github.com/Egly443" },
    publisher: { "@type": "Organization", name: "Govviz", url: SITE },
    about: [
      "Open data",
      "Artificial intelligence",
      "Government data",
      "Machine-readable data",
      "FAIR data principles",
      "Large language models",
    ].map((name) => ({ "@type": "Thing", name })),
  },
  ...(faq.length
    ? [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
      ]
    : []),
];

const css = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0d12;color:#e7e9ee;font:16px/1.7 Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:2.5rem 1.25rem 5rem}
.bar{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;font-size:.8rem;color:#9aa3b2;margin-bottom:1.5rem}
.bar a{color:#9aa3b2;text-decoration:none}.bar a:hover{color:#e7e9ee}
.note{margin:0 0 2rem;padding:.7rem 1rem;border:1px solid #232838;background:#11141c;border-radius:.6rem;font-size:.85rem;color:#9aa3b2}
.note a{color:#8ab4ff}
article h1{font-size:1.95rem;font-weight:600;letter-spacing:-.02em;line-height:1.2;margin:0 0 .6rem}
article h2{font-size:1.35rem;font-weight:600;margin:2.2rem 0 .75rem;padding-top:1.4rem;border-top:1px solid #232838}
article h3{font-size:1.1rem;font-weight:600;margin:1.6rem 0 .5rem}
article p{margin:.85rem 0}
article a{color:#8ab4ff;text-underline-offset:2px}
article ul,article ol{margin:.85rem 0;padding-left:1.4rem}article li{margin:.3rem 0}
article blockquote{margin:1.1rem 0;padding:.6rem 1rem;border-left:3px solid #8ab4ff;background:#11141c;border-radius:0 .4rem .4rem 0;color:#9aa3b2}
article hr{border:0;border-top:1px solid #232838;margin:2rem 0}
article code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;background:#11141c;border:1px solid #232838;border-radius:.3rem;padding:.05rem .35rem}
article pre{margin:1.1rem 0;padding:.9rem 1rem;overflow-x:auto;background:#11141c;border:1px solid #232838;border-radius:.6rem;font-size:.82rem;line-height:1.5}
article pre code{background:none;border:0;padding:0}
article table{width:100%;margin:1.2rem 0;border-collapse:collapse;font-size:.875rem;display:block;overflow-x:auto}
article th,article td{border:1px solid #232838;padding:.45rem .65rem;text-align:left;vertical-align:top}
article th{background:#11141c;font-weight:600}
article strong{color:#e7e9ee;font-weight:600}article em{color:#9aa3b2}
`.trim();

const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="${esc(KEYWORDS)}">
<meta name="author" content="VbirdAI">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${CANONICAL}">
<link rel="alternate" type="text/markdown" href="${SITE}/blog.md" title="Machine-readable Markdown">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Govviz">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${CANONICAL}">
<meta property="article:published_time" content="${PUBLISHED}">
<meta property="article:modified_time" content="${MODIFIED}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <nav class="bar">
    <a href="${SITE}/">&larr; Govviz dashboard</a>
    <a href="${SITE}/blog.md">Machine-readable Markdown</a>
    <a href="https://github.com/Egly443/Govviz/blob/main/docs/blog-open-data-for-ai.md">Source on GitHub</a>
  </nav>
  <p class="note">Static, no-JavaScript version of the essay &mdash; directly
  readable by people and by AI agents. Canonical machine artifact:
  <a href="${SITE}/blog.md">blog.md</a>. Published ${PUBLISHED}, updated ${MODIFIED}.</p>
  <article>
${body}
  </article>
</div>
</body>
</html>
`;

await mkdir("dist/blog", { recursive: true });
await writeFile("dist/blog/index.html", html, "utf8");
await copyFile(SRC, "dist/blog.md");

// Sitemap for crawlers (project-site subpath; reference it via Search Console).
const urls = [
  { loc: `${SITE}/`, pri: "0.9" },
  { loc: `${SITE}/overview`, pri: "0.8" },
  { loc: `${SITE}/blog`, pri: "1.0" },
  { loc: `${SITE}/blog.md`, pri: "0.7" },
  // Department route slugs — must match `code` in src/components/departments.ts
  // (note: Treasury's slug is "treasury", not "hmt").
  ...[
    "dhsc", "dfe", "home-office", "moj", "mod", "dwp", "dft", "treasury",
    "mhclg", "defra", "desnz", "dsit", "dbt", "dcms", "fcdo", "cabinet-office",
  ].map((c) => ({ loc: `${SITE}/${c}`, pri: "0.6" })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${MODIFIED}</lastmod><priority>${u.pri}</priority></url>`,
  )
  .join("\n")}
</urlset>
`;
await writeFile("dist/sitemap.xml", sitemap, "utf8");

// llms.txt — emerging convention pointing LLMs at the clean Markdown content.
const llmstxt = `# Govviz — UK government performance data, made AI-readable

> Govviz presents long-run UK government performance indicators with real,
> officially-sourced data, and sets out how to make public statistics readable
> by the AI agents increasingly acting on citizens' behalf.

## Essay (full text, Markdown)
- [Agentic Open Data](${SITE}/blog.md): why AI agents can't reliably read UK government open data today, and a costed, standards-based plan (stable IDs, tidy data / CSVW / SDMX, in-band semantics, open access, MCP) to fix it.

## Specifications
- [AI-ready series profile](https://github.com/Egly443/Govviz/blob/main/docs/conformance/ai-ready-series-profile.md): a thin, normative profile for publishing one statistical series so an agent can consume it.
- [Conformance suite](https://github.com/Egly443/Govviz/blob/main/docs/conformance/test-cases.json): an adversarial AI-readiness test set built from the hardest real UK datasets.

## Dashboard
- [Whole-of-government overview](${SITE}/overview): real, sourced UK department performance indicators.
`;
await writeFile("dist/llms.txt", llmstxt, "utf8");

console.log(
  `prerendered dist/blog/index.html (+JSON-LD, ${faq.length} FAQ), dist/blog.md, dist/sitemap.xml, dist/llms.txt`,
);
