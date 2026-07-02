import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  buildOverview,
  ragColor,
  ragTextColor,
  ragUncertainColor,
  UNCERTAIN_TEXT,
  type DeptBlock,
  type IndicatorCell,
} from "./overview";
import { SHOW_ILLUSTRATIVE } from "./data";

type VizProps = {
  onSelect: (cell: IndicatorCell) => void;
};

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
    ? `${cell.dept.name}: ${cell.series.title} - ${cell.series.format(cell.current)}${
        mom.dir !== "flat" ? ` - ${mom.label}` : ""
      }`
    : `${cell.dept.name}: ${cell.series.title} - no official source wired yet`;
}

const shortDept = (name: string) =>
  name
    .replace(/^Department for /, "")
    .replace(/^Department of /, "")
    .replace(/ and /g, " & ");

function scoreLabel(cell: IndicatorCell) {
  if (!usable(cell)) return "No source";
  if (cell.uncertain) return "Uncertain";
  if (!cell.targeted) return "Indicative";
  if (cell.score >= 0.66) return "Green";
  if (cell.score >= 0.33) return "Amber";
  return "Red";
}

function sparkPath(cell: IndicatorCell, width = 170, height = 42) {
  const points = cell.series.points.slice(-10);
  if (points.length < 2) return "";
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.value - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function blockHealth(block: DeptBlock) {
  const cells = block.cells.filter(usable);
  if (!cells.length) return 0.5;
  return cells.reduce((sum, cell) => sum + cell.score, 0) / cells.length;
}

export function GovSpatialCommand({ onSelect }: VizProps) {
  const blocks = useMemo(() => buildOverview(), []);
  const [activeCode, setActiveCode] = useState(blocks[0]?.dept.code ?? "");
  const active = blocks.find((block) => block.dept.code === activeCode) ?? blocks[0];
  const heroCells = useMemo(
    () =>
      blocks
        .flatMap((block) => block.cells.filter((cell) => cell.role === "hero"))
        .slice(0, 14),
    [blocks],
  );

  if (!active) return null;

  const activeCells = active.cells.slice(0, 6);
  const maxSpend = Math.max(...blocks.map((block) => block.dept.spendBn));

  return (
    <div className="relative min-h-[720px] overflow-hidden rounded-lg border border-cyan-200/15 bg-[#081015] text-cyan-50 shadow-[0_32px_90px_-55px_rgba(37,211,238,0.9)] sm:min-h-[760px]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-80"
        style={{
          background:
            "linear-gradient(130deg, rgba(20,184,166,0.18), transparent 28%, rgba(234,179,8,0.08) 56%, transparent 74%), repeating-linear-gradient(90deg, rgba(103,232,249,0.08) 0 1px, transparent 1px 58px), repeating-linear-gradient(0deg, rgba(103,232,249,0.055) 0 1px, transparent 1px 48px)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[linear-gradient(0deg,rgba(2,6,23,0.92),rgba(8,16,21,0))]" />
      <div aria-hidden className="spatial-scan absolute inset-y-0 w-32 bg-cyan-200/8 blur-md" />

      <div className="relative z-10 grid min-h-[720px] gap-5 p-4 sm:min-h-[760px] sm:p-5 lg:grid-cols-[250px_minmax(0,1fr)_300px]">
        <aside className="rounded-lg border border-cyan-200/15 bg-black/20 p-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2 border-b border-cyan-200/10 pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">
                Command
              </p>
              <h3 className="mt-1 text-base font-semibold text-cyan-50">Departments</h3>
            </div>
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.95)]" />
          </div>
          <div className="mt-3 max-h-[590px] space-y-1 overflow-y-auto pr-1">
            {blocks.map((block, i) => {
              const activeDept = block.dept.code === active.dept.code;
              const health = blockHealth(block);
              return (
                <button
                  key={block.dept.code}
                  type="button"
                  onClick={() => setActiveCode(block.dept.code)}
                  className={`group grid w-full grid-cols-[2.35rem_minmax(0,1fr)] items-center gap-2 rounded-md border px-2 py-2 text-left transition ${
                    activeDept
                      ? "border-cyan-200/55 bg-cyan-300/12 text-cyan-50 shadow-[0_0_24px_rgba(103,232,249,0.18)]"
                      : "border-transparent text-cyan-100/62 hover:border-cyan-200/20 hover:bg-cyan-200/7 hover:text-cyan-50"
                  }`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className="relative h-8 w-8 rounded-md border border-cyan-200/15 bg-black/35">
                    <span
                      className="absolute inset-x-1 bottom-1 rounded-sm"
                      style={{
                        height: `${22 + health * 52}%`,
                        background: fillFor(block.cells[0]),
                        opacity: activeDept ? 0.95 : 0.58,
                      }}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{block.dept.name}</span>
                    <span className="mt-0.5 block text-[10px] text-cyan-100/45">
                      {block.cells.length} charts
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          className="relative min-h-[620px] overflow-hidden rounded-lg border border-cyan-200/15 bg-black/25"
          style={{ perspective: "1300px" }}
        >
          <div className="absolute inset-x-10 top-8 h-px bg-cyan-200/25 shadow-[0_0_28px_rgba(103,232,249,0.8)]" />
          <div className="absolute inset-x-16 bottom-14 h-px bg-amber-200/20 shadow-[0_0_24px_rgba(251,191,36,0.45)]" />
          <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10" />

          <div className="spatial-orbit absolute left-1/2 top-[46%] h-[520px] w-[780px] max-w-[118%] -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d]">
            {blocks.map((block, i) => {
              const angle = (i / blocks.length) * Math.PI * 2;
              const depth = 0.55 + 0.45 * Math.sin(angle + 0.8);
              const x = 390 + Math.cos(angle) * 285;
              const y = 260 + Math.sin(angle) * 180;
              const size = 18 + 42 * Math.sqrt(block.dept.spendBn / maxSpend);
              const health = blockHealth(block);
              const activeDept = block.dept.code === active.dept.code;
              return (
                <button
                  key={block.dept.code}
                  type="button"
                  onClick={() => setActiveCode(block.dept.code)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-md border transition duration-300 ${
                    activeDept
                      ? "border-cyan-100 bg-cyan-200/30 shadow-[0_0_50px_rgba(103,232,249,0.75)]"
                      : "border-cyan-200/25 bg-cyan-200/10 shadow-[0_0_22px_rgba(34,211,238,0.2)] hover:border-cyan-100/70 hover:bg-cyan-200/20"
                  }`}
                  style={{
                    left: x,
                    top: y,
                    width: size,
                    height: size,
                    opacity: 0.55 + depth * 0.45,
                    transform: `translate(-50%, -50%) translateZ(${Math.round(depth * 210)}px) rotateZ(18deg) rotateX(-58deg)`,
                    backgroundColor: fillFor(block.cells[0]),
                    animationDelay: `${i * -140}ms`,
                  }}
                  title={block.dept.fullName}
                >
                  <span
                    className="absolute inset-0 rounded-md"
                    style={{
                      boxShadow: `0 0 ${18 + health * 34}px ${fillFor(block.cells[0])}`,
                    }}
                  />
                  <span className="sr-only">{block.dept.name}</span>
                </button>
              );
            })}
          </div>

          <div className="absolute left-6 right-6 top-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-cyan-200/70">
                Spatial overview
              </p>
              <h2 className="mt-2 max-w-[18rem] text-2xl font-semibold tracking-tight text-cyan-50 sm:text-3xl">
                {active.dept.name}
              </h2>
            </div>
            <Link
              to="/$dept"
              params={{ dept: active.dept.code }}
              className="rounded-md border border-amber-200/35 bg-amber-200/10 px-3 py-2 text-xs font-semibold text-amber-100 shadow-[0_0_30px_rgba(251,191,36,0.16)] hover:border-amber-100 hover:bg-amber-200/18"
            >
              Open department
            </Link>
          </div>

          <div className="absolute bottom-5 left-5 right-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeCells.map((cell, i) => {
              const path = sparkPath(cell);
              return (
                <button
                  key={cell.series.id}
                  type="button"
                  onClick={() => onSelect(cell)}
                  className="spatial-projection group relative min-h-[132px] overflow-hidden rounded-lg border border-cyan-200/20 bg-[#071922]/82 p-3 text-left shadow-[0_22px_60px_-35px_rgba(34,211,238,0.85)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-cyan-100/65 hover:bg-[#092331]/92"
                  style={{
                    transform: `translateY(${i % 2 ? 10 : 0}px) rotateX(${i % 2 ? "-4deg" : "3deg"})`,
                    animationDelay: `${i * 130}ms`,
                  }}
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-cyan-200/65 opacity-70" />
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-cyan-50">
                        {cell.series.title}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-cyan-100/55">
                        {cell.series.shortFormat(cell.current)}
                      </span>
                    </span>
                    <span
                      className="rounded-sm px-1.5 py-1 text-[10px] font-semibold"
                      style={{
                        backgroundColor: fillFor(cell),
                        color: textFor(cell),
                      }}
                    >
                      {scoreLabel(cell)}
                    </span>
                  </span>
                  <svg className="mt-4 h-11 w-full overflow-visible" viewBox="0 0 170 42" aria-hidden>
                    <path d="M0 34 H170" stroke="rgba(103,232,249,0.16)" strokeDasharray="4 7" />
                    {path && (
                      <path
                        d={path}
                        fill="none"
                        stroke={fillFor(cell)}
                        strokeLinecap="round"
                        strokeWidth="2.2"
                        className="drop-shadow-[0_0_8px_rgba(103,232,249,0.7)]"
                      />
                    )}
                  </svg>
                  <span className="absolute bottom-2 left-3 text-[10px] text-cyan-100/38">
                    {cell.momentum.dir !== "flat" ? cell.momentum.glyph : "-"} {cell.momentum.label}
                  </span>
                  <span className="sr-only">{labelFor(cell)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="relative rounded-lg border border-cyan-200/15 bg-black/20 p-3 backdrop-blur-md">
          <div className="border-b border-cyan-200/10 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">
              Projections
            </p>
            <h3 className="mt-1 text-base font-semibold text-cyan-50">Lead charts</h3>
          </div>
          <div className="mt-4 space-y-3">
            {heroCells.map((cell, i) => (
              <button
                key={cell.series.id}
                type="button"
                onClick={() => {
                  setActiveCode(cell.dept.code);
                  onSelect(cell);
                }}
                className="group relative grid w-full grid-cols-[2.2rem_minmax(0,1fr)] gap-2 overflow-hidden rounded-md border border-cyan-200/12 bg-cyan-200/6 px-2 py-2.5 text-left transition hover:border-cyan-100/50 hover:bg-cyan-200/12"
              >
                <span
                  className="spatial-pulse h-8 w-8 rounded-md border border-cyan-100/20 shadow-[0_0_18px_rgba(103,232,249,0.2)]"
                  style={{ backgroundColor: fillFor(cell), animationDelay: `${i * 80}ms` }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-cyan-50">
                    {cell.dept.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-cyan-100/50">
                    {cell.series.title}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
