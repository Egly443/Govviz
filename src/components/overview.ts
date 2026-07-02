import {
  latest,
  minMax,
  realAsOf,
  seriesIsReal,
  SHOW_ILLUSTRATIVE,
  stalenessOf,
  type TrendSeries,
} from "./data";
import { departments, type Department } from "./departments";

export type IndicatorRole = "hero" | "core" | "supporting";

/** Recent direction of travel for an indicator (the treemap's momentum glyph). */
export type Momentum = {
  dir: "up" | "down" | "flat"; // direction of the underlying value (matches the chart line)
  good: boolean; // is that movement in the good direction (false when flat)
  steep: boolean; // strong vs slight
  glyph: string; // ▬ ▴ ▲ ▾ ▼
  label: string; // screen-reader text, e.g. "falling — improving"
};

export interface IndicatorCell {
  series: TrendSeries;
  dept: Department;
  role: IndicatorRole;
  value: number; // treemap leaf value — equal within a department (size encodes budget)
  score: number; // 0 (poor) .. 1 (good)
  targeted: boolean; // RAG anchored to a published target (vs own-range fallback)
  uncertain: boolean; // latest CI straddles the target — pass/fail indeterminate
  momentum: Momentum; // recent direction of travel
  current: number; // latest value
  real: boolean; // backed by an official source (derived-series aware)
}

export interface DeptBlock {
  dept: Department;
  cells: IndicatorCell[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * RAG score, oriented so 1 = good and 0 = poor (respecting `goodDirection`).
 *
 * Where a published target/standard exists, "green" means *at or beyond that
 * external benchmark* — not merely better than the series' own worst-ever
 * reading. This stops a chronically failing indicator from scoring green just
 * because it has bounced off the bottom of its own range, and stops a strong
 * indicator scoring red for being a fraction off its own best. Redness then
 * scales by how far short of the standard performance is, using the historical
 * extreme as the poor-end anchor.
 *
 * Without a target we fall back to position-within-own-range. This is a known
 * limitation (it can flatter a consistently poor series); such indicators
 * should acquire a statutory target or an international comparator over time.
 */
export function ragScore(series: TrendSeries): number {
  const { min, max } = minMax(series);
  const cur = latest(series).value;

  if (series.target) {
    const t = series.target.value;
    if (series.goodDirection === "up") {
      if (cur >= t) return 1;
      const bad = Math.min(min.value, t);
      return t === bad ? 1 : clamp01((cur - bad) / (t - bad));
    }
    // goodDirection "down": target is a ceiling.
    if (cur <= t) return 1;
    const bad = Math.max(max.value, t);
    return bad === t ? 1 : clamp01((bad - cur) / (bad - t));
  }

  if (max.value === min.value) return 0.5;
  const pos = (cur - min.value) / (max.value - min.value);
  return series.goodDirection === "up" ? pos : 1 - pos;
}

// Trailing window for the momentum slope, by cadence (≈ a year-plus of data).
const MOMENTUM_WINDOW: Record<TrendSeries["cadence"], number> = {
  monthly: 12,
  quarterly: 6,
  annual: 5,
};
const FLAT = 0.03; // |change|/range below this reads flat (noise, not a trend)
const STEEP = 0.12; // at/above this reads "strong"

/**
 * Recent direction of travel — the treemap's momentum channel, independent of
 * the colour (which encodes level-vs-target). The glyph follows the underlying
 * value (▲ rising / ▼ falling, matching the chart line); `good` says whether
 * that movement is the way you'd want (respecting goodDirection), and drives the
 * tint and the screen-reader label.
 *
 * Computed as an OLS slope over a cadence-aware trailing window; the modelled
 * change across the window is expressed as a fraction of the series' full range
 * so it is comparable across units, then bucketed flat / slight / strong. A move
 * within ~3% of range reads flat, so noise is never shown as a trend (mirrors
 * the delta chip's "≈ flat").
 */
export function momentum(series: TrendSeries): Momentum {
  const flat: Momentum = { dir: "flat", good: false, steep: false, glyph: "▬", label: "broadly flat" };
  const pts = series.points;
  if (!pts || pts.length < 3) return flat;
  const w = Math.min(MOMENTUM_WINDOW[series.cadence] ?? 6, pts.length);
  const win = pts.slice(-w);
  const n = win.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  win.forEach((p, i) => {
    sx += i;
    sy += p.value;
    sxx += i * i;
    sxy += i * p.value;
  });
  const denom = n * sxx - sx * sx;
  if (denom === 0) return flat;
  const slope = (n * sxy - sx * sy) / denom;
  const change = slope * (n - 1); // modelled change across the window
  const { min, max } = minMax(series);
  const range = max.value - min.value;
  if (!Number.isFinite(range) || range === 0) return flat;
  const frac = change / range;
  const mag = Math.abs(frac);
  if (mag < FLAT) return flat;
  const rising = frac > 0;
  const good = series.goodDirection === "up" ? rising : !rising;
  const steep = mag >= STEEP;
  const glyph = rising ? (steep ? "▲" : "▴") : steep ? "▼" : "▾";
  const label = `${rising ? "rising" : "falling"}${steep ? " fast" : ""} — ${good ? "improving" : "worsening"}`;
  return { dir: rising ? "up" : "down", good, steep, glyph, label };
}

/**
 * Option-A uncertainty: true when the latest observation carries a published
 * confidence interval that *straddles the target* — so we cannot statistically
 * tell pass from fail and must not paint a confident green or red. Only applies
 * to a real statutory/standard target (not a `reference` baseline) on a series
 * whose latest point has lo/hi.
 */
export function isUncertain(series: TrendSeries): boolean {
  if (!series.target || series.target.kind === "reference") return false;
  const p = latest(series);
  if (p.lo == null || p.hi == null) return false;
  const t = series.target.value;
  return t >= p.lo && t <= p.hi;
}

/**
 * Map 0..1 (poor..good) to a Finviz-style red → amber → green heat colour.
 * Piecewise hue so the midpoint reads amber rather than chartreuse.
 *
 * `benchmarked` = the score is anchored to a published target/standard. When
 * false (the RAG fell back to position-within-own-history), the colour is
 * heavily desaturated so it reads as *indicative, not a verdict* — an
 * own-range score is not comparable to a target-anchored one.
 */
/**
 * Redundant (non-colour) encoding of a RAG score, so the rating survives
 * colour-blindness and greyscale. Returns a short glyph and a screen-reader
 * label. `benchmarked = false` means no external target (scored vs own history),
 * shown as a neutral dash.
 */
export function ragLabel(
  score: number,
  benchmarked = true,
  uncertain = false,
): { letter: string; label: string } {
  if (uncertain) return { letter: "≈", label: "within margin of error of target" };
  if (!benchmarked) return { letter: "–", label: "no external benchmark" };
  const s = Math.max(0, Math.min(1, score));
  if (s >= 0.66) return { letter: "G", label: "green" };
  if (s >= 0.33) return { letter: "A", label: "amber" };
  return { letter: "R", label: "red" };
}

// Distinct fill for the Option-A "uncertain" state: a desaturated amber that
// reads as *indeterminate* rather than a confident verdict. Bright enough that
// near-black text always wins contrast, so the text colour is fixed.
export function ragUncertainColor(): string {
  return "hsl(46 24% 46%)";
}
export const UNCERTAIN_TEXT = "#0b0d12";

function ragHsl(score: number, benchmarked: boolean) {
  const s = Math.max(0, Math.min(1, score));
  const hue =
    s < 0.5 ? 8 + (46 - 8) * (s / 0.5) : 46 + (142 - 46) * ((s - 0.5) / 0.5);
  const sat = benchmarked ? 58 : 18;
  const light = s < 0.5 ? 40 + 6 * (s / 0.5) : 46 - 5 * ((s - 0.5) / 0.5);
  return { h: hue, s: sat, l: light };
}

export function ragColor(score: number, benchmarked = true): string {
  const { h, s, l } = ragHsl(score, benchmarked);
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}

// sRGB relative luminance of an HSL colour (WCAG 2.x), used to pick a readable
// text colour over a tile fill.
function relLuminance(h: number, s: number, l: number): number {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = L - c / 2;
  const lin = (v: number) => {
    const u = v + m;
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * A readable text colour (near-black or near-white) for label/value text drawn
 * on top of a RAG tile fill. The amber band is bright enough that white text
 * fails WCAG AA, while the red band is dark enough that black text fails — so
 * the choice is made per-tile by maximising contrast against the actual fill,
 * not assumed. Returns slightly-off black/white to avoid harsh edges.
 */
export function ragTextColor(score: number, benchmarked = true): string {
  const { h, s, l } = ragHsl(score, benchmarked);
  const bg = relLuminance(h, s, l);
  // Contrast ratio vs white (lum 1) and near-black (lum ~0.03).
  const contrastWhite = (1 + 0.05) / (bg + 0.05);
  const contrastBlack = (bg + 0.05) / (0.02 + 0.05);
  return contrastBlack >= contrastWhite ? "#0b0d12" : "#ffffff";
}

export interface ScoredIndicator {
  series: TrendSeries;
  score: number;
  /** True when the RAG is anchored to a published target/standard (not own-range). */
  targeted: boolean;
  /** Latest CI straddles the target — pass/fail indeterminate. */
  uncertain: boolean;
  /** Recent direction of travel. */
  momentum: Momentum;
}

/**
 * A department's scored indicators (no composite letter grade — deliberately
 * not reduced to a single, value-laden verdict). Only *scored* indicators are
 * returned: in production that means real, officially-sourced series; unsourced
 * placeholders are excluded. The UI renders these as a per-indicator RAG strip.
 */
export function departmentIndicators(dept: Department): ScoredIndicator[] {
  const lists: TrendSeries[][] = [[dept.hero], dept.core, dept.supporting ?? []];
  const seen = new Set<string>();
  const out: ScoredIndicator[] = [];
  for (const list of lists) {
    for (const s of list) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      if (!seriesIsReal(s) && !SHOW_ILLUSTRATIVE) continue; // skip prod placeholders
      out.push({
        series: s,
        score: ragScore(s),
        targeted: !!s.target,
        uncertain: isUncertain(s),
        momentum: momentum(s),
      });
    }
  }
  return out;
}

export interface DataHealth {
  total: number; // distinct indicators across all departments
  live: number; // backed by real, fetched data
  placeholder: number; // no source wired yet
  stale: number; // live but source has gone quiet past its publication window
  benchmarked: number; // live AND anchored to an official target/standard
  livePct: number; // live / total, 0..100
  benchmarkedPct: number; // benchmarked / live, 0..100
  medianAgeMonths: number | null; // median age of live series' latest point
  oldestYear: number | null; // earliest "latest point" year among live series
  newestFetch: string | null; // most recent CI fetch date across live series
}

/**
 * Whole-of-government data-quality summary. The dashboard already exposes
 * freshness and provenance per chart; this aggregates the same signals into a
 * single, honest health read — how complete the coverage is, how much is
 * benchmarked to an external standard, and how fresh it is — so the system-level
 * state is visible rather than buried in CI logs.
 */
export function dataHealth(): DataHealth {
  const seen = new Set<string>();
  const series: TrendSeries[] = [];
  for (const d of departments) {
    for (const s of [d.hero, ...d.core, ...(d.supporting ?? [])]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      series.push(s);
    }
  }

  const liveSeries = series.filter((s) => seriesIsReal(s));
  const ages: number[] = [];
  const years: number[] = [];
  const fetches: string[] = [];
  for (const s of liveSeries) {
    const v = stalenessOf(s);
    if (Number.isFinite(v.monthsOld)) ages.push(v.monthsOld);
    if (Number.isFinite(v.latestYear)) years.push(v.latestYear);
    const f = s.derivedFrom
      ? s.derivedFrom.map(realAsOf).filter((x): x is string => !!x).sort()[0]
      : realAsOf(s.id);
    if (f) fetches.push(f);
  }
  ages.sort((a, b) => a - b);
  const median = ages.length
    ? ages.length % 2
      ? ages[(ages.length - 1) / 2]
      : Math.round((ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2)
    : null;

  const stale = liveSeries.filter((s) => stalenessOf(s).stale).length;
  const benchmarked = liveSeries.filter(
    (s) => s.target && s.target.kind !== "reference",
  ).length;

  return {
    total: series.length,
    live: liveSeries.length,
    placeholder: series.length - liveSeries.length,
    stale,
    benchmarked,
    livePct: series.length ? Math.round((liveSeries.length / series.length) * 100) : 0,
    benchmarkedPct: liveSeries.length
      ? Math.round((benchmarked / liveSeries.length) * 100)
      : 0,
    medianAgeMonths: median,
    oldestYear: years.length ? Math.min(...years) : null,
    newestFetch: fetches.length ? fetches.sort()[fetches.length - 1] : null,
  };
}

export function buildOverview(): DeptBlock[] {
  return departments.map((dept) => {
    const roleLists: [IndicatorRole, TrendSeries[]][] = [
      ["hero", [dept.hero]],
      ["core", dept.core],
      ["supporting", dept.supporting ?? []],
    ];

    const rawAll: { series: TrendSeries; role: IndicatorRole }[] = [];
    const seen = new Set<string>();
    for (const [role, list] of roleLists) {
      for (const series of list) {
        if (seen.has(series.id)) continue;
        seen.add(series.id);
        rawAll.push({ series, role });
      }
    }
    const rawLive = rawAll.filter(
      ({ series }) => seriesIsReal(series) || SHOW_ILLUSTRATIVE,
    );
    // Production should not spend dashboard area on black placeholder tiles.
    // If a local build has no baked data at all, keep placeholders visible so
    // the layout still communicates what the dashboard tracks.
    const raw = rawLive.length ? rawLive : rawAll;

    // Option C: tile area encodes DEPARTMENT BUDGET only. Every indicator in a
    // department gets an equal share, so the block area is proportional to spend
    // and within-block size carries no (editorial) meaning. Role/importance is
    // shown by a corner marker, not by area.
    const per = raw.length ? dept.spendBn / raw.length : 0;
    const cells: IndicatorCell[] = raw.map((r) => ({
      series: r.series,
      dept,
      role: r.role,
      value: per,
      score: ragScore(r.series),
      targeted: !!r.series.target,
      uncertain: isUncertain(r.series),
      momentum: momentum(r.series),
      current: latest(r.series).value,
      real: seriesIsReal(r.series),
    }));

    return { dept, cells };
  });
}
