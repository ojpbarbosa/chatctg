import type { TableViz } from "@cheiron/contracts";
import type { OnPick } from "./index";
import { fmt } from "./common";

export function TableView({ viz, onPick }: { viz: TableViz; onPick: OnPick }) {
  return (
    <div className="chart" style={{ minHeight: 0, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--t-sm)" }}>
        <thead><tr>{viz.encoding.columns.map((c) => <th key={c.field} style={{ textAlign: c.type === "number" ? "right" : "left", color: "var(--muted)", fontWeight: 500, padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>{c.label}</th>)}</tr></thead>
        <tbody>{viz.data.map((r) => (
          <tr key={String(r.nct_id)} style={{ cursor: "pointer" }} onClick={() => onPick(r.citations, String(r.nct_id))}>
            {viz.encoding.columns.map((c) => <td key={c.field} className={c.type === "number" || c.field === "nct_id" ? "num" : undefined} style={{ textAlign: c.type === "number" ? "right" : "left", padding: "8px 10px", borderBottom: "1px solid var(--line-soft)", maxWidth: c.field === "title" ? 420 : undefined }}>{c.field === "nct_id" ? <a href={`https://clinicaltrials.gov/study/${String(r.nct_id)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{String(r.nct_id)}</a> : fmt(r[c.field])}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
