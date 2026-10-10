import type { Interpretation, Judged, Phase } from "@chatctg/contracts";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const words = (s: string) => s.replace(/_/g, " ");
const PHASE: Record<Phase, string> = { EARLY_PHASE1: "Early phase 1", PHASE1: "Phase 1", PHASE2: "Phase 2", PHASE3: "Phase 3", PHASE4: "Phase 4", NA: "Phase not applicable" };

type Valued = { value: string; p: number } | null;
interface Settled { intent: { value: string; p: number }; dimension: Valued; secondary: Valued; chart: string | null; chosen: string; recruiting: boolean; phase: Phase | null }

/** What the judgment alone settles: the kind of answer, what it is grouped by, the chart and the filters. One chip each. */
function SettledTags({ s }: { s: Settled }) {
  return (
    <>
      <span className="chip-tag"><b>{words(s.intent.value)}</b> {pct(s.intent.p)}</span>
      {s.dimension && <span className="chip-tag">by <b>{words(s.dimension.value)}</b></span>}
      {s.secondary && <span className="chip-tag">and <b>{words(s.secondary.value)}</b></span>}
      {s.chart && <span className="chip-tag"><b>{words(s.chart)}</b>{s.chosen !== s.chart ? ` (asked: ${words(s.chosen)})` : ""}</span>}
      {s.recruiting && <span className="chip-tag">recruiting only</span>}
      {s.phase && <span className="chip-tag">{PHASE[s.phase]}</span>}
    </>
  );
}

/** The chips of the early judgment, shown while the names in the question are still being read. */
export function JudgedChips({ j }: { j: Judged }) {
  return (
    <div className="chips" style={{ justifyContent: "flex-start" }}>
      <SettledTags s={{ intent: j.intent, dimension: j.dimension, secondary: j.secondary_dimension, chart: j.chart.provisional, chosen: j.chart.chosen, recruiting: j.recruiting_only, phase: j.phase_filter }} />
    </div>
  );
}

export function InterpretationChips({ i, applied, onDidYouMean }: { i: Interpretation; applied: string | null; onDidYouMean: (intent: string) => void }) {
  return (
    <div className="chips" style={{ justifyContent: "flex-start" }}>
      <SettledTags s={{ intent: i.intent, dimension: i.dimension, secondary: i.secondary_dimension, chart: applied, chosen: i.chart.chosen, recruiting: i.recruiting_only, phase: i.phase_filter }} />
      {i.time_window.start_year !== null && <span className="chip-tag">from <b>{i.time_window.start_year}</b></span>}
      {i.intent.alternatives.filter((a) => a.value !== i.intent.value).map((a) => (
        <button key={a.value} className="chip" onClick={() => onDidYouMean(a.value)}>Did you mean {words(a.value)}? {pct(a.p)}</button>
      ))}
    </div>
  );
}
