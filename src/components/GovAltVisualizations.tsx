import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildOverview,
  ragColor,
  ragTextColor,
  ragUncertainColor,
  UNCERTAIN_TEXT,
  type IndicatorCell,
} from "./overview";
import { SHOW_ILLUSTRATIVE } from "./data";

type VizProps = {
  onSelect: (cell: IndicatorCell) => void;
};

type Sized = { width: number; height: number };

function useVizSize(minHeight = 560) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Sized>({ width: 0, height: minHeight });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width);
      const height =
        width < 700
          ? Math.round(Math.max(minHeight, width * 1.18))
          : Math.round(Math.min(Math.max(width * 0.55, minHeight), 760));
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [minHeight]);

  return { ref, ...size };
}

function usable(cell: IndicatorCell) {
  return cell.real || SHOW_ILLUSTRATIVE;
}

function fillFor(cell: IndicatorCell) {
  if (!usable(cell)) return "var(--surface)";
  return cell.uncertain ? ragUncertainColor() : ragColor(cell.score, cell.targeted);
}

function textFor(cell: IndicatorCell) {
  if (!usable(cell)) return "var(--muted-foreground)";
  return cell.uncertain ? UNCERTAIN_TEXT : ragTextColor(cell.score, cell.targeted);
}

function labelFor(cell: IndicatorCell) {
  const sourced = usable(cell);
  const mom = cell.momentum;
  return sourced
    ? `${cell.dept.name}: ${cell.series.title} — ${cell.series.format(cell.current)}${
        mom.dir !== "flat" ? ` · ${mom.label}` : ""
      }`
    : `${cell.dept.name}: ${cell.series.title} — no official source wired yet`;
}

function allCells() {
  return buildOverview().flatMap((block) => block.cells);
}

const shortDept = (name: string) =>
  name
    .replace(/^Department for /, "")
    .replace(/^Department of /, "")
    .replace(/ and /g, " & ");

const lensHue = (i: number, n: number) => Math.round((i / Math.max(n - 1, 1)) * 240 + 170) % 360;

export function GovConstellation({ onSelect }: VizProps) {
  const { ref, width, height } = useVizSize(580);
  const blocks = useMemo(() => buildOverview(), []);
  const maxSpend = Math.max(...blocks.map((b) => b.dept.spendBn));

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(120, Math.min(width, height) * 0.36);

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${width || 1} ${height || 1}`}
        role="img"
        aria-label="Cabinet constellation showing departments as hubs and indicators as orbiting nodes"
      >
        <defs>
          <radialGradient id="constellation-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={Math.min(width, height) * 0.24} fill="url(#constellation-core)" />
        <circle cx={cx} cy={cy} r={radius * 0.72} fill="none" stroke="var(--border)" strokeDasharray="3 8" />
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--border)" strokeDasharray="2 10" />
        {blocks.map((block, i) => {
          const a = -Math.PI / 2 + (i / blocks.length) * Math.PI * 2;
          const hubR = 7 + 14 * Math.sqrt(block.dept.spendBn / maxSpend);
          const hx = cx + Math.cos(a) * radius;
          const hy = cy + Math.sin(a) * radius;
          const orbitR = 30 + 18 * Math.sqrt(block.cells.length);
          return (
            <g key={block.dept.code}>
              <line x1={cx} y1={cy} x2={hx} y2={hy} stroke="var(--border)" strokeOpacity="0.65" />
              <circle cx={hx} cy={hy} r={orbitR} fill="none" stroke="var(--border)" strokeOpacity="0.55" />
              <circle cx={hx} cy={hy} r={hubR} fill="var(--surface-elevated)" stroke="var(--primary)" strokeOpacity="0.75" />
              <text
                x={hx}
                y={hy + orbitR + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] font-medium"
              >
                {block.dept.name}
              </text>
              {block.cells.map((cell, j) => {
                const na = a + (j / block.cells.length) * Math.PI * 2;
                const nr = orbitR + (cell.role === "hero" ? 10 : 0);
                const x = hx + Math.cos(na) * nr;
                const y = hy + Math.sin(na) * nr;
                const r = cell.role === "hero" ? 8 : 6;
                return (
                  <g
                    key={cell.series.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(cell)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelect(cell);
                    }}
                    className="cursor-pointer outline-none transition hover:brightness-125"
                  >
                    <title>{labelFor(cell)}</title>
                    <line x1={hx} y1={hy} x2={x} y2={y} stroke="var(--border)" strokeOpacity="0.4" />
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={fillFor(cell)}
                      stroke={cell.role === "hero" ? "var(--foreground)" : "var(--background)"}
                      strokeWidth={cell.role === "hero" ? 1.6 : 1}
                      opacity={usable(cell) ? 1 : 0.45}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground text-sm font-semibold">
          Government
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          spend gravity + indicator orbit
        </text>
      </svg>
    </div>
  );
}

export function GovHorizon({ onSelect }: VizProps) {
  const { ref, width, height } = useVizSize(560);
  const cells = useMemo(() => allCells(), []);
  const maxSpend = Math.max(...cells.map((c) => c.dept.spendBn));
  const pad = width < 720 ? 28 : 44;
  const left = width < 720 ? 90 : 150;
  const right = pad;
  const top = 42;
  const bottom = 58;
  const plotW = Math.max(1, width - left - right);
  const plotH = Math.max(1, height - top - bottom);
  const rows = useMemo(() => {
    const unique = [...new Map(cells.map((c) => [c.dept.code, c.dept])).values()];
    return unique.map((dept, i) => ({
      dept,
      y: top + (unique.length === 1 ? 0.5 : i / (unique.length - 1)) * plotH,
    }));
  }, [cells, plotH, top]);
  const rowByDept = new Map(rows.map((r) => [r.dept.code, r.y]));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width || 1} ${height || 1}`}
        role="img"
        aria-label="Performance horizon plotting indicators from poor to good by department"
      >
        <defs>
          <linearGradient id="horizon-band" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor={ragColor(0.05)} stopOpacity="0.22" />
            <stop offset="50%" stopColor={ragColor(0.5)} stopOpacity="0.16" />
            <stop offset="100%" stopColor={ragColor(0.95)} stopOpacity="0.22" />
          </linearGradient>
        </defs>
        <rect x={left} y={top - 18} width={plotW} height={plotH + 36} rx={8} fill="url(#horizon-band)" />
        {[0, 0.33, 0.66, 1].map((v) => (
          <line
            key={v}
            x1={left + plotW * v}
            x2={left + plotW * v}
            y1={top - 18}
            y2={top + plotH + 18}
            stroke="var(--border)"
            strokeDasharray={v === 0 || v === 1 ? undefined : "4 8"}
          />
        ))}
        <text x={left} y={height - 22} className="fill-muted-foreground text-[11px]">
          pressure
        </text>
        <text x={left + plotW} y={height - 22} textAnchor="end" className="fill-muted-foreground text-[11px]">
          performing
        </text>
        {rows.map((row) => (
          <g key={row.dept.code}>
            <line x1={left} x2={left + plotW} y1={row.y} y2={row.y} stroke="var(--border)" strokeOpacity="0.55" />
            <text
              x={left - 12}
              y={row.y + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[10px] font-medium"
            >
              {width < 720 ? row.dept.code.toUpperCase() : row.dept.name}
            </text>
          </g>
        ))}
        {cells.map((cell, i) => {
          const rowY = rowByDept.get(cell.dept.code) ?? top;
          const sameDept = cells.filter((c) => c.dept.code === cell.dept.code);
          const j = sameDept.findIndex((c) => c.series.id === cell.series.id);
          const offset = (j - (sameDept.length - 1) / 2) * 9;
          const x = left + plotW * Math.max(0.02, Math.min(0.98, cell.score));
          const y = rowY + offset;
          const r = 5 + 7 * Math.sqrt(cell.dept.spendBn / maxSpend) + (cell.role === "hero" ? 3 : 0);
          return (
            <g
              key={cell.series.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(cell)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(cell);
              }}
              className="cursor-pointer outline-none"
            >
              <title>{labelFor(cell)}</title>
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={fillFor(cell)}
                stroke={cell.role === "hero" ? "var(--foreground)" : "var(--background)"}
                strokeWidth={cell.role === "hero" ? 1.5 : 1}
                opacity={usable(cell) ? 0.94 : 0.38}
              />
              {cell.momentum.dir !== "flat" && (
                <text
                  x={x}
                  y={y + 3}
                  textAnchor="middle"
                  className="pointer-events-none text-[9px] font-bold"
                  fill={textFor(cell)}
                >
                  {cell.momentum.glyph}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GovPulseField({ onSelect }: VizProps) {
  const { ref, width, height } = useVizSize(600);
  const blocks = useMemo(() => buildOverview(), []);
  const cells = useMemo(() => blocks.flatMap((block) => block.cells), [blocks]);
  const maxSpend = Math.max(...blocks.map((b) => b.dept.spendBn));
  const padX = width < 720 ? 30 : 58;
  const padY = width < 720 ? 76 : 86;
  const floorY = height - padY;
  const fieldW = Math.max(1, width - padX * 2);
  const fieldH = Math.max(1, height - padY * 1.55);
  const cx = width / 2;
  const vanishingY = padY * 0.72;

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_20%,color-mix(in_oklab,var(--primary)_24%,transparent),transparent_34%),linear-gradient(180deg,color-mix(in_oklab,var(--surface-elevated)_88%,transparent),var(--background))]"
      style={{ height }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width || 1} ${height || 1}`}
        role="img"
        aria-label="Kinetic pulse field showing government indicators in a three-dimensional performance space"
      >
        <defs>
          <linearGradient id="pulse-floor" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="72%" stopColor="var(--surface)" stopOpacity="0.04" />
          </linearGradient>
          <radialGradient id="pulse-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.78" />
            <stop offset="42%" stopColor="var(--primary)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
          <filter id="pulse-soft-shadow" x="-40%" y="-70%" width="180%" height="220%">
            <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#000000" floodOpacity="0.38" />
          </filter>
        </defs>

        <rect width={width || 1} height={height || 1} fill="transparent" />
        <ellipse
          cx={cx}
          cy={floorY + 6}
          rx={fieldW * 0.5}
          ry={Math.max(48, fieldH * 0.16)}
          fill="url(#pulse-floor)"
        />
        {[0.18, 0.36, 0.55, 0.74, 0.9].map((depth, i) => {
          const y = vanishingY + fieldH * depth;
          const rx = fieldW * (0.12 + depth * 0.43);
          return (
            <ellipse
              key={depth}
              cx={cx}
              cy={y}
              rx={rx}
              ry={Math.max(18, rx * 0.13)}
              fill="none"
              stroke="var(--border)"
              strokeOpacity={0.32 - i * 0.035}
              strokeDasharray="3 10"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`0 ${cx} ${y}`}
                to={`360 ${cx} ${y}`}
                dur={`${28 + i * 5}s`}
                repeatCount="indefinite"
              />
            </ellipse>
          );
        })}

        {blocks.map((block, i) => {
          const depth = blocks.length === 1 ? 0.5 : i / (blocks.length - 1);
          const y = vanishingY + fieldH * (0.18 + depth * 0.74);
          const laneW = fieldW * (0.22 + depth * 0.78);
          const spendLift = 38 + 74 * Math.sqrt(block.dept.spendBn / maxSpend);
          const hue = lensHue(i, blocks.length);
          const xBase = cx - laneW / 2;
          const cellsInBlock = block.cells;

          return (
            <g key={block.dept.code} filter="url(#pulse-soft-shadow)">
              <line
                x1={cx}
                y1={vanishingY}
                x2={xBase + laneW}
                y2={y}
                stroke={`hsl(${hue} 78% 58%)`}
                strokeOpacity="0.16"
              />
              <text
                x={xBase + laneW + 10}
                y={y + 4}
                className="fill-muted-foreground text-[10px] font-medium"
              >
                {width < 720 ? block.dept.code.toUpperCase() : shortDept(block.dept.name)}
              </text>
              {cellsInBlock.map((cell, j) => {
                const slot = cellsInBlock.length === 1 ? 0.5 : j / (cellsInBlock.length - 1);
                const wave = Math.sin((i * 1.7 + j * 2.3) * 1.2);
                const x = xBase + laneW * slot;
                const z = Math.max(0.08, Math.min(0.98, cell.score));
                const yTop = y - spendLift * (0.28 + z * 0.92) - wave * 10;
                const r = (cell.role === "hero" ? 10 : 7) + depth * 5 + z * 3;
                const opacity = usable(cell) ? 0.96 : 0.28;
                const delay = -1 * ((i * 0.41 + j * 0.29) % 2.8);
                const color = fillFor(cell);
                return (
                  <g
                    key={cell.series.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(cell)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelect(cell);
                    }}
                    className="cursor-pointer outline-none"
                    opacity={opacity}
                  >
                    <title>{labelFor(cell)}</title>
                    <line
                      x1={x}
                      y1={y}
                      x2={x}
                      y2={yTop}
                      stroke={color}
                      strokeWidth={cell.role === "hero" ? 2.4 : 1.5}
                      strokeOpacity="0.56"
                    />
                    <ellipse cx={x} cy={y + 5} rx={r * 1.25} ry={r * 0.38} fill={color} opacity="0.16" />
                    <circle cx={x} cy={yTop} r={r * 2.7} fill="url(#pulse-glow)" opacity="0.25">
                      <animate
                        attributeName="r"
                        values={`${r * 1.4};${r * 3.4};${r * 1.4}`}
                        dur={`${2.6 + (i % 4) * 0.45}s`}
                        begin={`${delay}s`}
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.08;0.38;0.08"
                        dur={`${2.6 + (i % 4) * 0.45}s`}
                        begin={`${delay}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle
                      cx={x}
                      cy={yTop}
                      r={r}
                      fill={color}
                      stroke={cell.role === "hero" ? "var(--foreground)" : "color-mix(in oklab, white 78%, transparent)"}
                      strokeWidth={cell.role === "hero" ? 1.8 : 1}
                    >
                      <animateTransform
                        attributeName="transform"
                        type="translate"
                        values={`0 0; 0 ${cell.momentum.good ? -8 : 6}; 0 0`}
                        dur={`${3.4 + (j % 3) * 0.45}s`}
                        begin={`${delay}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                    {cell.momentum.dir !== "flat" && (
                      <text
                        x={x}
                        y={yTop + 3}
                        textAnchor="middle"
                        className="pointer-events-none text-[9px] font-bold"
                        fill={textFor(cell)}
                      >
                        {cell.momentum.glyph}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        <text x={cx} y={32} textAnchor="middle" className="fill-foreground text-sm font-semibold">
          performance pulse field
        </text>
        <text x={cx} y={51} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          height = score, depth = department, glow = movement
        </text>
      </svg>
    </div>
  );
}
