import type { TimelineViz } from "@chatctg/contracts";
import { scaleUtc } from "d3-scale";
import type { OnPick } from "./index";
import { clip, textWidth, VIEW_W } from "./grid";
import { AXIS, colorFor, GRID } from "./palette";

const ROW = 26, BAR = 12, TOP = 30, BOTTOM = 24, TITLE_X = 100, TITLE_CHARS = 30, CAP = 16;
const LEFT = TITLE_X + textWidth("x".repeat(TITLE_CHARS), 12) + 16;
const RIGHT = VIEW_W - CAP - 8;
/** "2021", "2021-03" or "2021-03-15" as a UTC time; a month or year alone counts from its first day. */
const timeOf = (d: string): number => { const [y = 1970, m = 1, day = 1] = d.split("-").map(Number); return Date.UTC(y, m - 1, day); };
const yearOf = (t: number): number => new Date(t).getUTCFullYear();

/**
 * A Gantt of trials: one row each, in the order sent, a bar from the start date to the primary completion date coloured by phase. A
 * trial with no end date runs to today and ends in a dashed cap. The NCT ID on the left links to the registry; the row is the click target.
 */
export function TimelineView({ viz, onPick }: { viz: TimelineViz; onPick: OnPick }) {
  const { start, end, label, color } = viz.encoding;
  const today = Date.now();
  const rows = viz.data.map((r) => {
    const t0 = timeOf(String(r[start.field]));
    const endAt = r[end.field] === null || r[end.field] === undefined ? null : String(r[end.field]);
    return { r, id: String(r.nct_id), title: String(r[label.field] ?? r.nct_id), t0, t1: endAt === null ? null : Math.max(t0, timeOf(endAt)), endAt, hue: String(r[color.field] ?? "") };
  });
  const times = rows.flatMap((x) => [x.t0, x.t1 ?? x.t0]);
  const lo = Date.UTC(yearOf(Math.min(today, ...times)), 0, 1), hi = Date.UTC(yearOf(Math.max(today, ...times)) + 1, 0, 1);
  const x = scaleUtc().domain([new Date(lo), new Date(hi)]).range([LEFT, RIGHT]);
  const span = yearOf(hi) - yearOf(lo); const step = Math.max(1, Math.ceil(span / 8));
  const years = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => yearOf(lo) + i * step);
  const height = TOP + rows.length * ROW + BOTTOM;
  const base = TOP + rows.length * ROW;
  const anyOpen = rows.some((x) => x.t1 === null);
  return (
    <div className="chart" style={{ minHeight: 0 }}>
      <svg viewBox={`0 0 ${VIEW_W} ${height}`} width="100%" role="img" aria-label={viz.title} style={{ display: "block" }}>
        <g fontSize={11} fill={AXIS}>
          {years.map((y) => { const at = x(new Date(Date.UTC(y, 0, 1))); return <g key={y}><line x1={at} x2={at} y1={TOP - 6} y2={base} stroke={GRID} /><text x={at} y={TOP - 12} textAnchor="middle">{y}</text></g>; })}
        </g>
        {rows.map(({ r, id, title, t0, t1, endAt, hue }, i) => {
          const mid = TOP + i * ROW + ROW / 2;
          const fill = colorFor(Math.max(0, color.values.indexOf(hue)));
          const to = t1 ?? Math.max(t0, today);
          const when = endAt === null ? `from ${String(r[start.field])}, no primary completion date` : `${String(r[start.field])} to ${endAt}`;
          return (
            <g key={id} className="row" onClick={() => onPick(r.citations, id)} style={{ cursor: "pointer" }}>
              <title>{`${id}, ${title}, ${when}, ${hue}, ${String(r.status ?? "")}`}</title>
              <rect x={0} y={mid - ROW / 2} width={VIEW_W} height={ROW} fill="transparent" />
              <a href={`https://clinicaltrials.gov/study/${id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                <text className="num" x={0} y={mid} dominantBaseline="central" fontSize={11} fill="var(--brand)">{id}</text>
              </a>
              <text className="trial" x={TITLE_X} y={mid} dominantBaseline="central" fontSize={12} fill="var(--muted)">{clip(title, TITLE_CHARS)}<title>{title}</title></text>
              <rect className="span" x={x(new Date(t0))} y={mid - BAR / 2} width={Math.max(2, x(new Date(to)) - x(new Date(t0)))} height={BAR} rx={3} fill={fill} />
              {t1 === null && <rect className="open" x={x(new Date(to))} y={mid - BAR / 2} width={CAP} height={BAR} rx={3} fill="none" stroke={fill} strokeWidth={1.5} strokeDasharray="3 2" />}
            </g>
          );
        })}
        <line x1={x(new Date(today))} x2={x(new Date(today))} y1={TOP - 6} y2={base + 4} stroke="var(--faint)" />
        <text x={x(new Date(today))} y={base + 16} textAnchor="middle" fontSize={11} fill="var(--faint)">Today</text>
      </svg>
      <div className="chips legend" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        {color.values.length > 1 && color.values.map((v, i) => <span key={v} className="chip-tag"><span style={{ width: 10, height: 10, borderRadius: 2, background: colorFor(i), display: "inline-block" }} /> {v}</span>)}
        {anyOpen && <span className="chip-tag"><span style={{ width: 14, height: 10, borderRadius: 2, border: "1.5px dashed var(--muted)", display: "inline-block" }} /> No primary completion date</span>}
      </div>
    </div>
  );
}
