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
  spc: SpcVerdict | null; // XmR signal-vs-noise verdict (null = too few points)
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

// ============================================================
// Statistical process control (XmR / NHS "Making Data Count")
// ============================================================
//
// Colouring a tile by comparing the single latest point to a target can't tell
// a real signal from common-cause noise — exactly the practice NHS England's
// "Making Data Count" programme and the OSR advise against. An individuals &
// moving-range (XmR) chart fixes this: process limits sit at mean ± 2.66·(mean
// moving range) (= 3σ via the n=2 d2 constant 1.128), and the latest *state* is
// then classified as common-cause variation or a special cause, plus — where a
// target exists — whether the process is *capable* of consistently meeting it
// (the MDC "variation" and "assurance" verdicts). This is signal-vs-noise, not
// last-dot-vs-line.

/** Special-cause direction, oriented by goodDirection. */
export type SpcVariation = "improvement" | "concern" | "neutral";
/** Process capability against a published target. */
export type SpcAssurance = "pass" | "fail" | "inconsistent" | "none";

export interface SpcVerdict {
  mean: number;
  ucl: number; // upper control limit (mean + 2.66·MRbar)
  lcl: number; // lower control limit (mean − 2.66·MRbar)
  mrBar: number; // mean moving range
  n: number; // points used
  variation: SpcVariation;
  assurance: SpcAssurance;
  /** Which side of the mean the current special cause sits on (null = common cause). */
  signalSide: "high" | "low" | null;
  /** Plain-language reason for the variation verdict, if any. */
  rule: string | null;
}

// Minimum points for a usable XmR baseline; below this, limits aren't meaningful.
const SPC_MIN_POINTS = 8;
// Run length for the shift (points one side of the mean) and trend (monotonic) rules.
const SPC_RUN = 7;
// 3σ expressed via the d2 constant for n=2 moving ranges (3 / 1.128 = 2.66).
const SPC_LIMIT_K = 2.66;

/**
 * XmR control-chart verdict for a series, oriented by `goodDirection`. Limits
 * are computed over the full series — they are a property of the series, frozen
 * regardless of the chart's zoom — and the latest point's state is classified
 * with the three standard run rules (point beyond a limit; a run of `SPC_RUN`
 * one side of the mean; a run of `SPC_RUN` monotonic steps). Returns null when
 * there are too few points for meaningful limits.
 *
 * Known limitation: limits are not auto-recalculated across a known structural
 * break (e.g. Covid), so a large step change widens the limits and can mask a
 * later signal. Segmenting on annotation break-points is a sound next step; the
 * standard XmR here is already a strict improvement on single-point RAG.
 */
export function spcVerdict(series: TrendSeries): SpcVerdict | null {
  const vals = series.points.map((p) => p.value).filter((v) => Number.isFinite(v));
  const n = vals.length;
  if (n < SPC_MIN_POINTS) return null;

  const mean = vals.reduce((a, b) => a + b, 0) / n;
  let mrSum = 0;
  for (let i = 1; i < n; i++) mrSum += Math.abs(vals[i] - vals[i - 1]);
  const mrBar = mrSum / (n - 1);
  const half = SPC_LIMIT_K * mrBar;
  const ucl = mean + half;
  const lcl = mean - half;

  // Classify the current special-cause state from the most recent points.
  let signalSide: "high" | "low" | null = null;
  let rule: string | null = null;
  const lastVal = vals[n - 1];
  if (mrBar > 0) {
    if (lastVal > ucl) {
      signalSide = "high";
      rule = "latest point beyond the upper control limit";
    } else if (lastVal < lcl) {
      signalSide = "low";
      rule = "latest point beyond the lower control limit";
    } else {
      // Shift: SPC_RUN consecutive points the same side of the mean, ending now.
      let above = 0;
      let below = 0;
      for (let i = n - 1; i >= 0; i--) {
        if (vals[i] > mean) {
          if (below) break;
          above++;
        } else if (vals[i] < mean) {
          if (above) break;
          below++;
        } else break;
      }
      if (above >= SPC_RUN) {
        signalSide = "high";
        rule = `${above} consecutive points above the centre line`;
      } else if (below >= SPC_RUN) {
        signalSide = "low";
        rule = `${below} consecutive points below the centre line`;
      } else {
        // Trend: SPC_RUN consecutive monotonic steps ending now.
        let rising = 1;
        let falling = 1;
        for (let i = n - 1; i > 0; i--) {
          if (vals[i] > vals[i - 1]) rising++;
          else break;
        }
        for (let i = n - 1; i > 0; i--) {
          if (vals[i] < vals[i - 1]) falling++;
          else break;
        }
        if (rising >= SPC_RUN) {
          signalSide = "high";
          rule = `${rising} consecutive rising points`;
        } else if (falling >= SPC_RUN) {
          signalSide = "low";
          rule = `${falling} consecutive falling points`;
        }
      }
    }
  }

  let variation: SpcVariation = "neutral";
  if (signalSide) {
    const good = (signalSide === "high") === (series.goodDirection === "up");
    variation = good ? "improvement" : "concern";
  }

  // Assurance: can the process consistently meet the target? Only for a real
  // statutory/standard target (a `reference` baseline is not a pass/fail line).
  let assurance: SpcAssurance = "none";
  if (series.target && series.target.kind !== "reference") {
    const t = series.target.value;
    if (series.goodDirection === "up") {
      // Target is a floor: the whole process must sit above it to "consistently meet".
      assurance = lcl >= t ? "pass" : ucl <= t ? "fail" : "inconsistent";
    } else {
      // Target is a ceiling: the whole process must sit below it.
      assurance = ucl <= t ? "pass" : lcl >= t ? "fail" : "inconsistent";
    }
  }

  return { mean, ucl, lcl, mrBar, n, variation, assurance, signalSide, rule };
}

/** Glyph + label for an SPC variation verdict (redundant, colour-independent). */
export function spcVariationLabel(v: SpcVariation): {
  glyph: string;
  short: string;
  label: string;
} {
  switch (v) {
    case "improvement":
      return {
        glyph: "✦",
        short: "Improving (signal)",
        label: "special-cause variation — a signal in the improving direction",
      };
    case "concern":
      return {
        glyph: "▲",
        short: "Concern (signal)",
        label: "special-cause variation — a signal in the concerning direction",
      };
    default:
      return {
        glyph: "~",
        short: "Common cause",
        label: "common-cause variation — no signal; change is within natural limits",
      };
  }
}

/** Glyph + label for an SPC assurance (capability-vs-target) verdict, or null. */
export function spcAssuranceLabel(a: SpcAssurance): {
  glyph: string;
  short: string;
  label: string;
} | null {
  switch (a) {
    case "pass":
      return {
        glyph: "✓",
        short: "Consistently meets",
        label:
          "the whole process sits on the meeting-target side of the control limits — consistently meets the target",
      };
    case "fail":
      return {
        glyph: "✗",
        short: "Consistently misses",
        label:
          "the whole process sits on the failing side of the control limits — consistently misses the target",
      };
    case "inconsistent":
      return {
        glyph: "?",
        short: "Inconsistent vs target",
        label:
          "the target lies inside the control limits — the process sometimes meets and sometimes misses it",
      };
    default:
      return null;
  }
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
  /** XmR signal-vs-noise verdict (null = too few points for control limits). */
  spc: SpcVerdict | null;
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
        spc: spcVerdict(s),
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

    const raw: { series: TrendSeries; role: IndicatorRole }[] = [];
    const seen = new Set<string>();
    for (const [role, list] of roleLists) {
      for (const series of list) {
        if (seen.has(series.id)) continue;
        seen.add(series.id);
        raw.push({ series, role });
      }
    }

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
      spc: spcVerdict(r.series),
      current: latest(r.series).value,
      real: seriesIsReal(r.series),
    }));

    return { dept, cells };
  });
}
