/** A ghost of the chart type that is coming, so the shape of the answer shows before the data. */
export function ChartSkeleton({ type }: { type: string }) {
  const bars = type.includes("bar") || type === "histogram";
  return (
    <div className="chart" aria-busy="true" style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "24px 8px" }}>
      {bars && [0.5, 0.8, 0.35, 0.95, 0.6, 0.25].map((h, i) => <div key={i} className="skeleton" style={{ flex: 1, height: `${h * 100}%` }} />)}
      {!bars && <div className="skeleton" style={{ width: "100%", height: "100%", borderRadius: type === "network_graph" ? "50%" : undefined }} />}
    </div>
  );
}
