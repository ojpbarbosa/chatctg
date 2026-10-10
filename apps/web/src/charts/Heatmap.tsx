import type { HeatmapViz } from "@chatctg/contracts";
import type { OnPick } from "./index";
import { countLabel, fmt, pickLabel } from "./common";
import { cellKey, cellsOf, GridAxes, gridLayout, textWidth, VIEW_W } from "./grid";
import { inkOn, sequential } from "./palette";

/** The fill of an empty cell: a neutral one step off the surface, so "no trials" never reads as the light end of the ramp. */
export const ZERO = "#f1f3f6";
const shade = (v: number, max: number) => (v > 0 ? sequential(0.12 + (0.88 * v) / max) : ZERO);
const orderOf = (order: string[] | undefined, rows: HeatmapViz["data"], field: string) => order ?? [...new Set(rows.map((r) => String(r[field])))];

/** A grid of two attributes with every cell shaded by its value on the sequential blue ramp, a 2 px surface gap between cells, and a scale legend. */
export function HeatmapView({ viz, onPick }: { viz: HeatmapViz; onPick: OnPick }) {
  const { x, y, color } = viz.encoding;
  const xs = orderOf(x.order, viz.data, x.field), ys = orderOf(y.order, viz.data, y.field);
  const g = gridLayout(xs, ys);
  const cells = cellsOf(viz.data, x.field, y.field);
  const top = Math.max(0, ...viz.data.map((r) => Number(r[color.field]) || 0));
  const max = Math.max(1, top);
  const bw = g.x.bandwidth(), bh = g.y.bandwidth();
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${VIEW_W} ${g.height}`} width="100%" role="img" aria-label={viz.title} style={{ display: "block" }}>
        {ys.flatMap((ly) => xs.map((lx) => {
          const row = cells.get(cellKey(lx, ly));
          const v = Number(row?.[color.field]) || 0;
          const fill = shade(v, max); const label = fmt(v);
          const pick = row && v > 0 ? () => onPick(row.citations, pickLabel(lx, ly)) : undefined;
          return (
            <g key={cellKey(lx, ly)} className="cell" onClick={pick} style={{ cursor: pick ? "pointer" : "default" }}>
              <title>{countLabel(`${lx}, ${ly}`, v, color.unit)}</title>
              <rect className="heat" x={(g.x(lx) ?? 0) + 1} y={(g.y(ly) ?? 0) + 1} width={bw - 2} height={bh - 2} rx={3} fill={fill} />
              {v > 0 && textWidth(label, 11) <= bw - 8 && <text x={(g.x(lx) ?? 0) + bw / 2} y={(g.y(ly) ?? 0) + bh / 2} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill={inkOn(fill)} pointerEvents="none">{label}</text>}
            </g>
          );
        }))}
        <GridAxes g={g} xs={xs} ys={ys} xLabel={x.label} yLabel={y.label} />
      </svg>
      <div className="foot legend" style={{ borderTop: 0, paddingTop: 4, alignItems: "center", gap: 8 }}>
        <span>{color.label}</span>
        <span aria-hidden style={{ width: 12, height: 12, borderRadius: 2, background: ZERO }} />
        <span className="num">0</span>
        <span aria-hidden style={{ width: 160, height: 10, borderRadius: 2, background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => sequential(0.12 + 0.88 * t)).join(", ")})` }} />
        <span className="num">{fmt(top)}</span>
      </div>
    </div>
  );
}
