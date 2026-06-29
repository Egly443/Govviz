import { dataHealth } from "./overview";

/**
 * System-level data-quality strip for the overview. Surfaces the
 * whole-of-government coverage/freshness signals (live vs placeholder,
 * benchmarked share, data age) that are otherwise only visible per-chart or in
 * CI logs — an honest, at-a-glance read on how complete and how fresh the
 * dashboard actually is.
 */
export function DataHealthStrip() {
  const h = dataHealth();
  if (!h.total) return null;

  const ageLabel =
    h.medianAgeMonths == null
      ? "—"
      : h.medianAgeMonths < 12
        ? `${h.medianAgeMonths} mo`
        : `${(h.medianAgeMonths / 12).toFixed(1)} yr`;

  const stats: { label: string; value: string; hint: string; tone?: "warn" }[] = [
    {
      label: "Live indicators",
      value: `${h.live} / ${h.total}`,
      hint: `${h.livePct}% of tracked indicators are backed by real, fetched official data; the rest show an explicit "no source yet" placeholder.`,
    },
    {
      label: "Benchmarked",
      value: `${h.benchmarkedPct}%`,
      hint: `${h.benchmarked} of ${h.live} live indicators are scored against a published official target or standard; the rest are scored against their own history (shown desaturated).`,
    },
    {
      label: "Median data age",
      value: ageLabel,
      hint: "Median age of the latest data point across live indicators — official statistics publish with a lag.",
    },
    {
      label: "Aged sources",
      value: String(h.stale),
      hint: "Live indicators whose source has not refreshed within the expected publication window for its cadence (flagged 'aged' on the chart).",
      tone: h.stale > 0 ? "warn" : undefined,
    },
  ];

  return (
    <section
      aria-label="Whole-of-government data health"
      className="mt-8 rounded-xl border border-border bg-card/40 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Data health
        </h2>
        {h.newestFetch && (
          <span className="text-[11px] text-muted-foreground">
            Last fetched {h.newestFetch}
          </span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            title={s.hint}
            className="rounded-lg border border-border/60 bg-surface/50 px-3 py-2.5"
          >
            <dd
              className="text-xl font-semibold tabular-nums"
              style={s.tone === "warn" ? { color: "#f6c451" } : undefined}
            >
              {s.value}
            </dd>
            <dt className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Every figure is fetched from an official source in CI and validated
        against a plausibility range before it ships; unsourced indicators are
        left explicitly blank rather than estimated. Tile size is an editorial
        spend estimate, not a fetched series.
      </p>
    </section>
  );
}
