import type { Citation, ScatterViz } from "@chatctg/contracts";
import { CartesianGrid, Legend, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { OnPick } from "./index";
import { AXIS, colorFor, GRID } from "./palette";
import { fmt, Frame } from "./common";
import type { Size } from "./common";

type Pt = { citations: Citation[]; t: number; [k: string]: unknown };
/** Recharts 3 passes the point geometry with the original data point on `payload`. */
const pointOf = (d: unknown): Pt => ((d as { payload?: Pt }).payload ?? d) as Pt;
/** 1, 10, 100, 1k, 10k, 1M: enrollment spans six orders of magnitude, so ticks are short. */
export const compact = (v: number): string => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(v));
/** Powers of ten from 1 up to the largest value: the ticks of a log axis whose domain ends at that value. */
const decades = (max: number): number[] => { const out = [1]; while (out[out.length - 1]! * 10 <= max) out.push(out[out.length - 1]! * 10); return out; };

export function ScatterView({ viz, onPick, width, height }: { viz: ScatterViz; onPick: OnPick } & Size) {
  const groups = viz.encoding.color?.values ?? ["All"];
  const field = viz.encoding.color?.field ?? null;
  const y = viz.encoding.y.field;
  // A log axis cannot place an enrollment of 0, so those points are left out.
  const points = viz.data.filter((r) => Number(r[y]) >= 1).map((r): Pt => ({ ...r, t: new Date(String(r.start_date)).getTime() }));
  const ticks = decades(Math.max(1, ...points.map((p) => Number(p[y]))));
  const tick = { fill: AXIS, fontSize: 12 };
  return (
    <Frame width={width} height={height} defaultHeight={420}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="t" type="number" domain={["auto", "auto"]} tickFormatter={(t: number) => String(new Date(t).getFullYear())} tick={tick} axisLine={false} tickLine={false} name={viz.encoding.x.label} />
        <YAxis dataKey={y} type="number" scale="log" domain={[1, "auto"]} ticks={ticks} tick={tick} axisLine={false} tickLine={false} tickFormatter={compact} width={72} name={viz.encoding.y.label} />
        <ZAxis range={[36, 36]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => { const p = payload?.[0]?.payload as Record<string, unknown> | undefined; return p ? <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, maxWidth: 320 }}><div className="num">{String(p.nct_id)}</div><div>{String(p.title)}</div><div style={{ color: "var(--muted)" }}>{String(p.start_date)}, {fmt(p[y])} participants{field ? `, ${String(p[field])}` : ""}</div></div> : null; }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {groups.map((g, i) => <Scatter key={g} name={g} data={field ? points.filter((p) => p[field] === g) : points} fill={colorFor(i)} fillOpacity={0.75} onClick={(d) => { const p = pointOf(d); onPick(p.citations, String(p.nct_id)); }} cursor="pointer" isAnimationActive={false} />)}
      </ScatterChart>
    </Frame>
  );
}
