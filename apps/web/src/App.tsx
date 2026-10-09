import { useEffect, useRef, useState } from "react";
import type { Interpretation, QueryRequestInput } from "@cheiron/contracts";
import { streamQuery } from "./api";
import { loadHistory, newId, pushHistory, saveHistory, type HistoryItem } from "./history";
import { QueryBox } from "./components/QueryBox";
import { ResultCard, type LiveState } from "./components/ResultCard";
import { Sidebar } from "./components/Sidebar";

export const EXAMPLES = [
  "How has the number of pembrolizumab trials changed per year since 2015?",
  "How are melanoma trials distributed across phases?",
  "Compare phases for trials involving pembrolizumab vs nivolumab",
  "Which countries have the most recruiting trials for lupus?",
  "Show a network of sponsors and drugs for melanoma trials",
];

export function App() {
  const [items, setItems] = useState<HistoryItem[]>(() => loadHistory());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const removed = useRef(new Set<string>());
  useEffect(() => saveHistory(items), [items]);
  const active = items.find((i) => i.id === activeId) ?? null;

  async function submit(q: string, extra: Partial<QueryRequestInput> = {}) {
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    const current = () => abortRef.current === ac;
    const id = newId();
    const item: HistoryItem = { id, query: q, created_at: new Date().toISOString(), response: null, error: null };
    const settle = (patch: Partial<HistoryItem>) => { if (!removed.current.has(id)) setItems((xs) => pushHistory(xs, { ...item, ...patch })); };
    setItems((xs) => pushHistory(xs, item)); setActiveId(id); setQuery(q); setBusy(true); setLive({});
    try {
      await streamQuery({ query: q, ...extra }, {
        onInterpretation: (e) => { if (current()) setLive((l) => ({ ...l, interpretation: e })); },
        onProgress: (e) => { if (current()) setLive((l) => ({ ...l, progress: { fetched: e.fetched, total: e.total } })); },
        onTitle: (title) => { if (current()) setLive((l) => ({ ...l, title })); },
        onResult: (response) => settle({ response }),
        onError: (message, details) => {
          settle({ error: message });
          const d = details as { interpretation?: Interpretation } | undefined;
          if (d?.interpretation && current()) setLive((l) => ({ ...l, interpretation: { interpretation: d.interpretation as Interpretation, chart: "", arms: [] } }));
        },
      }, ac.signal);
    } catch (e) {
      settle({ error: ac.signal.aborted ? "Cancelled" : String(e) });
    } finally {
      if (current()) setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Sidebar items={items} activeId={activeId} onSelect={(id) => { setActiveId(id); setQuery(items.find((i) => i.id === id)?.query ?? ""); }} onNew={() => { setActiveId(null); setQuery(""); }} onRemove={(id) => { removed.current.add(id); setItems((xs) => xs.filter((x) => x.id !== id)); if (id === activeId) setActiveId(null); }} />
      <main className="main">
        {active === null ? (
          <section className="landing">
            <h1>Ask the trial registry.</h1>
            <p>One question in, one cited chart out, straight from ClinicalTrials.gov.</p>
            <QueryBox value={query} onChange={setQuery} onSubmit={() => submit(query)} busy={busy} docked={false} />
            <div className="chips">{EXAMPLES.map((ex) => <button key={ex} className="chip" disabled={busy} onClick={() => submit(ex)}>{ex}</button>)}</div>
          </section>
        ) : (
          <>
            <div className="docked"><QueryBox value={query} onChange={setQuery} onSubmit={() => submit(query)} busy={busy} docked /></div>
            <section className="result">
              <ResultCard item={active} live={active.id === activeId ? live : null} onDidYouMean={(intent) => submit(active.query, { intent: intent as QueryRequestInput["intent"] })} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
