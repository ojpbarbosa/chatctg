import { describe, expect, it } from "vitest";
import { LruCache } from "./cache";
import { FakeCtgovClient, HttpCtgovClient } from "./client";
import type { Study } from "./study";

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
  it("asks the first page for no more than the cap, and later pages for the configured size", async () => {
    const urls: string[] = [];
    const fifty = Array.from({ length: 50 }, (_, i) => i + 1);
    const small = new HttpCtgovClient({ fetch: async (u) => { urls.push(String(u)); return json(page(fifty, 5000, "t2")); } });
    expect(await small.fetchStudies({}, { maxStudies: 50 })).toMatchObject({ ok: true, fetched: 50, truncated: true, totalCount: 5000 });
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]!).searchParams.get("pageSize")).toBe("50");
    const sizes: string[] = [];
    const paged = new HttpCtgovClient({ pageSize: 2, fetch: async (u) => {
      const params = new URL(String(u)).searchParams; sizes.push(params.get("pageSize")!);
      return params.get("pageToken") ? json(page([3, 4], 4)) : json(page([1, 2], 4, "t2"));
    } });
    await paged.fetchStudies({}, { maxStudies: 3 });
    expect(sizes).toEqual(["2", "2"]);
  });
  it("sorts by start date descending unless asked otherwise", async () => {
    const sorts: (string | null)[] = [];
    const client = new HttpCtgovClient({ fetch: async (u) => { sorts.push(new URL(String(u)).searchParams.get("sort")); return json(page([1], 1)); } });
    await client.fetchStudies({}, { maxStudies: 10 });
    await client.fetchStudies({}, { maxStudies: 1, sort: "StartDate:asc" });
    expect(sorts).toEqual(["StartDate:desc", "StartDate:asc"]);
  });
  it("reports progress per page", async () => {
    const seen: [number, number][] = [];
    const client = new HttpCtgovClient({ fetch: async (u) => (new URL(String(u)).searchParams.get("pageToken") ? json(page([2], 2)) : json(page([1], 2, "t"))) });
    await client.fetchStudies({}, { maxStudies: 10, onPage: (f, t) => { seen.push([f, t]); } });
    expect(seen).toEqual([[1, 2], [2, 2]]);
  });
});

describe("FakeCtgovClient", () => {
  it("answers from its studies and records the cap of each call", async () => {
    const fake = new FakeCtgovClient([], 0);
    expect(await fake.fetchStudies({ cond: '"a"' }, { maxStudies: 25 })).toMatchObject({ ok: true, fetched: 0 });
    expect(fake.calls).toEqual([{ cond: '"a"' }]); expect(fake.maxStudies).toEqual([25]);
  });
  it("stops with ctgov_timeout once the signal is aborted, before or after a page", async () => {
    const fake = new FakeCtgovClient([], 0);
    const before = new AbortController(); before.abort();
    expect(await fake.fetchStudies({}, { maxStudies: 10, signal: before.signal })).toMatchObject({ ok: false, reason: "ctgov_timeout" });
    const during = new AbortController();
    expect(await fake.fetchStudies({}, { maxStudies: 10, signal: during.signal, onPage: () => during.abort() })).toMatchObject({ ok: false, reason: "ctgov_timeout" });
  });
  it("keeps the studies a StartDate range admits, scales the total to them, and honours an explicit sort", async () => {
    const mk = (nct_id: string, start_date: string | null): Study => ({
      nct_id, title: nct_id, status: "COMPLETED", phases: [], start_date, start_year: start_date ? Number(start_date.slice(0, 4)) : null, primary_completion_date: null,
      lead_sponsor: { name: "", class: "OTHER" }, collaborators: [], conditions: [], mesh_conditions: [], interventions: [], mesh_interventions: [], countries: [],
      enrollment: null, study_type: "INTERVENTIONAL", sex: "ALL", std_ages: [],
    });
    const fake = new FakeCtgovClient([mk("c", "2021-02"), mk("b", "2020-12-31"), mk("a", "2020-01-01"), mk("z", null)], 400);
    const year = await fake.fetchStudies({ advanced: "AREA[Phase]PHASE3 AND AREA[StartDate]RANGE[2020-01-01,2020-12-31]" }, { maxStudies: 1 });
    expect(year).toMatchObject({ ok: true, totalCount: 200, fetched: 1, truncated: true });
    const since = await fake.fetchStudies({ advanced: "AREA[StartDate]RANGE[2020-06-01,MAX]" }, { maxStudies: 10 });
    expect(since.ok && since.studies.map((s) => s.nct_id)).toEqual(["c", "b"]);
    const oldest = await fake.fetchStudies({}, { maxStudies: 1, sort: "StartDate:asc" });
    expect(oldest).toMatchObject({ ok: true, totalCount: 400, studies: [{ nct_id: "a" }] });
    expect(fake.sorts).toEqual(["StartDate:desc", "StartDate:desc", "StartDate:asc"]);
  });
});
