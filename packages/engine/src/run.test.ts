import { describe, expect, it } from "vitest";
import { QueryRequest, QueryResponse } from "@cheiron/contracts";
import { fakeDeps, runQuery, type QueryEvent } from "./run";
import { SAMPLE } from "./test-studies";

const req = (q: string, extra: Record<string, unknown> = {}) => QueryRequest.parse({ query: q, citations_per_datum: 2, ...extra });
const okBody = (r: Awaited<ReturnType<typeof runQuery>>) => { if (!r.ok) throw new Error(JSON.stringify(r.body)); const v = QueryResponse.safeParse(r.body); if (!v.success) throw new Error(JSON.stringify(v.error.issues)); return v.data; };

describe("runQuery", () => {
  it("distribution by phase: bar with the multi-valued note, meta complete", async () => {
    const deps = fakeDeps({ intent: { choice: "distribution" }, dimension: { choice: "phase" }, chart: { choice: "bar" } }, { drugs: ["pembrolizumab"] });
    const events: QueryEvent[] = [];
    const body = okBody(await runQuery(req("How are pembrolizumab trials distributed across phases?"), deps, (e) => events.push(e)));
    expect(body.visualization?.type).toBe("bar");
    expect(body.meta.interpretation.entities.drugs).toEqual(["pembrolizumab"]);
    expect(body.meta.arms).toEqual([{ label: "Pembrolizumab", filters: { "query.intr": '"pembrolizumab"' } }]);
    expect(body.meta.coverage).toMatchObject({ total_count: 12, fetched_count: 12, truncated: false, studies_without_value: 1 });
    expect(body.meta.notes.join(" ")).toMatch(/once per phase/);
    expect(body.meta.notes).toContain("1 trial without a phase is not shown.");
    expect(body.visualization?.subtitle).toBe("12 trials on ClinicalTrials.gov · counted once per phase · 1 trial without a phase not shown · data as of 2026-10-08");
    expect(body.meta.source.requests[0]?.url).toContain("query.intr");
    expect(body.meta.timing.total_ms).toBeGreaterThanOrEqual(0);
    expect(events.map((e) => e.event)).toEqual(["interpretation", "progress", "title"]);
    expect(deps.ctgov.calls[0]).toEqual({ intr: '"pembrolizumab"' });
  });
  it("time trend: line, gap-filled", async () => {
    const deps = fakeDeps({ intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, chart: { choice: "line" } }, {}, SAMPLE.filter((s) => s.start_year !== 2020));
    const body = okBody(await runQuery(req("How many trials started each year?"), deps));
    expect(body.visualization?.type).toBe("line");
    if (body.visualization?.type !== "line") return;
    expect(body.visualization.data.map((r) => r.period)).toEqual(["2018", "2019", "2020", "2021", "2022", "2023", "2024"]);
  });
  it("a comparison ignores a secondary dimension and still fills its cells", async () => {
    const deps = fakeDeps({ intent: { choice: "comparison" }, dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" }, chart: { choice: "grouped_bar" } }, { drugs: ["pembrolizumab", "nivolumab"] });
    const body = okBody(await runQuery(req("Compare phases for pembrolizumab vs nivolumab by sponsor class"), deps));
    if (body.visualization?.type !== "grouped_bar") throw new Error(body.visualization?.type);
    expect(body.visualization.encoding.series.values).toEqual(["pembrolizumab", "nivolumab"]);
    expect(body.visualization.data.some((d) => Number(d.study_count) > 0)).toBe(true);
    expect(body.meta.interpretation.secondary_dimension).toBeNull();
  });
  it("a bar asked for over a second grouping lands as a stacked bar with a series", async () => {
    const deps = fakeDeps({ intent: { choice: "distribution" }, dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" }, chart: { choice: "bar" } }, {});
    const body = okBody(await runQuery(req("Trials by phase and sponsor class as a bar chart"), deps));
    if (body.visualization?.type !== "stacked_bar") throw new Error(body.visualization?.type);
    expect(body.visualization.encoding.series).toEqual({ field: "series", label: "Sponsor class", values: ["Industry", "NIH", "Other (academic, hospital)"] });
    expect(body.meta.interpretation.chart).toMatchObject({ chosen: "bar", applied: "stacked_bar" });
    expect(body.meta.notes.join(" ")).toMatch(/stacked/);
    const phase3 = body.visualization.data.filter((r) => r.phase_key === "PHASE3");
    expect(phase3.map((r) => [r.series, r.trial_count])).toEqual([["Industry", 4], ["NIH", 0], ["Other (academic, hospital)", 0]]);
  });
  it("comparison: one fetch per arm, grouped bar with two series, totals per arm", async () => {
    const deps = fakeDeps({ intent: { choice: "comparison" }, dimension: { choice: "phase" }, chart: { choice: "grouped_bar" } }, { drugs: ["pembrolizumab", "nivolumab"] });
    const body = okBody(await runQuery(req("Compare phases for pembrolizumab vs nivolumab"), deps));
    expect(deps.ctgov.calls).toEqual([{ intr: '"pembrolizumab"' }, { intr: '"nivolumab"' }]);
    if (body.visualization?.type !== "grouped_bar") throw new Error(body.visualization?.type);
    expect(body.visualization.encoding.series.values).toEqual(["pembrolizumab", "nivolumab"]);
    expect(body.visualization.subtitle).toMatch(/^Pembrolizumab 12 · Nivolumab 12 trials on ClinicalTrials\.gov · /);
    expect(body.meta.coverage.total_count).toBe(24);
    expect(body.meta.notes.join(" ")).toMatch(/can match more than one arm/);
  });
  it("states the multi-valued rule per dimension, with the Phase 1/2 example only for phases", async () => {
    const body = okBody(await runQuery(req("Trials by country"), fakeDeps({ dimension: { choice: "country" } }, {})));
    expect(body.meta.notes).toContain("A trial with several countries is counted once per value.");
    expect(body.meta.notes.join(" ")).not.toMatch(/Phase 1\/2/);
  });
  it("network and count", async () => {
    const n = okBody(await runQuery(req("network of sponsors and drugs"), fakeDeps({ intent: { choice: "network" }, edge_kind: { choice: "sponsor_drug" }, chart: { choice: "network_graph" } }, {})));
    expect(n.visualization?.type).toBe("network_graph");
    const deps = fakeDeps({ intent: { choice: "count" }, chart: { choice: "single_value" } }, {}, SAMPLE, 2973);
    const c = okBody(await runQuery(req("How many trials?"), deps));
    if (c.visualization?.type !== "single_value") throw new Error(c.visualization?.type);
    expect(c.visualization.data[0]?.value).toBe(2973);
  });
  it("a network warns when only the strongest links are kept", async () => {
    const body = okBody(await runQuery(req("network of sponsors and drugs"), fakeDeps({ intent: { choice: "network" }, edge_kind: { choice: "sponsor_drug" }, chart: { choice: "network_graph" } }, { limit: 2 })));
    if (body.visualization?.type !== "network_graph") throw new Error(body.visualization?.type);
    expect(body.visualization.data.edges).toHaveLength(2);
    expect(body.meta.warnings.join(" ")).toMatch(/^Only the 2 strongest links of \d+ are shown\.$/);
  });
  it("a table fetches only its rows, and is not a sample", async () => {
    const deps = fakeDeps({ intent: { choice: "lookup" }, chart: { choice: "table" } }, {}, SAMPLE, 3000);
    const body = okBody(await runQuery(req("list the trials"), deps));
    expect(deps.ctgov.maxStudies).toEqual([25]);
    expect(body.meta.coverage).toMatchObject({ total_count: 3000, fetched_count: 12, truncated: false });
    expect(body.meta.warnings).toEqual([]);
    expect(body.meta.notes).toContain("The table lists the 12 most recently started of 3,000 trials.");
    const five = fakeDeps({ intent: { choice: "lookup" }, chart: { choice: "table" } }, { limit: 5 });
    await runQuery(req("list the five latest trials"), five);
    expect(five.ctgov.maxStudies).toEqual([5]);
    const count = fakeDeps({ intent: { choice: "count" }, chart: { choice: "single_value" } }, {});
    await runQuery(req("how many trials"), count);
    expect(count.ctgov.maxStudies).toEqual([50]);
  });
  it("lookup, scatter when asked, map", async () => {
    expect(okBody(await runQuery(req("list the trials"), fakeDeps({ intent: { choice: "lookup" }, chart: { choice: "table" } }, {}))).visualization?.type).toBe("table");
    expect(okBody(await runQuery(req("scatter of enrollment vs start"), fakeDeps({ intent: { choice: "distribution" }, chart: { choice: "scatter" }, chart_named: { noul: 0.9 } }, {}))).visualization?.type).toBe("scatter");
    expect(okBody(await runQuery(req("which countries"), fakeDeps({ intent: { choice: "geographic" }, chart: { choice: "map" } }, {}))).visualization?.type).toBe("map");
  });
  it("a lookup draws a scatter when one is asked for, over the full fetch", async () => {
    const deps = fakeDeps({ intent: { choice: "lookup" }, chart: { choice: "scatter" }, chart_named: { noul: 0.9 } }, {});
    const body = okBody(await runQuery(req("Show a plot of individual lupus trials by enrollment and start date"), deps));
    if (body.visualization?.type !== "scatter") throw new Error(body.visualization?.type);
    expect(body.meta.interpretation.chart).toMatchObject({ chosen: "scatter", applied: "scatter", explicit: true });
    expect(body.visualization.data).toHaveLength(10);   // twelve studies, one without a start date, one without an enrollment
    expect(deps.ctgov.maxStudies).toEqual([3000]);
  });
  it("uses the LLM title and falls back to the template", async () => {
    const deps = fakeDeps({}, {});
    expect(okBody(await runQuery(req("q"), deps)).visualization?.title).toBe("Fake title");
    deps.title = async () => ({ title: null, ms: 0 });
    expect(okBody(await runQuery(req("q"), deps)).visualization?.title).toBe("All trials by phase");
  });
  it("request fields override extraction and show in provided_fields", async () => {
    const deps = fakeDeps({}, { drugs: ["extracted"] });
    const body = okBody(await runQuery(req("q", { drug_name: "given", start_year: 2015 }), deps));
    expect(body.meta.interpretation.entities.drugs).toEqual(["given"]);
    expect(body.meta.interpretation.provided_fields).toEqual(["drug_name", "start_year"]);
    expect(deps.ctgov.calls[0]).toEqual({ intr: '"given"', advanced: "AREA[StartDate]RANGE[2015-01-01,MAX]" });
  });
  it("a phase named in the question filters the fetch and shows in meta", async () => {
    const deps = fakeDeps({ intent: { choice: "count" }, chart: { choice: "single_value" }, recruiting_only: { noul: 0.95 }, phase_filter: { choice: "PHASE3" } }, { conditions: ["psoriasis"] }, SAMPLE, 41);
    const body = okBody(await runQuery(req("How many phase 3 psoriasis trials are recruiting?"), deps));
    expect(deps.ctgov.calls[0]).toEqual({ cond: '"psoriasis"', overallStatus: "RECRUITING", advanced: "AREA[Phase]PHASE3" });
    expect(body.meta.interpretation.phase_filter).toBe("PHASE3");
    expect(body.meta.arms[0]?.filters).toEqual({ "query.cond": '"psoriasis"', "filter.overallStatus": "RECRUITING", "filter.advanced": "AREA[Phase]PHASE3" });
    expect(body.visualization?.subtitle).toMatch(/ · recruiting only · phase 3 only · /);
  });
  it("not answerable → 422 with the interpretation", async () => {
    const r = await runQuery(req("what is the weather"), fakeDeps({ in_scope: { noul: 0.1 } }, {}));
    expect(r).toMatchObject({ ok: false, status: 422, body: { error: { code: "not_answerable" } } });
    if (r.ok) return;
    expect((r.body.error.details as { interpretation: unknown }).interpretation).toBeDefined();
  });
  it("upstream failures → 502 naming the upstream", async () => {
    const j = fakeDeps({}, {}); j.judge.failWith("rate_limited");
    expect(await runQuery(req("q"), j)).toMatchObject({ status: 502, body: { error: { code: "upstream_failed", details: { upstream: "jev", reason: "rate_limited" } } } });
    const e = fakeDeps({}, {}); e.extract = async () => ({ ok: false, reason: "missing_api_key", ms: 0 });
    expect(await runQuery(req("q"), e)).toMatchObject({ status: 502, body: { error: { code: "upstream_failed", details: { upstream: "openai", reason: "missing_api_key" } } } });
    const c = fakeDeps({}, {}); c.ctgov.fetchStudies = async () => ({ ok: false, reason: "ctgov_server_error", requests: [], ms: 0 });
    expect(await runQuery(req("q"), c)).toMatchObject({ status: 502, body: { error: { code: "upstream_failed", details: { upstream: "ctgov" } } } });
  });
  it("an aborted signal → 504", async () => {
    const ac = new AbortController(); ac.abort();
    expect(await runQuery(req("q"), fakeDeps({}, {}), undefined, ac.signal)).toMatchObject({ status: 504 });
  });
  it("a signal aborted during the fetch → 504, not a 502 from the registry", async () => {
    const ac = new AbortController();
    const r = await runQuery(req("q"), fakeDeps({}, {}), (e) => { if (e.event === "progress") ac.abort(); }, ac.signal);
    expect(r).toMatchObject({ ok: false, status: 504, body: { error: { code: "timeout", message: expect.stringMatching(/fetching/) } } });
  });
  it("a count is exact, not a sample", async () => {
    const body = okBody(await runQuery(req("How many trials?"), fakeDeps({ intent: { choice: "count" }, chart: { choice: "single_value" } }, {}, SAMPLE, 2973)));
    expect(body.meta.coverage.truncated).toBe(false);
    expect(body.meta.warnings.join(" ")).not.toMatch(/sample/);
    expect(body.visualization?.subtitle ?? "").not.toMatch(/based on/);
    expect(body.meta.notes.join(" ")).toMatch(/registry's total/);
  });
  it("an unexpected throw becomes a 500, not a rejection", async () => {
    const deps = fakeDeps({}, {}); deps.ctgov.version = async () => { throw new Error("boom"); };
    expect(await runQuery(req("q"), deps)).toMatchObject({ ok: false, status: 500, body: { error: { code: "internal" } } });
  });
  it("a rejecting titler still yields the template title", async () => {
    const deps = fakeDeps({}, {}); deps.title = async () => { throw new Error("nope"); };
    expect(okBody(await runQuery(req("q"), deps)).visualization?.title).toBe("All trials by phase");
  });
});
