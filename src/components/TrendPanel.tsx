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
  latest,
  minMax,
  realAsOf,
  realSourceUrl,
  seriesIsReal,
  SHOW_ILLUSTRATIVE,
  slicePoints,
  stalenessOf,
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

  // Normalise to a list of lines (single-line charts become one line). Lines
  // with no points (e.g. international comparators not yet baked by CI) are
  // dropped so the chart degrades gracefully to whatever real lines exist.
  const lines: Required<SeriesLine>[] = useMemo(() => {
    const raw = series.lines ?? [
      { id: series.id, label: series.title, points: series.points },
    ];
    const nonEmpty = raw.filter((l) => l.points.length > 0);
    return (nonEmpty.length ? nonEmpty : raw).map((l, i) => ({
      ...l,
      color: l.color ?? LINE_COLORS[i % LINE_COLORS.length],
    }));
  }, [series]);
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

  // A derived (cost÷outcome) series is real iff every input series is real;
  // its freshness is the oldest of its inputs.
  const real = seriesIsReal(series);
  const asOf = series.derivedFrom
    ? series.derivedFrom
        .map(realAsOf)
        .filter((d): d is string => !!d)
        .sort()[0]
    : realAsOf(series.id);
  // Data vintage / staleness — only meaningful for real series.
  const vintage = real ? stalenessOf(series) : null;
  // Exact file CI fetched (preferred over the static landing-page sourceUrl).
  const exactSrc = real ? realSourceUrl(series.id) : undefined;

  // Production honesty gate: never render a fabricated trend line. An unsourced
  // series shows an explicit placeholder instead of its illustrative fallback.
  if (!real && !SHOW_ILLUSTRATIVE) {
    return <UnsourcedPanel series={series} height={height} hero={hero} />;
  }

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

  // Size the Y axis to its widest tick label. A fixed width + negative left
  // margin right-anchors tick text at a fixed x, so wide labels (e.g.
  // "£130.3bn", "32.3%") overflow past the SVG origin and get clipped by the
  // card's overflow-hidden. Estimate the widest formatted label across the
  // domain (and any target) and reserve enough width, with left margin 0 so the
  // axis is never pulled off-canvas. ~6.6px/char at 11px is a safe over-estimate.
  const yLabelSamples = [
    yDomain[0],
    yDomain[1],
    (yDomain[0] + yDomain[1]) / 2,
    ...(series.target ? [series.target.value] : []),
  ];
  const widestYChars = Math.max(1, ...yLabelSamples.map((v) => yFmt(v).length));
  const yAxisWidth = Math.min(80, Math.max(34, Math.ceil(widestYChars * 6.6) + 12));

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
            {series.vfm && (
              <span
                className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] text-primary"
                title="Value-for-money indicator: cost ÷ outcome, unit cost, or spending efficiency/leakage"
              >
                Value for money
              </span>
            )}
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
            {real && vintage && Number.isFinite(vintage.latestYear) && (
              <span
                className="rounded-full border px-1.5 py-px text-[10px]"
                style={
                  vintage.stale
                    ? { color: "#f6c451", borderColor: "#f6c45155", background: "#f6c45118" }
                    : { borderColor: "var(--border)", background: "var(--surface)" }
                }
                title={
                  vintage.stale
                    ? `Aged data: latest point is ${vintage.latestDate} (~${vintage.monthsOld} months old) — the source has not published newer figures.`
                    : `Data through ${vintage.latestDate}`
                }
              >
                {vintage.stale ? `aged · to ${vintage.latestYear}` : `to ${vintage.latestYear}`}
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
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground"
              title={
                series.target.kind === "reference"
                  ? `Reference line (${series.target.label}) — a historical baseline, not an official target`
                  : `Official standard: ${series.target.label}`
              }
            >
              {series.target.kind === "reference"
                ? `Ref: ${series.target.label}`
                : `Target ${series.format(series.target.value)}`}
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="mt-5 w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              width={yAxisWidth}
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

      {series.methodology && (
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground/70">How it&rsquo;s calculated: </span>
          {series.methodology}
        </p>
      )}

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <a
            href={exactSrc ?? series.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            title={
              exactSrc
                ? `Exact file fetched: ${exactSrc}`
                : `Source: ${series.source}`
            }
          >
            Source: {series.source}{exactSrc ? " ⤓" : ""} ↗
          </a>
          {real && asOf && <span className="opacity-70">· fetched {asOf}</span>}
        </span>
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

/**
 * Shown in production for any indicator with no official source wired yet —
 * deliberately blank rather than displaying an invented trajectory. Keeps the
 * title, subtitle and the source we're chasing so the gap is transparent.
 */
function UnsourcedPanel({
  series,
  height,
  hero,
}: {
  series: TrendSeries;
  height: number;
  hero?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-dashed border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span
          className="rounded-full border border-border bg-surface px-1.5 py-px text-[10px]"
          title="No official source wired yet — intentionally left blank rather than showing fabricated data"
        >
          No source yet
        </span>
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
      <div
        className="mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-surface/40 px-4 text-center"
        style={{ height }}
      >
        <p className="text-sm font-medium text-foreground/80">
          No official data source wired yet
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          This indicator is intentionally left blank rather than showing an
          illustrative trend. We are working to wire a reputable source.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <a
          href={series.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          title={`Source being chased: ${series.source}`}
        >
          Source being chased: {series.source} ↗
        </a>
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
