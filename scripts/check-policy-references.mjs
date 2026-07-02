#!/usr/bin/env node
const REFERENCES = [
  {
    name: "National Data Library progress update",
    url: "https://www.gov.uk/government/publications/national-data-library-progress-update-january-2026",
  },
  {
    name: "AI-ready data guidance",
    url: "https://www.gov.uk/government/publications/making-government-datasets-ready-for-ai",
  },
  {
    name: "ODI NDL-lite",
    url: "https://theodi.org/insights/reports/prototyping-an-ai-ready-national-data-library/",
  },
  {
    name: "ODI enterprise data framework",
    url: "https://theodi.hacdn.io/media/documents/A_framework_for_AI-ready_enterprise_data.pdf",
  },
  {
    name: "Data Ethics Framework",
    url: "https://www.gov.uk/government/publications/data-ethics-framework",
  },
  {
    name: "Algorithmic Transparency Recording Standard hub",
    url: "https://www.gov.uk/government/collections/algorithmic-transparency-recording-standard-hub",
  },
];

async function check(ref) {
  const started = Date.now();
  let response = await fetch(ref.url, {
    method: "HEAD",
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "govviz-policy-watch/0.1" },
  });
  if (response.status === 405 || response.status === 403) {
    response = await fetch(ref.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "govviz-policy-watch/0.1", range: "bytes=0-2047" },
    });
  }
  return {
    name: ref.name,
    url: ref.url,
    finalUrl: response.url,
    ok: response.ok,
    status: response.status,
    lastModified: response.headers.get("last-modified"),
    etag: response.headers.get("etag"),
    contentType: response.headers.get("content-type"),
    elapsedMs: Date.now() - started,
  };
}

const strict = process.argv.includes("--strict");
const results = [];
for (const ref of REFERENCES) {
  try {
    results.push(await check(ref));
  } catch (error) {
    results.push({ name: ref.name, url: ref.url, ok: false, error: error.message });
  }
}

for (const result of results) {
  const state = result.ok ? "ok" : "check";
  const meta = [
    result.status ? `status=${result.status}` : null,
    result.lastModified ? `last-modified=${result.lastModified}` : null,
    result.etag ? `etag=${result.etag}` : null,
    result.error ? `error=${result.error}` : null,
  ].filter(Boolean).join(" ");
  console.log(`${state.padEnd(5)} ${result.name}: ${result.url}${meta ? ` (${meta})` : ""}`);
}

if (strict && results.some((result) => !result.ok)) process.exitCode = 1;
