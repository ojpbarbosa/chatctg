import type { Citation } from "@chatctg/contracts";
import { cloneElement } from "react";
import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

export const fmt = (v: unknown): string => (typeof v === "number" ? v.toLocaleString("en-US") : String(v ?? ""));

/** What a click picked, for the citations drawer: "Phase 3, nivolumab", or just "Phase 3". */
export const pickLabel = (category: string, series: string | null): string => (series ? `${category}, ${series}` : category);

/** A named count: "Germany, 24 trials", "Pfizer, 1 trial", "Canada, 1,200 participants". */
export const countLabel = (name: string, n: number, unit: string): string => `${name}, ${fmt(n)} ${n === 1 ? unit.replace(/s$/, "") : unit}`;

export const reducedMotion = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export type Size = { width?: number; height?: number };

/** Responsive in the browser; a fixed size when width and height are given (tests, server render). */
export function Frame({ width, height, defaultHeight, children }: Size & { defaultHeight: number; children: ReactElement<Size> }) {
  if (width && height) return <div className="chart" style={{ height }}>{cloneElement(children, { width, height })}</div>;
  return <div className="chart" style={{ height: height ?? defaultHeight }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

export function Tip({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", boxShadow: "var(--lift)", fontSize: 13 }}>
      <div style={{ color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => <div key={p.name} style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: p.color ?? "var(--brand)" }} /><span>{p.name}</span><b className="num" style={{ marginLeft: "auto" }}>{fmt(p.value)} {unit}</b></div>)}
      <div style={{ color: "var(--faint)", marginTop: 4, fontSize: 12 }}>Click for cited trials</div>
    </div>
  );
}

export const rowCitations = (row: { citations?: Citation[] } | undefined): Citation[] => row?.citations ?? [];
