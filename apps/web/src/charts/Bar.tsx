import type { BarViz, GroupedBarViz, StackedBarViz } from "@chatctg/contracts";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import type { OnPick } from "./index";
import { AXIS, colorFor, GRID } from "./palette";
import { fmt, Frame, pickLabel, reducedMotion, Tip } from "./common";
import type { Size } from "./common";

export type AnyBar = BarViz | GroupedBarViz | StackedBarViz;

/** Rows are long (one per x × series); Recharts wants wide (one per x with a key per series). */
export function widen(viz: AnyBar) {
  const x = viz.encoding.x.field, y = viz.encoding.y.field;
  const series = "series" in viz.encoding ? viz.encoding.series.values : null;
  const seen = [...new Set(viz.data.map((r) => String(r[x])))];
  const order = viz.encoding.sort === "value_desc" ? seen : viz.encoding.x.order ?? seen;
  return order.map((cat) => {
    const rows = viz.data.filter((r) => String(r[x]) === cat);
    const wide: Record<string, unknown> = { [x]: cat };
    if (series) for (const s of series) wide[s] = rows.find((r) => r.series === s)?.[y] ?? 0;
    else wide[y] = rows[0]?.[y] ?? 0;
    return wide;
  });
}

/** Recharts 3 hands the click handler the bar's geometry; the wide row sits on `payload`. */
const catOf = (d: unknown, x: string): string => {
  const o = d as { payload?: Record<string, unknown> } & Record<string, unknown>;
  return String(o.payload?.[x] ?? o[x]);
};

type Props = { viz: AnyBar; onPick: OnPick; gap?: string; radius?: number } & Size;

export function BarView({ viz, onPick, gap, radius, width, height }: Props) {
  const x = viz.encoding.x.field, y = viz.encoding.y.field;
  const series = "series" in viz.encoding ? viz.encoding.series.values : null;
  const horizontal = viz.encoding.orientation === "horizontal";
  const stacked = viz.type === "stacked_bar";
  const data = widen(viz);
  const pick = (cat: string, s: string | null) => {
    const rows = viz.data.filter((r) => String(r[x]) === cat && (s === null || r.series === s));
    onPick(rows.flatMap((r) => r.citations), pickLabel(cat, s));
  };
  const defaultHeight = horizontal ? Math.max(320, 28 * data.length + 60) : 380;
  const r = radius ?? (stacked ? 0 : 3);
  const animate = !reducedMotion();
  const tick = { fill: AXIS, fontSize: 12 };
  const tilt = !horizontal && data.length > 8;
  return (
    <Frame width={width} height={height} defaultHeight={defaultHeight}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, bottom: 8, left: horizontal ? 8 : 0 }} barCategoryGap={gap ?? (series ? "20%" : "28%")}>
        <CartesianGrid stroke={GRID} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? <XAxis type="number" tick={tick} axisLine={false} tickLine={false} tickFormatter={fmt} /> : <XAxis dataKey={x} tick={tick} axisLine={false} tickLine={false} interval={0} angle={tilt ? -30 : 0} textAnchor={tilt ? "end" : "middle"} height={tilt ? 70 : 30} />}
        {horizontal ? <YAxis dataKey={x} type="category" width={160} tick={tick} axisLine={false} tickLine={false} /> : <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={fmt} width={56} />}
        <Tooltip content={<Tip unit={viz.encoding.y.unit} />} cursor={{ fill: "rgba(31, 79, 255, 0.06)" }} />
        {series && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series
          ? series.map((s, i) => <Bar key={s} dataKey={s} name={s} stackId={stacked ? "a" : undefined} fill={colorFor(i)} stroke={stacked ? "var(--bg)" : undefined} strokeWidth={stacked ? 1 : 0} radius={r} isAnimationActive={animate} onClick={(d) => pick(catOf(d, x), s)} cursor="pointer" />)
          : <Bar dataKey={y} name={viz.encoding.y.label} fill={colorFor(0)} radius={r} isAnimationActive={animate} onClick={(d) => pick(catOf(d, x), null)} cursor="pointer" />}
      </BarChart>
    </Frame>
  );
}
