import type { Citation } from "@chatctg/contracts";

export function CitationsDrawer({ label, citations, onClose }: { label: string; citations: Citation[]; onClose: () => void }) {
  return (
    <div className="drawer rise" role="region" aria-label="Cited trials">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>{label} · {citations.length} cited trial{citations.length === 1 ? "" : "s"}</h3>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
      {citations.length === 0 && <p className="sub">No citations were requested for this datum.</p>}
      {citations.map((c) => (
        <div className="cite" key={c.nct_id + c.excerpt}>
          <a href={`https://clinicaltrials.gov/study/${c.nct_id}`} target="_blank" rel="noreferrer" className="num">{c.nct_id}</a>
          <div><div>{c.title}</div><div className="field">{c.field}</div><div className="excerpt">“{c.excerpt}”</div></div>
        </div>
      ))}
    </div>
  );
}
