import { useState } from "react";
import type { Citation } from "@chatctg/contracts";
import type { InterpretationEvent } from "../api";
import type { HistoryItem } from "../history";
import { renderChart } from "../charts";
import { CitationsDrawer } from "./CitationsDrawer";
import { InterpretationChips } from "./Chips";
import { JsonToggle } from "./JsonToggle";
import { ChartSkeleton } from "./Skeleton";

export interface LiveState { interpretation?: InterpretationEvent; progress?: { fetched: number; total: number }; title?: string }
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
const n = (x: number) => x.toLocaleString("en-US");

export function ResultCard({ item, live, onDidYouMean }: { item: HistoryItem; live: LiveState | null; onDidYouMean: (intent: string) => void }) {
  const [picked, setPicked] = useState<{ label: string; citations: Citation[] } | null>(null);
  const r = item.response; const i = r?.meta.interpretation ?? live?.interpretation?.interpretation ?? null;
  const applied = r?.meta.interpretation.chart.applied ?? live?.interpretation?.chart ?? null;
  const title = r?.visualization?.title ?? live?.title ?? (i ? "Working…" : "Classifying the question…");
  if (item.error) return <div style={{ width: "100%", display: "flex", justifyContent: "center"}}><div className="card error rise"><h2>Could not answer</h2><p className="sub">{item.error}</p>{i && <InterpretationChips i={i} applied={applied} onDidYouMean={onDidYouMean} />}</div></div>;
  return (
    <>
      <div className="card rise">
        <h2>{title}</h2>
        {r?.visualization?.subtitle && <p className="sub">{r.visualization.subtitle}</p>}
        {!r && live?.progress && <p className="sub">Reading {n(live.progress.fetched)} of {n(live.progress.total)} trials…</p>}
        {i && <InterpretationChips i={i} applied={applied} onDidYouMean={onDidYouMean} />}
        {r?.visualization ? renderChart(r.visualization, (citations, label) => setPicked({ citations, label })) : <ChartSkeleton type={applied ?? "bar"} />}
        {r && r.visualization === null && <p className="sub">No chart answers this question.</p>}
        {r && (
          <div className="foot">
            <span>Jev {ms(r.meta.timing.jev_ms)}</span><span>extraction {ms(r.meta.timing.extract_ms)}</span><span>ClinicalTrials.gov {ms(r.meta.timing.fetch_ms)}</span><span>total {ms(r.meta.timing.total_ms)}</span>
            <span>{n(r.meta.coverage.fetched_count)} of {n(r.meta.coverage.total_count)} trials read{r.meta.coverage.truncated ? " (sample)" : ""}</span>
            {r.meta.warnings.map((w) => <span key={w} style={{ color: "var(--warn)" }}>{w}</span>)}
            <span style={{ marginLeft: "auto" }}><JsonToggle value={r} /></span>
          </div>
        )}
      </div>
      {picked && <CitationsDrawer label={picked.label} citations={picked.citations} onClose={() => setPicked(null)} />}
    </>
  );
}
