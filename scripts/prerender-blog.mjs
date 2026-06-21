// Post-build prerender: turn the essay Markdown into a static, no-JavaScript
// page so the canonical URL is machine-readable. The /blog SPA route is fine
// for humans clicking around in-app, but a direct fetch of the deep link (an
// agent, a scraper, a curl) must return the actual content — practising what
// the essay preaches. This also publishes the raw Markdown as the canonical
// machine artifact.
//
// Writes:
//   dist/blog/index.html  → served for GET /Govviz/blog/ (full content, no JS)
//   dist/blog.md          → raw Markdown at /Govviz/blog.md (machine-readable)

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { marked } from "marked";

const SRC = "docs/blog-open-data-for-ai.md";
const SITE = "https://egly443.github.io/Govviz";
const CANONICAL = `${SITE}/blog`;

marked.setOptions({ gfm: true, breaks: false });

const md = await readFile(SRC, "utf8");
const body = marked.parse(md);

// Title + description from the Markdown (first H1, first italic intro line).
const title =
  (md.match(/^#\s+(.+)$/m)?.[1] ?? "Agentic Open Data").replace(/\s+/g, " ").trim();
const descRaw =
  md.match(/^\*(.+?)\*\s*$/m)?.[1] ??
  "Making UK public statistics readable by the machines acting for citizens.";
const description = descRaw.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const css = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0d12;color:#e7e9ee;font:16px/1.7 Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:2.5rem 1.25rem 5rem}
.bar{display:flex;gap:1rem;align-items:center;font-size:.8rem;color:#9aa3b2;margin-bottom:2rem}
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
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${CANONICAL}">
<link rel="alternate" type="text/markdown" href="${SITE}/blog.md" title="Machine-readable Markdown">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${CANONICAL}">
<meta name="twitter:card" content="summary">
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <nav class="bar">
    <a href="${SITE}/">&larr; Govviz dashboard</a>
    <a href="${SITE}/blog.md">Machine-readable Markdown</a>
    <a href="https://github.com/egly443/govviz/blob/main/docs/blog-open-data-for-ai.md">Source on GitHub</a>
  </nav>
  <p class="note">This is the static, no-JavaScript version of the essay &mdash;
  directly readable by people and by agents. The interactive in-app version is at
  <a href="${SITE}/">the dashboard</a>; the canonical machine artifact is
  <a href="${SITE}/blog.md">blog.md</a>.</p>
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
console.log("prerendered dist/blog/index.html and dist/blog.md");
