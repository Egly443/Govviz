// Post-build SEO prerender for the 17 department routes.
//
// The SPA serves only a JS shell to a non-browser client, and GitHub Pages
// deep-links fall back to 404.html — so a direct fetch of /Govviz/dhsc (a
// crawler, an AI search bot, a no-JS reader) sees no department content. This
// derives a static page per department FROM the built dist/index.html, so the
// same hashed bundle still hydrates the full interactive app for humans, while
// machines get:
//   dist/<code>/index.html  → unique <title>/description/canonical/OG,
//                             schema.org Dataset + BreadcrumbList JSON-LD, and
//                             real static content (heading, blurb, indicator
//                             list with source links) inside #root.
//
// Department metadata is read from the real registry (src/components/
// departments.ts) via an esbuild bundle, so there is no second source of truth
// to drift. Run AFTER `vite build` (needs dist/index.html).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const SITE = "https://egly443.github.io/Govviz";
const MODIFIED = new Date().toISOString().slice(0, 10);

const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// --- Load the real department registry (single source of truth) -------------
let departments, SPEND_BASIS;
try {
  const out = await build({
    entryPoints: ["src/components/departments.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const tmp = join(tmpdir(), `govviz-departments-${process.pid}.mjs`);
  await writeFile(tmp, out.outputFiles[0].text, "utf8");
  const mod = await import(pathToFileURL(tmp).href);
  departments = mod.departments;
  SPEND_BASIS = mod.SPEND_BASIS;
} catch (err) {
  console.warn("prerender-departments: could not load registry, skipping:", err.message);
  process.exit(0);
}

let shell;
try {
  shell = await readFile("dist/index.html", "utf8");
} catch {
  console.warn("prerender-departments: dist/index.html not found, skipping.");
  process.exit(0);
}

function seriesOf(d) {
  const seen = new Set();
  return [d.hero, ...d.core, ...(d.supporting ?? [])].filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function pageFor(d) {
  const url = `${SITE}/${d.code}`;
  const heading = d.pageTitle ?? `Department for ${d.fullName}`;
  const title = `${heading} — Govviz`;
  const description = d.blurb.replace(/\s+/g, " ").trim().slice(0, 300);
  const series = seriesOf(d);

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${d.fullName} — UK government performance indicators`,
      description,
      url,
      inLanguage: "en-GB",
      isAccessibleForFree: true,
      dateModified: MODIFIED,
      keywords: [d.fullName, "UK government performance", ...d.themes].join(", "),
      creator: { "@type": "Organization", name: "Govviz", url: SITE },
      spatialCoverage: { "@type": "Place", name: "United Kingdom" },
      variableMeasured: series.map((s) => ({
        "@type": "PropertyValue",
        name: s.title,
        ...(s.subtitle ? { description: s.subtitle } : {}),
        ...(s.source ? { measurementTechnique: s.source } : {}),
        ...(s.sourceUrl ? { url: s.sourceUrl } : {}),
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Govviz", item: SITE },
        { "@type": "ListItem", position: 2, name: "Overview", item: `${SITE}/overview` },
        { "@type": "ListItem", position: 3, name: d.fullName, item: url },
      ],
    },
  ];

  // Static content for no-JS clients; the SPA wipes #root and renders the real
  // app on mount, so humans never see this.
  const staticBody = `<main style="max-width:60rem;margin:0 auto;padding:2rem 1.25rem;font:16px/1.6 Inter,system-ui,sans-serif">
<nav style="font-size:.8rem;color:#9aa3b2"><a href="${SITE}/overview" style="color:#9aa3b2">Govviz</a> / ${esc(d.fullName)}</nav>
<h1 style="font-size:1.9rem;font-weight:600;margin:.5rem 0">${esc(heading)}</h1>
<p style="color:#9aa3b2">${esc(d.blurb)}</p>
<p style="color:#9aa3b2;font-size:.85rem">Approximate ${esc(SPEND_BASIS?.measure ?? "Total Managed Expenditure")}: £${d.spendBn}bn (${esc(SPEND_BASIS?.source ?? "HM Treasury")}, ${esc(SPEND_BASIS?.asOf ?? "")}).</p>
<h2 style="font-size:1.1rem;font-weight:600;margin:1.5rem 0 .5rem">Tracked indicators</h2>
<ul>
${series
  .map(
    (s) =>
      `<li><a href="${esc(s.sourceUrl)}" rel="nofollow">${esc(s.title)}</a>${
        s.subtitle ? ` — ${esc(s.subtitle)}` : ""
      }${s.source ? ` <em style="color:#9aa3b2">(${esc(s.source)})</em>` : ""}</li>`,
  )
  .join("\n")}
</ul>
<p style="font-size:.85rem;color:#9aa3b2">Interactive charts require JavaScript. <a href="${url}" style="color:#8ab4ff">Open the live dashboard</a>.</p>
</main>`;

  // Vite may emit some meta tags multi-line, so match whitespace-tolerantly
  // across newlines (stop at the tag's own closing `>`).
  const replaceTag = (s, re, repl, label) => {
    if (!re.test(s)) {
      console.warn(`prerender-departments: ${d.code}: no match for ${label}`);
      return s;
    }
    return s.replace(re, repl);
  };

  let html = shell;
  // Swap the per-page <head> metadata.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = replaceTag(
    html,
    /<meta\s+name="description"[\s\S]*?>/,
    `<meta name="description" content="${esc(description)}" />`,
    "description",
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:title"[\s\S]*?>/,
    `<meta property="og:title" content="${esc(title)}" />`,
    "og:title",
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:description"[\s\S]*?>/,
    `<meta property="og:description" content="${esc(description)}" />`,
    "og:description",
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:url"[\s\S]*?>/,
    `<meta property="og:url" content="${url}" />`,
    "og:url",
  );
  html = replaceTag(
    html,
    /<link\s+rel="canonical"[\s\S]*?>/,
    `<link rel="canonical" href="${url}" />`,
    "canonical",
  );
  html = html
    .replace(
      "</head>",
      `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n</head>`,
    )
    .replace('<div id="root"></div>', `<div id="root">${staticBody}</div>`);

  return html;
}

let n = 0;
for (const d of departments) {
  const html = pageFor(d);
  await mkdir(`dist/${d.code}`, { recursive: true });
  await writeFile(`dist/${d.code}/index.html`, html, "utf8");
  n++;
}

console.log(`prerendered ${n} department pages (dist/<code>/index.html, +Dataset/Breadcrumb JSON-LD)`);
