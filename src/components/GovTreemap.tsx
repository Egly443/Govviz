import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { buildOverview, ragColor, type IndicatorCell } from "./overview";
import { SHOW_ILLUSTRATIVE } from "./data";

const LABEL_H = 22; // reserved band for each department's label
const GAP = 2; // gap between tiles

interface LayoutLeaf {
  cell: IndicatorCell;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface LayoutGroup {
  code: string;
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  leaves: LayoutLeaf[];
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width);
      const height =
        width < 640
          ? Math.round(Math.max(width * 1.3, 560))
          : Math.round(Math.min(Math.max(width * 0.58, 480), 720));
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ...size };
}

export function GovTreemap({
  onSelect,
}: {
  onSelect: (cell: IndicatorCell) => void;
}) {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const blocks = useMemo(() => buildOverview(), []);

  const groups = useMemo<LayoutGroup[]>(() => {
    if (width === 0 || height === 0) return [];

    const rootData = {
      name: "gov",
      children: blocks.map((b) => ({
        name: b.dept.code,
        label: `${b.dept.name} · £${b.dept.spendBn}bn`,
        children: b.cells.map((c) => ({
          name: c.series.id,
          cell: c,
          value: c.value,
        })),
      })),
    };

    const root = hierarchy<any>(rootData)
      .sum((d: any) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    treemap<any>()
      .tile(treemapSquarify.ratio(1))
      .size([width, height])
      .paddingOuter(0)
      .paddingTop(LABEL_H)
      .paddingInner(GAP)(root);

    return (root.children ?? []).map((g: any) => ({
      code: g.data.name,
      label: g.data.label,
      x0: g.x0,
      y0: g.y0,
      x1: g.x1,
      y1: g.y1,
      leaves: (g.children ?? []).map((l: any) => ({
        cell: l.data.cell as IndicatorCell,
        x0: l.x0,
        y0: l.y0,
        x1: l.x1,
        y1: l.y1,
      })),
    }));
  }, [blocks, width, height]);

  return (
    <div ref={ref} className="relative w-full" style={{ height: height || 560 }}>
      {groups.map((g) => (
        <div key={g.code}>
          <div
            className="pointer-events-none absolute z-10 truncate text-[11px] font-semibold uppercase tracking-wider text-foreground/90"
            style={{
              left: g.x0 + 4,
              top: g.y0 + 4,
              width: Math.max(0, g.x1 - g.x0 - 8),
            }}
          >
            {g.label}
          </div>
          {g.leaves.map((l) => {
            const w = l.x1 - l.x0;
            const h = l.y1 - l.y0;
            const { cell } = l;
            const showText = w > 46 && h > 30;
            const showValue = h > 56 && w > 64;
            const fs = Math.max(10, Math.min(15, w / 9));
            // In production, an unsourced indicator is greyed and shows no
            // (fabricated) value — its RAG colour would be meaningless.
            const sourced = cell.real || SHOW_ILLUSTRATIVE;
            return (
              <button
                key={cell.series.id}
                onClick={() => onSelect(cell)}
                title={
                  sourced
                    ? `${cell.series.title} — ${cell.series.format(cell.current)}`
                    : `${cell.series.title} — no official source wired yet`
                }
                className="absolute overflow-hidden rounded-[3px] text-left transition hover:z-20 hover:brightness-110 focus:z-20 focus:outline-none focus:ring-2 focus:ring-white/70"
                style={{
                  left: l.x0,
                  top: l.y0,
                  width: w,
                  height: h,
                  background: sourced ? ragColor(cell.score) : "var(--surface)",
                  opacity: sourced ? 1 : 0.5,
                }}
              >
                {showText && (
                  <span className="flex h-full w-full flex-col justify-between gap-1 p-1.5">
                    <span
                      className="line-clamp-3 font-medium leading-tight text-white/95"
                      style={{ fontSize: fs }}
                    >
                      {cell.series.title}
                    </span>
                    {showValue && (
                      <span
                        className="font-semibold tabular-nums text-white"
                        style={{ fontSize: fs + 1 }}
                      >
                        {sourced ? cell.series.format(cell.current) : "—"}
                      </span>
                    )}
                  </span>
                )}
                {cell.series.target && cell.series.target.kind !== "reference" && (
                  <span
                    className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/70"
                    title="Has an official target"
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
