import type { LineViz } from "@chatctg/contracts";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { OnPick } from "./index";
import { AXIS, colorFor, GRID } from "./palette";
import { fmt, Frame, Tip } from "./common";
import type { Size } from "./common";

export function LineView({ viz, onPick, width, height }: { viz: LineViz; onPick: OnPick } & Size) {
  const x = viz.encoding.x.field, y = viz.encoding.y.field;
  const series = viz.encoding.series?.values ?? null;
  const periods = [...new Set(viz.data.map((r) => String(r[x])))];
  const data = periods.map((p) => {
    const rows = viz.data.filter((r) => String(r[x]) === p);
    const wide: Record<string, unknown> = { [x]: p };
    if (series) for (const s of series) wide[s] = rows.find((r) => r.series === s)?.[y] ?? 0; else wide[y] = rows[0]?.[y] ?? 0;
    return wide;
  });
  const pick = (p: string, s: string | null) => onPick(viz.data.filter((r) => String(r[x]) === p && (s === null || r.series === s)).flatMap((r) => r.citations), s ? `${p} · ${s}` : p);
  const dot = (s: string | null, color: string) => (props: { cx?: number; cy?: number; payload?: Record<string, unknown>; key?: unknown }) => (
    <circle key={String(props.key)} cx={props.cx} cy={props.cy} r={3.5} fill="var(--bg)" stroke={color} strokeWidth={2} style={{ cursor: "pointer" }} onClick={() => pick(String(props.payload?.[x]), s)} />
  );
  const tick = { fill: AXIS, fontSize: 12 };
  return (
    <Frame width={width} height={height} defaultHeight={380}>
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={x} tick={tick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={fmt} width={56} />
        <Tooltip content={<Tip unit={viz.encoding.y.unit} />} />
        {series && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series
          ? series.map((s, i) => <Line key={s} type="monotone" dataKey={s} name={s} stroke={colorFor(i)} strokeWidth={2} dot={dot(s, colorFor(i))} activeDot={{ r: 5 }} isAnimationActive={false} />)
          : <Line type="monotone" dataKey={y} name={viz.encoding.y.label} stroke={colorFor(0)} strokeWidth={2.5} dot={dot(null, colorFor(0))} activeDot={{ r: 5 }} isAnimationActive={false} />}
      </LineChart>
    </Frame>
  );
}
