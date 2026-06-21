import { Footer } from "./Footer";
import { TopNav } from "./TopNav";
import { TrendPanel } from "./TrendPanel";
import { TurnoverBreakdown } from "./TurnoverBreakdown";
import { DepartmentTabs } from "./DepartmentTabs";
import { realAsOf } from "./data";
import { departmentIndicators, ragColor } from "./overview";
import type { Department } from "./departments";

interface Props {
  department: Department;
}

export function DepartmentPage({ department: dept }: Props) {
  // Most recent CI fetch date across this department's series, if any are live.
  const fetchDates = [dept.hero, ...dept.core, ...(dept.supporting ?? [])]
    .map((s) => realAsOf(s.id))
    .filter((d): d is string => !!d)
    .sort();
  const fetchedAt = fetchDates[fetchDates.length - 1];

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
        <DepartmentTabs active={dept.code} />

        {/* Header */}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <nav className="text-xs text-muted-foreground">
              <span>Departments</span>
              <span className="mx-1.5 opacity-50">/</span>
              <span className="text-foreground">{dept.fullName}</span>
            </nav>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {dept.pageTitle ?? `Department for ${dept.fullName}`}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{dept.blurb}</p>
          </div>
          {fetchedAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Live data fetched {fetchedAt}
            </div>
          )}
        </div>

        {/* Hero trend */}
        <section className="mt-8">
          <TrendPanel series={dept.hero} height={400} hero />
        </section>

        {/* Core competence metrics */}
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Core competence measures
            </h2>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Standards · bottlenecks · value for money
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {dept.core.map((s) => (
              <TrendPanel key={s.id} series={s} />
            ))}
          </div>
        </section>

        {/* Supporting context (DHSC only for now) */}
        {dept.supporting && dept.supporting.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Supporting context
              </h2>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                Outcomes · workforce · demographics
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {dept.supporting.map((s) => (
                <TrendPanel key={s.id} series={s} />
              ))}
            </div>
          </section>
        )}

        {/* Workforce small multiples (DHSC only) */}
        {dept.code === "dhsc" && (
          <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TurnoverBreakdown />
            </div>
            <SynthesisCard dept={dept} />
          </section>
        )}

        {dept.code !== "dhsc" && (
          <section className="mt-8">
            <SynthesisCard dept={dept} />
          </section>
        )}

        <Footer />
      </main>
    </div>
  );
}

function SynthesisCard({ dept }: { dept: Department }) {
  const inds = departmentIndicators(dept);
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Indicator snapshot
      </div>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">
        {inds.length
          ? `${inds.length} officially-sourced indicator${inds.length === 1 ? "" : "s"}`
          : "Awaiting officially-sourced indicators"}
      </h3>
      {inds.length > 0 && (
        <>
          <div className="mt-3 flex gap-1" role="img" aria-label="Per-indicator RAG snapshot">
            {inds.map((i) => (
              <span
                key={i.series.id}
                className="h-2.5 flex-1 rounded-sm"
                style={{ background: ragColor(i.score, i.targeted) }}
                title={`${i.series.title}${i.targeted ? "" : " — no external benchmark (scored vs own history)"}`}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Per-indicator RAG against each measure&rsquo;s published target where
            one exists; muted bars have no external benchmark and are scored
            against the series&rsquo; own history. Deliberately not reduced to a
            single grade.
          </p>
        </>
      )}

      <div className="mt-4 border-t border-border/60 pt-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Editorial assessment
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{dept.synthesis}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {dept.themes.map((t) => (
          <span
            key={t}
            className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
