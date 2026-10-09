import { useEffect, useState } from "react";
import type { QueryResponse } from "@cheiron/contracts";
import { loadHistory, newId, pushHistory, saveHistory, type HistoryItem } from "./history";
import { QueryBox } from "./components/QueryBox";
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
  useEffect(() => saveHistory(items), [items]);
  const active = items.find((i) => i.id === activeId) ?? null;

  async function submit(q: string) {
    const id = newId();
    const item: HistoryItem = { id, query: q, created_at: new Date().toISOString(), response: null, error: null };
    setItems((xs) => pushHistory(xs, item)); setActiveId(id); setQuery(q); setBusy(true);
    try {
      const res = await fetch("/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) });
      const body = (await res.json()) as QueryResponse | { error: { message: string } };
      setItems((xs) => pushHistory(xs, { ...item, ...("error" in body ? { error: body.error.message } : { response: body }) }));
    } catch (e) {
      setItems((xs) => pushHistory(xs, { ...item, error: String(e) }));
    } finally { setBusy(false); }
  }

  return (
    <div className="shell">
      <Sidebar items={items} activeId={activeId} onSelect={(id) => { setActiveId(id); setQuery(items.find((i) => i.id === id)?.query ?? ""); }} onNew={() => { setActiveId(null); setQuery(""); }} onRemove={(id) => { setItems((xs) => xs.filter((x) => x.id !== id)); if (id === activeId) setActiveId(null); }} />
      <main className="main">
        {active === null ? (
          <section className="landing">
            <h1>Ask the trial registry.</h1>
            <p>One question in, one cited chart out, straight from ClinicalTrials.gov.</p>
            <QueryBox value={query} onChange={setQuery} onSubmit={() => submit(query)} busy={busy} docked={false} />
            <div className="chips">{EXAMPLES.map((ex) => <button key={ex} className="chip" onClick={() => submit(ex)}>{ex}</button>)}</div>
          </section>
        ) : (
          <>
            <div className="docked"><QueryBox value={query} onChange={setQuery} onSubmit={() => submit(query)} busy={busy} docked /></div>
            <section className="result">
              <div className="card rise">
                <h2>{active.response?.visualization?.title ?? (active.error ? "Something went wrong" : "Working…")}</h2>
                {active.error && <p className="sub">{active.error}</p>}
                {active.response && <pre className="json">{JSON.stringify(active.response, null, 2).slice(0, 4000)}</pre>}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
