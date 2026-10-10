import type { Citation, Visualization } from "@chatctg/contracts";
import type { ReactNode } from "react";
import { BarView } from "./Bar";
import { BubbleView } from "./Bubble";
import { HeatmapView } from "./Heatmap";
import { HistogramView } from "./Histogram";
import { LineView } from "./Line";
import { NetworkView } from "./Network";
import { SankeyView } from "./Sankey";
import { ScatterView } from "./Scatter";
import { SingleValueView } from "./SingleValue";
import { TableView } from "./Table";
import { TimelineView } from "./Timeline";
import { WorldMapView } from "./WorldMap";

export type OnPick = (citations: Citation[], label: string) => void;

export function renderChart(viz: Visualization, onPick: OnPick): ReactNode {
  switch (viz.type) {
    case "bar": case "grouped_bar": case "stacked_bar": return <BarView viz={viz} onPick={onPick} />;
    case "line": return <LineView viz={viz} onPick={onPick} />;
    case "histogram": return <HistogramView viz={viz} onPick={onPick} />;
    case "scatter": return <ScatterView viz={viz} onPick={onPick} />;
    case "network_graph": return <NetworkView viz={viz} onPick={onPick} />;
    case "map": return <WorldMapView viz={viz} onPick={onPick} />;
    case "table": return <TableView viz={viz} onPick={onPick} />;
    case "single_value": return <SingleValueView viz={viz} onPick={onPick} />;
    case "bubble": return <BubbleView viz={viz} onPick={onPick} />;
    case "heatmap": return <HeatmapView viz={viz} onPick={onPick} />;
    case "timeline": return <TimelineView viz={viz} onPick={onPick} />;
    case "sankey": return <SankeyView viz={viz} onPick={onPick} />;
    default: return <pre className="json">{JSON.stringify(viz, null, 2)}</pre>;
  }
}
