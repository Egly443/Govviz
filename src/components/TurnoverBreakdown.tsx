import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { turnoverByGroup, type GroupSeries } from "./data";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function TurnoverBreakdown() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Workforce
      </div>
      <h3 className="mt-1 text-base font-semibold tracking-tight sm:text-lg">
        NHS turnover by staff group
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Rolling 12-month leaver rate, 2014&ndash;present
      </p>

      <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        {turnoverByGroup.map((g) => (
          <GroupCell key={g.group} g={g} />
        ))}
      </div>
    </div>
  );
}

function GroupCell({ g }: { g: GroupSeries }) {
  // Turnover is "down is good" — a rising leaver rate is the bad direction.
  const worsening = g.delta.trim().startsWith("+");
  const id = `tg-${slug(g.group)}`;

  return (
    <div className="bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{g.group}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {g.current.toFixed(1)}%
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            worsening
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          {g.delta}
        </span>
      </div>

      <div className="mt-3 h-12 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={g.points}
            margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={1.6}
              fill={`url(#${id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
