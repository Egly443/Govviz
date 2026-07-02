import { useEffect, useState } from "react";
import { Footer } from "./Footer";
import { TopNav } from "./TopNav";

const BASE = import.meta.env.BASE_URL; // e.g. "/Govviz/"
const DATA = `${BASE}data`;
const REPO_DOCS_TREE = "https://github.com/Egly443/Govviz/tree/main/docs";
const REPO_DOCS_BLOB = "https://github.com/Egly443/Govviz/blob/main/docs";

type IndexEntry = { id: string; title: string; tags?: string[] };

/**
 * In-app front door for the AI-ready open-data product. The canonical artifact
 * is the published catalogue (`/data/catalog.json`) and the static portal
 * (`/data/`); this page renders the same series list from the machine index and
 * links every series to its record / CSV / CSVW — so a human browsing the app
 * reaches exactly what an agent resolves.
 */
export function DataPage() {
  const [entries, setEntries] = useState<IndexEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`${DATA}/series/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setEntries(j.series ?? []))
      .catch(() => setError(true));
  }, []);

  const filtered = entries?.filter((e) =>
    `${e.title} ${e.id} ${(e.tags ?? []).join(" ")}`
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6">
        <nav className="text-xs text-muted-foreground">
          <span className="text-foreground">Open data</span>
        </nav>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          AI-ready open data
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Govviz publishes every indicator as a{" "}
          <strong className="text-foreground">
            reference implementation of its own AI-ready series profile
          </strong>
          : resolve a stable id → tidy CSV, with unit, coverage, periodicity,
          revision status, provenance and a published{" "}
          <em>validation range</em> in-band — so an agent, or a fifteen-line
          script, can read it without scraping, tab-guessing, or silently
          picking the wrong measure. Govviz is a downstream compiler; every
          record names its primary producer.
        </p>

        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          {[
            ["Catalogue (DCAT)", `${DATA}/catalog.json`],
            ["Conformance report", `${DATA}/conformance-report.html`],
            ["OpenAPI", `${DATA}/openapi.json`],
            ["Series profile", `${DATA}/profile.json`],
            ["Health history", `${DATA}/health-history.json`],
            ["Suppression scheme", `${DATA}/suppression/v1.json`],
            ["Agent interface (MCP)", `${DATA}/mcp.json`],
            ["Full portal", `${DATA}/`],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground hover:text-foreground"
            >
              {label} ↗
            </a>
          ))}
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProofLink
            title="Build conformance"
            href={`${DATA}/conformance-report.html`}
            body="Generated pass/fail report for the published profile records, tidy CSV files, valid ranges and recommended governance warnings."
          />
          <ProofLink
            title="API contract"
            href={`${DATA}/openapi.json`}
            body="Static OpenAPI contract for catalogue, series metadata, CSV and CSVW endpoints."
          />
          <ProofLink
            title="Health history"
            href={`${DATA}/health-history.json`}
            body="Rolling build-time snapshots of observation coverage, valid-range coverage, freshness status, source hashes and per-series warnings."
          />
          <ProofLink
            title="Benchmark suite"
            href={`${REPO_DOCS_TREE}/benchmarks`}
            body="Task-based benchmark for comparing Govviz against other public-data implementations."
          />
          <ProofLink
            title="Source stewards"
            href={`${REPO_DOCS_BLOB}/source-stewards.json`}
            body="Producer contact and access-route mapping for common source families."
          />
          <ProofLink
            title="Feedback loop"
            href={`${REPO_DOCS_BLOB}/feedback-loop.md`}
            body="Structured route for wrong values, stale sources, bad units, geography errors and agent-consumption failures."
          />
          <ProofLink
            title="Producer guide"
            href={`${REPO_DOCS_BLOB}/producer-guide.md`}
            body="Minimum viable implementation guide for a producer making one statistical series AI-ready."
          />
        </section>

        <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-card p-4 text-[12px] leading-relaxed text-muted-foreground">
{`curl -s ${DATA}/series/defra-sewage-hours.json | jq '.title,.unit,.validRange'
curl -s ${DATA}/series/defra-sewage-hours/data.csv`}
        </pre>

        {error && (
          <p className="mt-8 rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
            The published dataset isn’t available in this build (it’s generated
            in CI). Browse it live at{" "}
            <a
              className="text-primary hover:underline"
              href="https://egly443.github.io/Govviz/data/"
            >
              egly443.github.io/Govviz/data
            </a>
            .
          </p>
        )}

        {entries && (
          <>
            <div className="mt-8 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {filtered?.length ?? 0} series
              </h2>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter series…"
                aria-label="Filter series"
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>
            <ul className="mt-3 divide-y divide-border/60 rounded-xl border border-border bg-card">
              {filtered?.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <span className="text-sm">
                    {e.title}{" "}
                    <code className="ml-1 rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {e.id}
                    </code>
                  </span>
                  <span className="flex gap-2 text-[12px]">
                    <a className="text-primary hover:underline" href={`${DATA}/series/${e.id}.json`} target="_blank" rel="noopener noreferrer">JSON</a>
                    <a className="text-primary hover:underline" href={`${DATA}/series/${e.id}/data.csv`} target="_blank" rel="noopener noreferrer">CSV</a>
                    <a className="text-primary hover:underline" href={`${DATA}/series/${e.id}/data.csv-metadata.json`} target="_blank" rel="noopener noreferrer">CSVW</a>
                    <a
                      className="text-primary hover:underline"
                      href={`https://github.com/Egly443/Govviz/issues/new?template=data-quality.yml&title=${encodeURIComponent(`[data-quality]: ${e.id}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Issue
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <Footer />
      </main>
    </div>
  );
}

function ProofLink({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-border bg-card p-4 text-sm transition-colors hover:border-primary/40"
    >
      <span className="font-medium text-foreground">{title}</span>
      <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">
        {body}
      </span>
    </a>
  );
}
