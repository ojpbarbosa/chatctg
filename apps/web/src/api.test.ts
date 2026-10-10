import { afterEach, describe, expect, it, vi } from "vitest";
import { streamQuery } from "./api";

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const streamOf = (text: string, size: number) => {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) { for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size)); c.close(); },
  });
};

afterEach(() => vi.unstubAllGlobals());

describe("streamQuery", () => {
  it("fires handlers in order with parsed data, even when chunks split events", async () => {
    const text = sse("judged", { intent: { value: "distribution", p: 0.9 }, chart: { chosen: "bar", provisional: "bar" }, jev_ms: 180 })
      + sse("interpretation", { interpretation: { intent: { value: "x" } }, chart: "bar", arms: [] })
      + sse("progress", { arm: "a", fetched: 5, total: 10 })
      + sse("title", { title: "A title" })
      + sse("result", { ok: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(text, 7), { status: 200 })));
    const calls: [string, unknown][] = [];
    await streamQuery({ query: "q" }, {
      onJudged: (e) => calls.push(["judged", e.chart.provisional]),
      onInterpretation: (e) => calls.push(["interpretation", e.chart]),
      onProgress: (e) => calls.push(["progress", e.fetched]),
      onTitle: (t) => calls.push(["title", t]),
      onResult: (r) => calls.push(["result", r]),
      onError: (m) => calls.push(["error", m]),
    });
    expect(calls).toEqual([["judged", "bar"], ["interpretation", "bar"], ["progress", 5], ["title", "A title"], ["result", { ok: true }]]);
  });

  it("reports an error event and a plain JSON failure", async () => {
    const err = { error: { code: "upstream_failed", message: "boom", details: { a: 1 } } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(sse("error", err), 1000), { status: 200 })));
    const onError = vi.fn();
    await streamQuery({ query: "q" }, { onResult: vi.fn(), onError });
    expect(onError).toHaveBeenCalledWith("boom", { a: 1 });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(err), { status: 502 })));
    const onError2 = vi.fn();
    await streamQuery({ query: "q" }, { onResult: vi.fn(), onError: onError2 });
    expect(onError2).toHaveBeenCalledWith("boom", { a: 1 });
  });

  it("reports an error when the stream closes without a result or error", async () => {
    const text = sse("interpretation", { interpretation: {}, chart: "bar", arms: [] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(text, 1000), { status: 200 })));
    const onResult = vi.fn(); const onError = vi.fn();
    await streamQuery({ query: "q" }, { onResult, onError });
    expect(onError).toHaveBeenCalledWith("Connection closed before an answer arrived");
    expect(onResult).not.toHaveBeenCalled();
  });
});
