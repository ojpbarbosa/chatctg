import { useEffect, useRef } from "react";

export function QueryBox({ value, onChange, onSubmit, busy, docked }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean; docked: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!docked) ref.current?.focus(); }, [docked]);
  return (
    <form className="querybox" onSubmit={(e) => { e.preventDefault(); if (value.trim() && !busy) onSubmit(); }} role="search">
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ask about clinical trials…" aria-label="Question about clinical trials" maxLength={500} />
      <button className="btn btn-primary" type="submit" disabled={busy || !value.trim()}>{busy ? "Working…" : "Ask"}</button>
    </form>
  );
}
