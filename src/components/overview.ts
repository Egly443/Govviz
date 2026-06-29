import {
  latest,
  minMax,
  seriesIsReal,
  SHOW_ILLUSTRATIVE,
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

export function ragColor(score: number, benchmarked = true): string {
  const s = Math.max(0, Math.min(1, score));
  const hue =
    s < 0.5 ? 8 + (46 - 8) * (s / 0.5) : 46 + (142 - 46) * ((s - 0.5) / 0.5);
  const sat = benchmarked ? 58 : 18;
  const light =
    s < 0.5 ? 40 + 6 * (s / 0.5) : 46 - 5 * ((s - 0.5) / 0.5);
  return `hsl(${hue.toFixed(0)} ${sat}% ${light.toFixed(0)}%)`;
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
