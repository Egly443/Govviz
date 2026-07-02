import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Grid2X2, Radar } from "lucide-react";
import { Footer } from "./Footer";
import { TopNav } from "./TopNav";
import { DepartmentTabs } from "./DepartmentTabs";
import { GovTreemap } from "./GovTreemap";
import { GovSpatialCommand } from "./GovAltVisualizations";
import { Modal } from "./Modal";
import { TrendPanel } from "./TrendPanel";
import { DataHealthStrip } from "./DataHealthStrip";
import { ragColor, ragUncertainColor, type IndicatorCell } from "./overview";
import { SPEND_BASIS } from "./departments";

type OverviewViz = "treemap" | "spatial";

const VIEWS: {
  id: OverviewViz;
  label: string;
  description: string;
  icon: typeof Grid2X2;
}[] = [
  {
    id: "treemap",
    label: "Treemap",
    icon: Grid2X2,
    description:
      "Budget-weighted departmental blocks; colour shows performance against target, and glyphs show recent trend.",
  },
  {
    id: "spatial",
    label: "Spatial",
    icon: Radar,
    description:
      "A projected command surface for rapidly moving between departments and opening lead charts.",
  },
];

export function OverviewPage() {
  const [selected, setSelected] = useState<IndicatorCell | null>(null);
  const [viz, setViz] = useState<OverviewViz>("treemap");
  const activeView = VIEWS.find((view) => view.id === viz) ?? VIEWS[0];

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
              Every tracked indicator at a glance. Keep the original budget
              treemap or switch into a projected command surface for moving
              quickly between departments and charts.
            </p>
          </div>
          <Legend />
        </div>

        <DataHealthStrip />

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{activeView.label}</h2>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              {activeView.description}
            </p>
          </div>
          <div
            className="flex flex-wrap gap-1 rounded-lg border border-border bg-card/55 p-1"
            aria-label="Choose overview visualisation"
          >
            {VIEWS.map((view) => {
              const Icon = view.icon;
              const active = view.id === viz;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setViz(view.id)}
                  title={view.description}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                  }`}
                  aria-pressed={active}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {view.label}
                </button>
              );
            })}
          </div>
        </div>

        <section className="mt-8 rounded-xl border border-border bg-card/40 p-2 sm:p-3">
          {viz === "treemap" && <GovTreemap onSelect={setSelected} />}
          {viz === "spatial" && <GovSpatialCommand onSelect={setSelected} />}
        </section>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Tile colour scores each indicator against its published target where
          one exists (green = at or beyond the standard), otherwise its own
          historical range; always oriented so green is good. A trend glyph
          (&#9650;/&#9660; rising/falling, &#9652;/&#9662; slight) tracks the
          recent direction of the value; &ldquo;&asymp;&rdquo; marks an indicator
          whose latest value is within the margin of error of its target; an
          accent ring marks each department&rsquo;s lead indicator. Every
          indicator in a department gets an equal-size tile, so a block&rsquo;s
          area &mdash; not the individual tiles &mdash; reflects approximate
          departmental {SPEND_BASIS.measure} (
          <a
            href={SPEND_BASIS.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            title={SPEND_BASIS.note}
          >
            {SPEND_BASIS.source}, {SPEND_BASIS.asOf}
          </a>
          ) — a static editorial estimate, not a fetched series.
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
      <span
        className="flex items-center gap-1.5"
        title="Latest value is within the published margin of error of the target — pass/fail can't be claimed"
      >
        <span
          className="grid h-2.5 w-2.5 place-items-center rounded-sm text-[8px] font-bold text-black/80"
          style={{ background: ragUncertainColor() }}
        >
          ≈
        </span>
        Within margin of target
      </span>
      <span className="flex items-center gap-1.5" title="Recent direction of the value (oriented to track the chart line)">
        <span className="tabular-nums text-foreground/80">▲▼</span>
        Trend
      </span>
    </div>
  );
}
