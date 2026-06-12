import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  deltaVs,
  formatMonth,
  isRealSeries,
  latest,
  minMax,
  realAsOf,
  slicePoints,
  type SeriesLine,
  type SeriesUnit,
  type TrendSeries,
} from "./data";

type Range = 5 | 10 | 20 | "max";

// Distinct, dark-background-friendly line colours for multi-line charts.
const LINE_COLORS = [
  "var(--primary)", // emerald
  "#5b9cff", // blue
  "#f6c451", // amber
  "#c084fc", // violet
];

interface Props {
  series: TrendSeries;
  height?: number;
  defaultRange?: Range;
  showAnnotations?: boolean;
  hero?: boolean;
}

export function TrendPanel({
  series,
  height = 280,
  defaultRange = "max",
  showAnnotations = true,
  hero = false,
}: Props) {
  const ranges: Range[] = series.cadence === "annual" ? [10, 20, "max"] : [5, 10, 20, "max"];
  const [range, setRange] = useState<Range>(defaultRange);

  // Normalise to a list of lines (single-line charts become one line).
  const lines: Required<SeriesLine>[] = useMemo(
    () =>
      (series.lines ?? [{ id: series.id, label: series.title, points: series.points }]).map(
        (l, i) => ({ ...l, color: l.color ?? LINE_COLORS[i % LINE_COLORS.length] }),
      ),
    [series],
  );
  const multi = lines.length > 1;

  // Merge each line's sliced points into a single row-per-date dataset.
  const data = useMemo(() => {
    const years = range === "max" ? "max" : range;
    const byDate = new Map<string, Record<string, number | string>>();
    lines.forEach((l, i) => {
      for (const p of slicePoints(l.points, years)) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[`l${i}`] = p.value;
        byDate.set(p.date, row);
      }
    });
    return [...byDate.values()].sort((a, b) =>
      (a.date as string) < (b.date as string) ? -1 : 1,
    );
  }, [lines, range]);

  const real = isRealSeries(series.id);
  const asOf = realAsOf(series.id);

  const current = latest(series);
  const yoy = deltaVs(series, 12);
  const dec = deltaVs(series, 120);
  const { min, max } = minMax(series);

  const yFmt = (v: number) => {
    if (series.yFormat) return series.yFormat(v);
    switch (series.unit) {
      case "percent":
        return `${Math.round(v)}%`;
      case "years":
        return `${v.toFixed(0)}`;
      case "gbp":
        return `£${v.toFixed(1)}bn`;
      case "days":
        return `${Math.round(v)}d`;
      case "beds":
        return `${(v / 1000).toFixed(1)}k`;
      case "count":
      case "currency":
        return series.shortFormat(v);
      case "people":
      default:
        return `${v.toFixed(1)}M`;
    }
  };

  // Smart Y-domain padding across every line.
  const values = data.flatMap((d) =>
    lines.map((_, i) => d[`l${i}`]).filter((v): v is number => typeof v === "number"),
  );
  const yMin = values.length ? Math.min(...values) : 0;
  const yMax = values.length ? Math.max(...values) : 1;
  const pad = (yMax - yMin) * 0.15 || 1;
  // Anchor positive-only series at/above 0, but allow negatives (e.g. surplus).
  const lower = yMin >= 0 ? Math.max(0, yMin - pad) : yMin - pad;
  const yDomain: [number, number] = [
    lower,
    series.target ? Math.max(yMax + pad, series.target.value + pad / 2) : yMax + pad,
  ];

  const visibleAnnotations =
    showAnnotations && data.length
      ? series.annotations.filter(
          (a) =>
            new Date(a.date) >= new Date(data[0].date as string) &&
            new Date(a.date) <= new Date(data[data.length - 1].date as string),
        )
      : [];

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>
              {series.cadence === "annual" ? "Annual" : "Monthly"} · {series.points.length} points
            </span>
            {real ? (
              <span
                className="rounded-full border border-primary/25 bg-primary/10 px-1.5 py-px text-[10px] text-primary"
                title={asOf ? `Official data, fetched ${asOf}` : "Official data"}
              >
                Official data
              </span>
            ) : (
              <span
                className="rounded-full border border-border bg-surface px-1.5 py-px text-[10px]"
                title="No live source wired yet — values are indicative, not official statistics"
              >
                Illustrative
              </span>
            )}
          </div>
          <h3
            className={`mt-1 font-semibold tracking-tight ${
              hero ? "text-xl sm:text-2xl" : "text-base sm:text-lg"
            }`}
          >
            {series.title}
          </h3>
          {series.subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{series.subtitle}</p>
          )}

          {multi ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {lines.map((l) => {
                const lv = l.points[l.points.length - 1];
                return (
                  <span key={l.id} className="inline-flex items-baseline gap-1.5">
                    <span
                      className="inline-block h-2 w-2 translate-y-[-1px] rounded-full"
                      style={{ background: l.color }}
                    />
                    <span className="text-xs text-muted-foreground">{l.label}</span>
                    <span
                      className={`tabular-nums font-semibold text-foreground ${
                        hero ? "text-xl" : "text-lg"
                      }`}
                    >
                      {lv ? series.format(lv.value) : "—"}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={`font-semibold tabular-nums text-foreground ${
                  hero ? "text-4xl sm:text-5xl" : "text-3xl"
                }`}
              >
                {series.format(current.value)}
              </span>
              <span className="text-xs text-muted-foreground">{formatMonth(current.date)}</span>
            </div>
          )}
        </div>

        <RangeToggle value={range} onChange={setRange} options={ranges} />
      </div>

      {/* Delta chips (single-line only) */}
      {!multi && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <DeltaChip
            label="vs 1y"
            delta={yoy?.diff}
            good={series.goodDirection}
            unit={series.unit}
            customFormat={series.deltaFormat}
          />
          <DeltaChip
            label="vs 10y"
            delta={dec?.diff}
            good={series.goodDirection}
            unit={series.unit}
            customFormat={series.deltaFormat}
          />
          {series.target && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
              Target {series.format(series.target.value)}
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="mt-5 w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${series.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={40}
              tickFormatter={(iso: string) => new Date(iso).getUTCFullYear().toString()}
            />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={yDomain}
              tickFormatter={yFmt}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--popover-foreground)",
                boxShadow: "0 10px 30px -10px rgba(0,0,0,.5)",
              }}
              labelFormatter={(iso) => formatMonth(iso as string)}
              formatter={(value: unknown, name: unknown) => [
                series.format(Number(value)),
                name as string,
              ]}
            />
            {series.target && (
              <ReferenceLine
                y={series.target.value}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: series.target.label,
                  position: "insideTopRight",
                  fill: "var(--primary)",
                  fontSize: 10,
                }}
              />
            )}
            {visibleAnnotations.map((a) => (
              <ReferenceLine
                key={a.date}
                x={a.date}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.35}
                strokeDasharray="2 4"
                label={{
                  value: a.label,
                  position: "insideTopLeft",
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                  offset: 8,
                }}
              />
            ))}
            {!multi && (
              <Area
                type="monotone"
                dataKey="l0"
                stroke="none"
                fill={`url(#grad-${series.id})`}
                isAnimationActive
              />
            )}
            {lines.map((l, i) => (
              <Line
                key={l.id}
                type="monotone"
                dataKey={`l${i}`}
                name={l.label}
                stroke={l.color}
                strokeWidth={hero ? 2.25 : 1.85}
                dot={false}
                activeDot={{ r: 4, fill: l.color }}
                connectNulls
                isAnimationActive
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <a
          href={series.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          title={`Source: ${series.source}`}
        >
          Source: {series.source} ↗
        </a>
        {multi ? (
          <span className="tabular-nums">{formatMonth(current.date)}</span>
        ) : (
          <span className="flex gap-3 tabular-nums">
            <span>
              min <span className="text-foreground">{series.shortFormat(min.value)}</span>{" "}
              {formatMonth(min.date)}
            </span>
            <span>
              max <span className="text-foreground">{series.shortFormat(max.value)}</span>{" "}
              {formatMonth(max.date)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function RangeToggle({
  value,
  onChange,
  options,
}: {
  value: Range;
  onChange: (r: Range) => void;
  options: Range[];
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-surface p-0.5 text-[11px] font-medium">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={String(opt)}
            onClick={() => onChange(opt)}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt === "max" ? "MAX" : `${opt}Y`}
          </button>
        );
      })}
    </div>
  );
}

function DeltaChip({
  label,
  delta,
  good,
  unit,
  customFormat,
}: {
  label: string;
  delta: number | undefined;
  good: "up" | "down";
  unit: SeriesUnit;
  customFormat?: (v: number) => string;
}) {
  if (delta === undefined || delta === null || Number.isNaN(delta)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
        <Minus className="h-3 w-3" /> {label} n/a
      </span>
    );
  }
  const isUp = delta > 0;
  const isGood = (isUp && good === "up") || (!isUp && good === "down");
  const Arrow = isUp ? ArrowUpRight : ArrowDownRight;
  const cls = isGood
    ? "border-primary/25 bg-primary/10 text-primary"
    : "border-destructive/25 bg-destructive/10 text-destructive";
  const sign = isUp ? "+" : "";
  let fmt: string;
  if (customFormat) {
    fmt = customFormat(delta);
  } else {
    switch (unit) {
      case "percent":
        fmt = `${sign}${delta.toFixed(1)}pp`;
        break;
      case "years":
        fmt = `${sign}${delta.toFixed(1)}y`;
        break;
      case "gbp":
        fmt = `${sign}£${delta.toFixed(2)}bn`;
        break;
      case "days":
        fmt = `${sign}${Math.round(delta)}d`;
        break;
      case "beds":
        fmt = `${sign}${(delta / 1000).toFixed(1)}k`;
        break;
      case "count":
      case "currency":
        fmt = `${sign}${delta.toLocaleString("en-GB", { maximumFractionDigits: 1 })}`;
        break;
      case "people":
      default:
        fmt = `${sign}${delta.toFixed(2)}M`;
    }
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Arrow className="h-3 w-3" />
      {label} {fmt}
    </span>
  );
}
