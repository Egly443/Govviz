import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Footer } from "./Footer";
import { TopNav } from "./TopNav";
import { DepartmentTabs } from "./DepartmentTabs";
import { GovTreemap } from "./GovTreemap";
import { Modal } from "./Modal";
import { TrendPanel } from "./TrendPanel";
import { ragColor, type IndicatorCell } from "./overview";

export function OverviewPage() {
  const [selected, setSelected] = useState<IndicatorCell | null>(null);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
        }}
      />

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <DepartmentTabs active="overview" />

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <nav className="text-xs text-muted-foreground">
              <span className="text-foreground">Whole of government</span>
            </nav>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Whole of government
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Every tracked indicator at a glance. Block size is proportional to
              departmental spending; colour shows the latest value within each
              indicator&rsquo;s own historical range. Click any tile to open its
              full chart.
            </p>
          </div>
          <Legend />
        </div>

        <section className="mt-8 rounded-xl border border-border bg-card/40 p-2 sm:p-3">
          <GovTreemap onSelect={setSelected} />
        </section>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Tile colour scores each indicator against its published target where
          one exists (green = at or beyond the standard), otherwise its own
          historical range; always oriented so green is good. A dot marks
          indicators with an official target. Tile size is approximate
          departmental Total Managed Expenditure (HMT, 2025&ndash;26).
        </p>

        <Footer />
      </main>

      {selected && (
        <Modal onClose={() => setSelected(null)}>
          <div className="mb-2 flex items-center gap-1.5 pr-8 text-xs text-muted-foreground">
            <Link
              to="/$dept"
              params={{ dept: selected.dept.code }}
              className="hover:text-foreground"
            >
              {selected.dept.name}
            </Link>
            <span className="opacity-50">/</span>
            <span className="text-foreground">{selected.series.title}</span>
          </div>
          <TrendPanel series={selected.series} height={340} />
        </Modal>
      )}
    </div>
  );
}

function Legend() {
  const swatches: [number, string][] = [
    [0.05, "Poor"],
    [0.5, "Mixed"],
    [0.95, "Good"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      {swatches.map(([score, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: ragColor(score) }}
          />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5" title="Scored against the series' own history, not a published target">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ background: ragColor(0.5, false) }}
        />
        No external benchmark
      </span>
    </div>
  );
}
