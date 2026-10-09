import type { HistoryItem } from "../history";

const GLYPH: Record<string, string> = { bar: "▮", grouped_bar: "▮▮", stacked_bar: "▮", line: "⟋", histogram: "▥", scatter: "⁘", network_graph: "⬡", map: "◍", table: "☰", single_value: "#" };
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

export function Sidebar({ items, activeId, onSelect, onNew, onRemove }: { items: HistoryItem[]; activeId: string | null; onSelect: (id: string) => void; onNew: () => void; onRemove: (id: string) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head"><span className="wordmark">Cheiron<small>ClinicalTrials.gov</small></span><button className="btn btn-ghost" onClick={onNew} title="New question">+ New</button></div>
      <nav className="history" aria-label="History">
        {items.length === 0 && <div className="history-empty">Your questions will appear here.</div>}
        {items.map((it) => (
          <div key={it.id} className="history-item">
            <button className="select" aria-current={it.id === activeId} onClick={() => onSelect(it.id)}>
              <span aria-hidden>{it.error ? "!" : GLYPH[it.response?.visualization?.type ?? ""] ?? "·"}</span>
              <span className="q">{it.query}</span>
              <span className="when">{ago(it.created_at)}</span>
            </button>
            <button className="x" aria-label="Remove" onClick={() => onRemove(it.id)}>×</button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
