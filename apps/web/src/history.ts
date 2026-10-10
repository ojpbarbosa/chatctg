import type { QueryResponse } from "@chatctg/contracts";

export interface HistoryItem { id: string; query: string; created_at: string; response: QueryResponse | null; error: string | null }
const KEY = "chatctg.history.v1";
export const HISTORY_CAP = 30;

export function loadHistory(): HistoryItem[] {
  try { const raw = localStorage.getItem(KEY); const v = raw ? (JSON.parse(raw) as unknown) : []; return Array.isArray(v) ? (v as HistoryItem[]).map((it) => (it.response || it.error ? it : { ...it, error: "Interrupted before an answer arrived" })) : []; } catch { return []; }
}
export function saveHistory(items: HistoryItem[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* quota or private mode: history is a convenience */ }
}
export function pushHistory(items: HistoryItem[], item: HistoryItem): HistoryItem[] {
  return [item, ...items.filter((x) => x.id !== item.id)].slice(0, HISTORY_CAP);
}
export const newId = (): string => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
