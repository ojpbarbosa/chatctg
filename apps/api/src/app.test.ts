import { describe, expect, it } from "vitest";
import type { FastifyReply } from "fastify";
import { fakeDeps } from "@chatctg/engine";
import { buildApp } from "./app";
import { startSse } from "./sse";

const app = () => buildApp(fakeDeps({ intent: { choice: "distribution" }, dimension: { choice: "phase" } }, { drugs: ["pembrolizumab"] }));

describe("API", () => {
  it("GET /health", async () => {
    const r = await app().inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200); expect(r.json()).toEqual({ ok: true, version: "chatctg/0.1.0", api_version: "2.0.5", data_timestamp: "2026-10-08T09:00:05" });
  });
  it("GET /schema", async () => {
    const r = await app().inject({ method: "GET", url: "/schema" });
    expect(r.json()).toHaveProperty("request.properties.query"); expect(r.json()).toHaveProperty("response.properties.meta");
  });
  it("POST /query answers 200 with a visualization", async () => {
    const r = await app().inject({ method: "POST", url: "/query", payload: { query: "pembrolizumab trials by phase" } });
    expect(r.statusCode).toBe(200); expect(r.json().visualization.type).toBe("bar"); expect(r.json().meta.query).toBe("pembrolizumab trials by phase");
  });
  it("POST /query rejects a bad body with 400 and issues", async () => {
    const r = await app().inject({ method: "POST", url: "/query", payload: { query: "", nope: 1 } });
    expect(r.statusCode).toBe(400); expect(r.json().error.code).toBe("invalid_request"); expect(Array.isArray(r.json().error.details)).toBe(true);
  });
  it("POST /query takes trial_status and citations_per_point, and rejects the old names", async () => {
    const r = await app().inject({ method: "POST", url: "/query", payload: { query: "q", trial_status: "RECRUITING", citations_per_point: 1 } });
    expect(r.statusCode).toBe(200); expect(r.json().meta.arms[0].filters["filter.overallStatus"]).toBe("RECRUITING");
    expect(r.json().visualization.data.every((d: { citations: unknown[] }) => d.citations.length <= 1)).toBe(true);
    for (const old of [{ status: "RECRUITING" }, { citations_per_datum: 1 }]) {
      const bad = await app().inject({ method: "POST", url: "/query", payload: { query: "q", ...old } });
      expect(bad.statusCode).toBe(400);
    }
  });
  it("POST /query maps not answerable to 422", async () => {
    const r = await buildApp(fakeDeps({ in_scope: { noul: 0.1 } }, {})).inject({ method: "POST", url: "/query", payload: { query: "weather" } });
    expect(r.statusCode).toBe(422); expect(r.json().error.code).toBe("not_answerable");
  });
  it("POST /query/stream emits interpretation, progress, title, result", async () => {
    const r = await app().inject({ method: "POST", url: "/query/stream", payload: { query: "pembrolizumab trials by phase" } });
    expect(r.statusCode).toBe(200); expect(r.headers["content-type"]).toContain("text/event-stream");
    const events = r.body.split("\n\n").filter(Boolean).map((chunk) => /^event: (\w+)/m.exec(chunk)?.[1]);
    expect(events).toEqual(["interpretation", "progress", "title", "result"]);
    const result = r.body.split("\n\n").find((c) => c.startsWith("event: result"))!;
    expect(JSON.parse(result.replace(/^event: result\ndata: /, "")).visualization.type).toBe("bar");
  });
  it("POST /query/stream ends with an error event on failure", async () => {
    const deps = fakeDeps({}, {}); deps.judge.failWith("server_error");
    const r = await buildApp(deps).inject({ method: "POST", url: "/query/stream", payload: { query: "q" } });
    expect(r.body).toMatch(/^event: error/m); expect(r.body).toContain('"upstream":"jev"');
  });
});

describe("startSse", () => {
  const stub = (raw: Record<string, unknown>, calls: string[]) => ({ hijack: () => { calls.push("hijack"); }, raw: { writeHead: () => { calls.push("writeHead"); }, ...raw } }) as unknown as FastifyReply;
  it("flushes the headers right after writing them", () => {
    const calls: string[] = [];
    startSse(stub({ flushHeaders: () => { calls.push("flushHeaders"); } }, calls));
    expect(calls).toEqual(["hijack", "writeHead", "flushHeaders"]);
  });
  it("works on a response without flushHeaders", () => {
    const calls: string[] = [];
    expect(() => startSse(stub({}, calls))).not.toThrow();
    expect(calls).toEqual(["hijack", "writeHead"]);
  });
});
