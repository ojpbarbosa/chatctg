import type { Citation } from "@chatctg/contracts";

/** The selected point's position among `of` (null when it is not one of them), and the steps to the neighbouring points (null at an end). */
export interface Stepper { at: number | null; of: number; onPrevious: (() => void) | null; onNext: (() => void) | null }

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The trials cited for the selected data point. With more than one point, the header gives its position and Previous and Next step through
 * the points in order; a button at an end stays focusable and does nothing, so the keyboard focus never drops to the page.
 */
export function CitationsDrawer({ label, citations, step }: { label: string; citations: Citation[]; step: Stepper | null }) {
  const nav = (go: (() => void) | null, name: string) => (
    <button className="btn btn-ghost" aria-disabled={go === null} onClick={() => go?.()}>{name}</button>
  );
  return (
    <div className="drawer rise" role="region" aria-label="Cited trials">
      <div className="drawer-head">
        <h3 aria-live="polite">Citations for {label}{step?.at != null && ` (point ${fmt(step.at + 1)} of ${fmt(step.of)})`}</h3>
        {step && (
          <div className="stepper">
            {nav(step.onPrevious, "Previous")}
            {nav(step.onNext, "Next")}
            <span className="hint">or click any point on the chart</span>
          </div>
        )}
      </div>
      {citations.length === 0 && <p className="sub">No citations were requested for this data point.</p>}
      {citations.length > 0 && (
        <div className="cites">
          {citations.map((c) => (
            <div className="cite" key={c.nct_id + c.excerpt}>
              <a href={`https://clinicaltrials.gov/study/${c.nct_id}`} target="_blank" rel="noreferrer" className="num">{c.nct_id}</a>
              <div><div className="trial" title={c.title}>{c.title}</div><div className="where"><span className="field">{c.field}</span> <span className="excerpt">“{c.excerpt}”</span></div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
