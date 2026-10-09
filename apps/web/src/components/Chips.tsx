import type { Interpretation } from "@cheiron/contracts";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const words = (s: string) => s.replace(/_/g, " ");

export function InterpretationChips({ i, applied, onDidYouMean }: { i: Interpretation; applied: string | null; onDidYouMean: (intent: string) => void }) {
  return (
    <div className="chips" style={{ justifyContent: "flex-start" }}>
      <span className="chip-tag accent"><b>{words(i.intent.value)}</b> {pct(i.intent.p)}</span>
      {i.dimension && <span className="chip-tag">by <b>{words(i.dimension.value)}</b></span>}
      {i.secondary_dimension && <span className="chip-tag">and <b>{words(i.secondary_dimension.value)}</b></span>}
      {applied && <span className="chip-tag"><b>{words(applied)}</b>{i.chart.chosen !== applied ? ` (asked: ${words(i.chart.chosen)})` : ""}</span>}
      {i.recruiting_only && <span className="chip-tag">recruiting only</span>}
      {i.time_window.start_year !== null && <span className="chip-tag">from <b>{i.time_window.start_year}</b></span>}
      {i.intent.alternatives.filter((a) => a.value !== i.intent.value).map((a) => (
        <button key={a.value} className="chip" onClick={() => onDidYouMean(a.value)}>Did you mean {words(a.value)}? {pct(a.p)}</button>
      ))}
    </div>
  );
}
