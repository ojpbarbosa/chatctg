import type { CSSProperties } from "react";

/** The ghost each chart type draws. */
function shapeOf(type: string): "bars" | "bubble" | "heatmap" | "timeline" | "sankey" | "block" {
  if (type.includes("bar") || type === "histogram") return "bars";
  if (type === "bubble" || type === "heatmap" || type === "timeline" || type === "sankey") return type;
  return "block";
}

/** A three by six grid of placeholders, each `piece` styled by its position. */
const grid = (piece: (row: number, col: number) => CSSProperties) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gridTemplateRows: "repeat(3, 1fr)", gap: 10, width: "100%", alignSelf: "stretch", placeItems: "center" }}>
    {Array.from({ length: 18 }, (_, i) => <div key={i} className="skeleton" style={piece(Math.floor(i / 6), i % 6)} />)}
  </div>
);

/** A ghost of the chart type that is coming, so the shape of the answer shows before the data. */
export function ChartSkeleton({ type }: { type: string }) {
  const shape = shapeOf(type);
  return (
    <div className="chart" aria-busy="true" data-shape={shape} style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "24px 8px" }}>
      {shape === "bars" && [0.5, 0.8, 0.35, 0.95, 0.6, 0.25].map((h, i) => <div key={i} className="skeleton" style={{ flex: 1, height: `${h * 100}%` }} />)}
      {shape === "bubble" && grid((r, c) => { const d = 18 + ((r * 7 + c * 5) % 5) * 9; return { width: d, height: d, borderRadius: "50%" }; })}
      {shape === "heatmap" && grid(() => ({ width: "100%", height: "100%", borderRadius: 3 }))}
      {shape === "timeline" && (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-evenly", width: "100%", alignSelf: "stretch" }}>
          {[[0.05, 0.4], [0.12, 0.35], [0.2, 0.5], [0.3, 0.3], [0.42, 0.4], [0.55, 0.35]].map(([from, length], i) => <div key={i} className="skeleton" style={{ height: 12, marginLeft: `${from! * 100}%`, width: `${length! * 100}%` }} />)}
        </div>
      )}
      {shape === "sankey" && (
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignSelf: "stretch", padding: "0 18%" }}>
          {[[0.45, 0.2, 0.25], [0.2, 0.3, 0.15, 0.25]].map((column, c) => (
            <div key={c} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 14 }}>
              {column.map((h, i) => <div key={i} className="skeleton" style={{ height: `${h * 90}%` }} />)}
            </div>
          ))}
        </div>
      )}
      {shape === "block" && <div className="skeleton" style={{ width: "100%", height: "100%", borderRadius: type === "network_graph" ? "50%" : undefined }} />}
    </div>
  );
}
