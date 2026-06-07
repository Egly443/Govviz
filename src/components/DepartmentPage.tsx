import { TopNav } from "./TopNav";
import { TrendPanel } from "./TrendPanel";
import { TurnoverBreakdown } from "./TurnoverBreakdown";
import { DepartmentTabs } from "./DepartmentTabs";
import type { Department } from "./departments";

interface Props {
  department: Department;
}

export function DepartmentPage({ department: dept }: Props) {
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Last updated 5 Jun 2026
          </div>
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

        <footer className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <div>
            Data: official UK government, NAO, ONS and IPA sources. Figures
            illustrative for demonstration.
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-foreground">
              Methodology
            </a>
            <a href="#" className="hover:text-foreground">
              Download CSV
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function SynthesisCard({ dept }: { dept: Department }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Synthesis
      </div>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">Competence rating</h3>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tracking-tight text-primary">
          {dept.rating}
        </span>
        <span className="text-sm text-muted-foreground">/ A&ndash;F scale</span>
      </div>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{dept.synthesis}</p>
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
