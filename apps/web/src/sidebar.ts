const KEY = "chatctg.sidebar.v1";
/** Up to this width the sidebar is a rail, and opening it lays the history over the page. */
export const NARROW = "(max-width: 760px)";

export const isNarrow = (): boolean => typeof matchMedia !== "undefined" && matchMedia(NARROW).matches;

/** Whether the history starts collapsed to the rail: always on a narrow screen, else as the viewer left it. */
export function loadCollapsed(): boolean {
  if (isNarrow()) return true;
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { collapsed?: unknown } | null; return v?.collapsed === true; } catch { return false; }
}

/** Remembers the choice made on a wide screen; a narrow screen always opens on the rail, so its toggles are not kept. */
export function saveCollapsed(collapsed: boolean): void {
  if (isNarrow()) return;
  try { localStorage.setItem(KEY, JSON.stringify({ collapsed })); } catch { /* quota or private mode: the layout is a convenience */ }
}
