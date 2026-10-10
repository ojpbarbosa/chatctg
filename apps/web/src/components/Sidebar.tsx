import { useEffect, useState } from "react";
import type { HistoryItem } from "../history";
import { isNarrow, loadCollapsed, NARROW, saveCollapsed } from "../sidebar";

const GLYPH: Record<string, string> = { bar: "▮", grouped_bar: "▮▮", stacked_bar: "▮", line: "⟋", histogram: "▥", scatter: "⁘", network_graph: "⬡", map: "◍", table: "☰", single_value: "#" };
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

const Chevron = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="chevron"><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Plus = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;

/** The collapsed state, remembered across visits; a screen that turns narrow folds back to the rail. */
function useCollapsed(): [boolean, () => void, () => void] {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  useEffect(() => saveCollapsed(collapsed), [collapsed]);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia(NARROW); const fold = () => { if (mq.matches) setCollapsed(true); };
    mq.addEventListener("change", fold);
    return () => mq.removeEventListener("change", fold);
  }, []);
  return [collapsed, () => setCollapsed((c) => !c), () => { if (isNarrow()) setCollapsed(true); }];
}

export function Sidebar({ items, activeId, onSelect, onNew, onRemove }: { items: HistoryItem[]; activeId: string | null; onSelect: (id: string) => void; onNew: () => void; onRemove: (id: string) => void }) {
  const [collapsed, toggle, foldIfNarrow] = useCollapsed();
  return (
    <aside className={collapsed ? "sidebar rail" : "sidebar"}>
      <div className="sidebar-head">
        <button className="btn btn-ghost toggle" onClick={toggle} aria-expanded={!collapsed} aria-controls="history" aria-label={collapsed ? "Expand history" : "Collapse history"} data-tip={collapsed ? "Expand history" : undefined}>
          <Chevron />
        </button>
        {!collapsed && <span className="wordmark">ChatCTG</span>}
        <button className="btn btn-ghost new" onClick={() => { foldIfNarrow(); onNew(); }} aria-label="New question" data-tip={collapsed ? "New question" : undefined}>
          <Plus />{!collapsed && "New"}
        </button>
      </div>
      <nav id="history" className="history" aria-label="History" hidden={collapsed}>
        {items.length === 0 && <div className="history-empty">Chats will appear here.</div>}
        {items.map((it) => (
          <div key={it.id} className="history-item">
            <button className="select" aria-current={it.id === activeId} onClick={() => { foldIfNarrow(); onSelect(it.id); }}>
              <span aria-hidden>{it.error ? "!" : GLYPH[it.response?.visualization?.type ?? ""] ?? "…"}</span>
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
