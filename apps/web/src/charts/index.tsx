import type { Citation, Visualization } from "@cheiron/contracts";
import type { ReactNode } from "react";

export type OnPick = (citations: Citation[], label: string) => void;

export function renderChart(viz: Visualization, _onPick: OnPick): ReactNode {
  return <div className="chart"><p className="sub">{viz.type} renderer arrives in the next task.</p></div>;
}
