// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
// Node 25's own global localStorage shadows jsdom's and has no methods without a backing file, so the test brings its own.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

describe("Sidebar", () => {
  it("collapses to a rail and back from its toggle, and remembers the choice", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(<Sidebar items={[]} activeId={null} onSelect={noop} onNew={noop} onRemove={noop} />));
    const toggle = () => el.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    const aside = el.querySelector("aside")!;
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(toggle().getAttribute("aria-label")).toBe("Collapse history");
    expect(aside.classList.contains("rail")).toBe(false);
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-label")).toBe("Expand history");
    expect(aside.classList.contains("rail")).toBe(true);
    expect(JSON.parse(localStorage.getItem("chatctg.sidebar.v1")!)).toEqual({ collapsed: true });
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(aside.classList.contains("rail")).toBe(false);
    expect(el.querySelector(".sidebar-backdrop")).toBeNull();
    act(() => root.unmount());
    el.remove();
  });

  it("on a narrow screen, opens over the page and folds on Escape or a backdrop click, focus back on the toggle", () => {
    const mq = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    vi.stubGlobal("matchMedia", () => mq);
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(<Sidebar items={[]} activeId={null} onSelect={noop} onNew={noop} onRemove={noop} />));
    const toggle = () => el.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    const backdrop = () => el.querySelector<HTMLButtonElement>(".sidebar-backdrop");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(backdrop()).toBeNull();
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(backdrop()).not.toBeNull();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle());
    expect(backdrop()).toBeNull();
    act(() => toggle().click());
    act(() => backdrop()!.click());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("chatctg.sidebar.v1")).toBeNull();
    act(() => root.unmount());
    el.remove();
  });

  it("marks each past answer with its chart type's glyph", () => {
    const glyphs: Record<string, string> = { bubble: "◉", heatmap: "▦" };
    const items = Object.keys(glyphs).map((type, i) => ({ id: type, query: `q${i}`, created_at: new Date().toISOString(), response: { visualization: { type } } as never, error: null }));
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    act(() => root.render(<Sidebar items={items} activeId={null} onSelect={noop} onNew={noop} onRemove={noop} />));
    expect([...el.querySelectorAll(".history-item .select span:first-child")].map((s) => s.textContent)).toEqual(Object.values(glyphs));
    act(() => root.unmount());
    el.remove();
  });
});
