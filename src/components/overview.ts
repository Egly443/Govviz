import { latest, minMax, type TrendSeries } from "./data";
import { departments, type Department } from "./departments";

export type IndicatorRole = "hero" | "core" | "supporting";

export interface IndicatorCell {
  series: TrendSeries;
  dept: Department;
  role: IndicatorRole;
  weight: number; // within-department size weight
  value: number; // treemap leaf value (share of departmental spend)
  score: number; // 0 (poor) .. 1 (good)
  current: number; // latest value
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

/**
 * RAG score: where the latest value sits within the series' own historical
 * range, oriented so 1 = good and 0 = poor (respecting `goodDirection`).
 */
export function ragScore(series: TrendSeries): number {
  const { min, max } = minMax(series);
  const cur = latest(series).value;
  if (max.value === min.value) return 0.5;
  const pos = (cur - min.value) / (max.value - min.value);
  return series.goodDirection === "up" ? pos : 1 - pos;
}

/**
 * Map 0..1 (poor..good) to a Finviz-style red → amber → green heat colour.
 * Piecewise hue so the midpoint reads amber rather than chartreuse.
 */
export function ragColor(score: number): string {
  const s = Math.max(0, Math.min(1, score));
  const hue =
    s < 0.5 ? 8 + (46 - 8) * (s / 0.5) : 46 + (142 - 46) * ((s - 0.5) / 0.5);
  const light =
    s < 0.5 ? 40 + 6 * (s / 0.5) : 46 - 5 * ((s - 0.5) / 0.5);
  return `hsl(${hue.toFixed(0)} 58% ${light.toFixed(0)}%)`;
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
      current: latest(r.series).value,
    }));

    return { dept, cells };
  });
}
