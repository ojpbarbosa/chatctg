import { scaleBand, type ScaleBand } from "d3-scale";

/** The viewBox width every SVG chart draws in; the SVG then scales to its container. */
export const VIEW_W = 920;
const MAX_CHARS = 26;

/** A width estimate for a label at a font size, close enough to decide whether it fits without measuring the DOM. */
export const textWidth = (s: string, size: number): number => s.length * size * 0.58;
/** A label cut to `n` characters with an ellipsis; the full label goes in a hover title. */
export const clip = (s: string, n = MAX_CHARS): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface GridLayout { x: ScaleBand<string>; y: ScaleBand<string>; height: number; left: number; top: number; bottom: number; tilt: boolean }

/**
 * Two band scales for a grid of categories: the y labels set the left margin, the cells are as tall as they are wide within 36 to 64 px,
 * and the x labels tilt when the longest would not fit under its column.
 */
export function gridLayout(xs: string[], ys: string[]): GridLayout {
  const longest = (ss: string[]) => Math.max(1, ...ss.map((s) => clip(s).length));
  const left = clamp(textWidth("x".repeat(longest(ys)), 12) + 20, 64, 200);
  const top = 28;
  const x = scaleBand<string>().domain(xs).range([left, VIEW_W - 16]);
  const cell = clamp(x.bandwidth(), 36, 64);
  const y = scaleBand<string>().domain(ys).range([top, top + cell * ys.length]);
  const tilt = textWidth("x".repeat(longest(xs)), 12) > x.bandwidth() - 8;
  const bottom = tilt ? 24 + textWidth("x".repeat(longest(xs)), 12) * 0.6 + 20 : 52;
  return { x, y, height: top + cell * ys.length + bottom, left, top, bottom, tilt };
}

/** The category labels on both axes, cut with a hover title when long, and the two axis titles. Text wears ink tokens, never a data colour. */
export function GridAxes({ g, xs, ys, xLabel, yLabel }: { g: GridLayout; xs: string[]; ys: string[]; xLabel: string; yLabel: string }) {
  const base = g.y.range()[1];
  return (
    <g fontSize={12} fill="var(--muted)">
      <text x={g.left - 10} y={g.top - 12} textAnchor="end" fontSize={11} fill="var(--faint)">{yLabel}</text>
      {ys.map((s) => <text key={s} x={g.left - 10} y={(g.y(s) ?? 0) + g.y.bandwidth() / 2} textAnchor="end" dominantBaseline="middle">{clip(s)}<title>{s}</title></text>)}
      {xs.map((s) => {
        const cx = (g.x(s) ?? 0) + g.x.bandwidth() / 2;
        return g.tilt
          ? <text key={s} transform={`translate(${cx},${base + 14}) rotate(-35)`} textAnchor="end">{clip(s)}<title>{s}</title></text>
          : <text key={s} x={cx} y={base + 20} textAnchor="middle">{clip(s)}<title>{s}</title></text>;
      })}
      <text x={(g.left + VIEW_W - 16) / 2} y={g.height - 8} textAnchor="middle" fontSize={11} fill="var(--faint)">{xLabel}</text>
    </g>
  );
}

/** The value of each cell of a grid, by its x and y labels. */
export function cellsOf<R extends Record<string, unknown>>(rows: R[], xField: string, yField: string): Map<string, R> {
  return new Map(rows.map((r) => [`${String(r[xField])}\u0000${String(r[yField])}`, r]));
}
export const cellKey = (x: string, y: string): string => `${x}\u0000${y}`;
