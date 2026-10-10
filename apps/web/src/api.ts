import type { Citation, Interpretation, QueryRequestInput, QueryResponse } from "@chatctg/contracts";

export interface InterpretationEvent { interpretation: Interpretation; chart: string; arms: { label: string; filters: Record<string, string> }[] }
export interface Handlers {
  onInterpretation?: (e: InterpretationEvent) => void;
  onProgress?: (e: { arm: string; fetched: number; total: number }) => void;
  onTitle?: (title: string) => void;
  onResult: (r: QueryResponse) => void;
  onError: (message: string, details?: unknown) => void;
}
export type { Citation };

/** Reads the SSE stream chunk by chunk; events are `event: x\ndata: json\n\n`. */
export async function streamQuery(body: QueryRequestInput, h: Handlers, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/query/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  } catch (e) { h.onError(signal?.aborted ? "Cancelled" : `Network error: ${String(e)}`); return; }
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string; details?: unknown } } | null;
    h.onError(j?.error?.message ?? `HTTP ${res.status}`, j?.error?.details); return;
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; let terminal = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) { if (!terminal) h.onError("Connection closed before an answer arrived"); break; }
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (\w+)/m.exec(chunk)?.[1]; const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!ev || data === undefined) continue;
      const j = JSON.parse(data) as never;
      if (ev === "interpretation") h.onInterpretation?.(j);
      else if (ev === "progress") h.onProgress?.(j);
      else if (ev === "title") h.onTitle?.((j as { title: string }).title);
      else if (ev === "result") { terminal = true; h.onResult(j); }
      else if (ev === "error") { terminal = true; const e = j as { error: { message: string; details?: unknown } }; h.onError(e.error.message, e.error.details); }
    }
  }
}
