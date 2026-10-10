import { useId, useMemo, useState } from "react";
import type { Judged } from "@chatctg/contracts";
import type { InterpretationEvent } from "../api";
import type { HistoryItem } from "../history";
import { renderChart, type OnPick } from "../charts";
import { dataPoints, type DataPoint } from "../charts/points";
import { CitationsDrawer, type Stepper } from "./CitationsDrawer";
import { InterpretationChips, JudgedChips } from "./Chips";
import { JsonPanel, JsonToggle } from "./JsonToggle";
import { ChartSkeleton } from "./Skeleton";

export interface LiveState { judged?: Judged; interpretation?: InterpretationEvent; progress?: { fetched: number; total: number }; title?: string }
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
const n = (x: number) => x.toLocaleString("en-US");

/**
 * The data point the citations drawer shows: `at` is its position among the chart's points, or for a click on something that is not one of
 * them (a network's node), the position Previous and Next step from.
 */
interface Selection { at: number; point: DataPoint; listed: boolean }

export function ResultCard({ item, live, onDidYouMean }: { item: HistoryItem; live: LiveState | null; onDidYouMean: (intent: string) => void }) {
  const [picked, setPicked] = useState<Selection | null>(null);
  const [showJson, setShowJson] = useState(false);
  const jsonId = useId();
  const r = item.response; const i = r?.meta.interpretation ?? live?.interpretation?.interpretation ?? null;
  const viz = r?.visualization ?? null;
  const { points, initial } = useMemo(() => (viz ? dataPoints(viz) : { points: [], initial: 0 }), [viz]);
  // A result opens on its default point, so its citations show before any click.
  const selected: Selection | null = picked ?? (points[initial] ? { at: initial, point: points[initial], listed: true } : null);
  const onPick: OnPick = (citations, label) => {
    const at = points.findIndex((p) => p.label === label);
    setPicked({ at: at >= 0 ? at : selected?.at ?? initial, point: { label, citations }, listed: at >= 0 });
  };
  const stepTo = (at: number) => () => { const point = points[at]; if (point) setPicked({ at, point, listed: true }); };
  // From a point, the steps go to its neighbours; from a click on something else, Previous goes back to the point shown before it.
  const step: Stepper | null = selected && points.length > 1 ? {
    at: selected.listed ? selected.at : null, of: points.length,
    onPrevious: !selected.listed ? stepTo(selected.at) : selected.at > 0 ? stepTo(selected.at - 1) : null,
    onNext: selected.at + 1 < points.length ? stepTo(selected.at + 1) : null,
  } : null;
  const applied = r?.meta.interpretation.chart.applied ?? live?.interpretation?.chart ?? null;
  // The early judgment stands in until the full interpretation replaces it.
  const judged = !i ? live?.judged ?? null : null;
  const title = r?.visualization?.title ?? live?.title ?? (i || judged ? "Working…" : "Classifying the question…");
  if (item.error) return <div style={{ width: "100%", display: "flex", justifyContent: "center"}}><div className="card error rise"><h2>Could not answer</h2><p className="sub">{item.error}</p>{i && <InterpretationChips i={i} applied={applied} onDidYouMean={onDidYouMean} />}</div></div>;
  return (
    <>
      <div className="card rise">
        <h2>{title}</h2>
        {r?.visualization?.subtitle && <p className="sub">{r.visualization.subtitle}</p>}
        {!r && live?.progress && <p className="sub">Reading {n(live.progress.fetched)} of {n(live.progress.total)} trials…</p>}
        {judged && <p className="sub">Reading the names in the question…</p>}
        {i && <InterpretationChips i={i} applied={applied} onDidYouMean={onDidYouMean} />}
        {judged && <JudgedChips j={judged} />}
        {viz ? renderChart(viz, onPick) : <ChartSkeleton type={applied ?? judged?.chart.provisional ?? "bar"} />}
        {r && r.visualization === null && <p className="sub">No chart answers this question.</p>}
        {r && (
          <div className="foot">
            {typeof r.meta.timing.judged_ms === "number" && <span>Judged in {ms(r.meta.timing.judged_ms)}</span>}
            <span>Extraction {ms(r.meta.timing.extract_ms)}</span>
            <span>ClinicalTrials.gov {ms(r.meta.timing.fetch_ms)}</span>
            <span>Total {ms(r.meta.timing.total_ms)}</span>
            <span>{n(r.meta.coverage.fetched_count)} of {n(r.meta.coverage.total_count)} trials read{r.meta.coverage.truncated ? " (sample)" : ""}</span>
            {r.meta.warnings.map((w) => <span key={w} style={{ color: "var(--warn)" }}>{w}</span>)}
            <span className="foot-end"><JsonToggle open={showJson} onToggle={() => setShowJson((o) => !o)} controls={jsonId} /></span>
          </div>
        )}
        {r && showJson && <JsonPanel id={jsonId} value={{ request: item.request ? { ...item.request, ...r.meta.extraction } : null, response: r }} />}
      </div>
      {selected && <CitationsDrawer label={selected.point.label} citations={selected.point.citations} step={step} />}
    </>
  );
}
