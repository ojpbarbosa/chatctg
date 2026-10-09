import { describe, expect, it } from "vitest";
import { LruCache } from "./cache";
import { HttpCtgovClient } from "./client";

const study = (i: number) => ({ protocolSection: { identificationModule: { nctId: `NCT${String(i).padStart(8, "0")}` } } });
const page = (ids: number[], total: number, next?: string) => JSON.stringify({ totalCount: total, studies: ids.map(study), ...(next ? { nextPageToken: next } : {}) });
const json = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": status === 200 ? "application/json" : "text/plain" } });

describe("LruCache", () => {
  it("evicts the oldest and expires by ttl", () => {
    let t = 0;
    const c = new LruCache<number>(2, 100, () => t);
    c.set("a", 1); c.set("b", 2); c.set("c", 3);
    expect(c.get("a")).toBeUndefined(); expect(c.get("c")).toBe(3);
    t = 101; expect(c.get("c")).toBeUndefined();
  });
});

describe("HttpCtgovClient.fetchStudies", () => {
  it("follows page tokens, reports totals, and stops at maxStudies", async () => {
    const urls: string[] = [];
    const client = new HttpCtgovClient({ fetch: async (u) => {
      urls.push(String(u));
      const token = new URL(String(u)).searchParams.get("pageToken");
      if (!token) return json(page([1, 2], 5, "t2"));
      if (token === "t2") return json(page([3, 4], 5, "t3"));
      return json(page([5], 5));
    } });
    const r = await client.fetchStudies({ intr: '"x"' }, { maxStudies: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.studies.map((s) => s.nct_id)).toEqual(["NCT00000001", "NCT00000002", "NCT00000003", "NCT00000004"]);
    expect(r).toMatchObject({ totalCount: 5, fetched: 4, truncated: true });
    expect(urls).toHaveLength(2);
    expect(new URL(urls[0]!).searchParams.get("countTotal")).toBe("true");
    expect(new URL(urls[1]!).searchParams.has("countTotal")).toBe(false);
    expect(r.requests).toEqual([{ url: urls[0], total_count: 5, fetched: 2 }, { url: urls[1], total_count: 5, fetched: 2 }]);
  });
  it("is not truncated when the last page has no token", async () => {
    const client = new HttpCtgovClient({ fetch: async () => json(page([1], 1)) });
    const r = await client.fetchStudies({}, { maxStudies: 100 });
    expect(r).toMatchObject({ ok: true, truncated: false, fetched: 1, totalCount: 1 });
  });
  it("serves a repeated request from the cache", async () => {
    let calls = 0;
    const client = new HttpCtgovClient({ fetch: async () => { calls++; return json(page([1], 1)); } });
    await client.fetchStudies({ cond: '"a"' }, { maxStudies: 10 });
    await client.fetchStudies({ cond: '"a"' }, { maxStudies: 10 });
    expect(calls).toBe(1);
  });
  it("maps a 400 to ctgov_invalid_request without retrying", async () => {
    let calls = 0;
    const client = new HttpCtgovClient({ fetch: async () => { calls++; return json("Parameter 'fields' contains invalid field name", 400); }, sleep: async () => {} });
    expect(await client.fetchStudies({}, { maxStudies: 10 })).toMatchObject({ ok: false, reason: "ctgov_invalid_request" });
    expect(calls).toBe(1);
  });
  it("retries a 503 once", async () => {
    let calls = 0;
    const client = new HttpCtgovClient({ fetch: async () => (++calls === 1 ? json("down", 503) : json(page([1], 1))), sleep: async () => {} });
    expect(await client.fetchStudies({}, { maxStudies: 10 })).toMatchObject({ ok: true });
    expect(calls).toBe(2);
  });
  it("reports progress per page", async () => {
    const seen: [number, number][] = [];
    const client = new HttpCtgovClient({ fetch: async (u) => (new URL(String(u)).searchParams.get("pageToken") ? json(page([2], 2)) : json(page([1], 2, "t"))) });
    await client.fetchStudies({}, { maxStudies: 10, onPage: (f, t) => { seen.push([f, t]); } });
    expect(seen).toEqual([[1, 2], [2, 2]]);
  });
});
