import type { Citation, Visualization } from "@cheiron/contracts";
import type { ReactNode } from "react";
import { BarView } from "./Bar";
import { HistogramView } from "./Histogram";
import { LineView } from "./Line";
import { ScatterView } from "./Scatter";

export type OnPick = (citations: Citation[], label: string) => void;

export function renderChart(viz: Visualization, onPick: OnPick): ReactNode {
  switch (viz.type) {
    case "bar": case "grouped_bar": case "stacked_bar": return <BarView viz={viz} onPick={onPick} />;
    case "line": return <LineView viz={viz} onPick={onPick} />;
    case "histogram": return <HistogramView viz={viz} onPick={onPick} />;
    case "scatter": return <ScatterView viz={viz} onPick={onPick} />;
    default: return <pre className="json">{JSON.stringify(viz, null, 2)}</pre>;
  }
}
