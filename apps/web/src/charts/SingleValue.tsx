import type { SingleValueViz } from "@cheiron/contracts";
import type { OnPick } from "./index";
import { fmt } from "./common";

export function SingleValueView({ viz, onPick }: { viz: SingleValueViz; onPick: OnPick }) {
  const row = viz.data[0]!;
  return (
    <div className="chart" style={{ minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, cursor: "pointer" }} onClick={() => onPick(row.citations, viz.encoding.value.label)}>
      <div className="num" style={{ fontSize: 72, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--brand)" }}>{fmt(row.value)}</div>
      <div style={{ color: "var(--muted)" }}>{viz.encoding.value.label.toLowerCase()} · click for the most recent</div>
    </div>
  );
}
