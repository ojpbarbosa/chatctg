import type { BubbleViz } from "@chatctg/contracts";
import { scaleSqrt } from "d3-scale";
import type { OnPick } from "./index";
import { countLabel, fmt, pickLabel, quantity } from "./common";
import { cellKey, cellsOf, GridAxes, gridLayout, textWidth, VIEW_W } from "./grid";
import { BRAND, GRID } from "./palette";

const orderOf = (order: string[] | undefined, rows: BubbleViz["data"], field: string) => order ?? [...new Set(rows.map((r) => String(r[field])))];

/** A grid of two attributes with one circle per non-empty cell, its area proportional to the value; the cell is the hover and click target. */
export function BubbleView({ viz, onPick }: { viz: BubbleViz; onPick: OnPick }) {
  const { x, y, size } = viz.encoding;
  const xs = orderOf(x.order, viz.data, x.field), ys = orderOf(y.order, viz.data, y.field);
  const g = gridLayout(xs, ys);
  const cells = cellsOf(viz.data, x.field, y.field);
  const top = Math.max(0, ...viz.data.map((r) => Number(r[size.field]) || 0));
  const max = Math.max(1, top);
  const radius = scaleSqrt().domain([0, max]).range([0, Math.min(g.x.bandwidth(), g.y.bandwidth()) / 2 - 3]);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${VIEW_W} ${g.height}`} width="100%" role="img" aria-label={viz.title} style={{ display: "block" }}>
        <g stroke={GRID}>
          {xs.map((s) => { const cx = (g.x(s) ?? 0) + g.x.bandwidth() / 2; return <line key={s} x1={cx} x2={cx} y1={g.y.range()[0]} y2={g.y.range()[1]} />; })}
          {ys.map((s) => { const cy = (g.y(s) ?? 0) + g.y.bandwidth() / 2; return <line key={s} x1={g.x.range()[0]} x2={g.x.range()[1]} y1={cy} y2={cy} />; })}
        </g>
        {ys.flatMap((ly) => xs.map((lx) => {
          const row = cells.get(cellKey(lx, ly));
          const v = Number(row?.[size.field]) || 0;
          const r = v > 0 ? Math.max(4, radius(v)) : 0;
          const cx = (g.x(lx) ?? 0) + g.x.bandwidth() / 2, cy = (g.y(ly) ?? 0) + g.y.bandwidth() / 2;
          const label = fmt(v); const fits = r >= 9 && 2 * r - 6 >= textWidth(label, 11);
          const pick = row && v > 0 ? () => onPick(row.citations, pickLabel(lx, ly)) : undefined;
          return (
            <g key={cellKey(lx, ly)} className="cell" onClick={pick} style={{ cursor: pick ? "pointer" : "default" }}>
              <title>{countLabel(`${lx}, ${ly}`, v, size.unit)}</title>
              <rect x={g.x(lx)} y={g.y(ly)} width={g.x.bandwidth()} height={g.y.bandwidth()} fill="transparent" />
              {r > 0 && <circle className="bubble" cx={cx} cy={cy} r={r} fill={BRAND} fillOpacity={0.85} stroke="var(--bg)" strokeWidth={2} />}
              {r > 0 && fits && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill="#fff" pointerEvents="none">{label}</text>}
            </g>
          );
        }))}
        <GridAxes g={g} xs={xs} ys={ys} xLabel={x.label} yLabel={y.label} />
      </svg>
      <div className="foot" style={{ borderTop: 0, paddingTop: 4 }}><span>Circle area shows {size.label.toLowerCase()}; the largest is {quantity(top, size.unit)}.</span></div>
    </div>
  );
}
