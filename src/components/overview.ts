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

export interface IndicatorCell {
  series: TrendSeries;
  dept: Department;
  role: IndicatorRole;
  weight: number; // within-department size weight
  value: number; // treemap leaf value (share of departmental spend)
  score: number; // 0 (poor) .. 1 (good)
  targeted: boolean; // RAG anchored to a published target (vs own-range fallback)
  current: number; // latest value
  real: boolean; // backed by an official source (derived-series aware)
}

export interface DeptBlock {
  dept: Department;
  cells: IndicatorCell[];
}

// Hero indicators read biggest, then core measures, then supporting context —
// gives the varied, Finviz-like mosaic within each department block.
const ROLE_WEIGHT: Record<IndicatorRole, number> = {
  hero: 3,
  core: 2,
  supporting: 1,
};

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
): { letter: string; label: string } {
  if (!benchmarked) return { letter: "–", label: "no external benchmark" };
  const s = Math.max(0, Math.min(1, score));
  if (s >= 0.66) return { letter: "G", label: "green" };
  if (s >= 0.33) return { letter: "A", label: "amber" };
  return { letter: "R", label: "red" };
}

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
      out.push({ series: s, score: ragScore(s), targeted: !!s.target });
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

    const raw: { series: TrendSeries; role: IndicatorRole; weight: number }[] = [];
    const seen = new Set<string>();
    for (const [role, list] of roleLists) {
      for (const series of list) {
        if (seen.has(series.id)) continue;
        seen.add(series.id);
        raw.push({ series, role, weight: ROLE_WEIGHT[role] });
      }
    }

    const totalWeight = raw.reduce((sum, r) => sum + r.weight, 0);
    const cells: IndicatorCell[] = raw.map((r) => ({
      series: r.series,
      dept,
      role: r.role,
      weight: r.weight,
      value: (dept.spendBn * r.weight) / totalWeight,
      score: ragScore(r.series),
      targeted: !!r.series.target,
      current: latest(r.series).value,
      real: seriesIsReal(r.series),
    }));

    return { dept, cells };
  });
}
