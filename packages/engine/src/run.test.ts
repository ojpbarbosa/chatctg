import { describe, expect, it, vi } from "vitest";
import { Judged, QueryRequest, QueryResponse } from "@chatctg/contracts";
import { fakeDeps, runQuery, type QueryEvent } from "./run";
import { SAMPLE, study } from "./test-studies";

const req = (q: string, extra: Record<string, unknown> = {}) => QueryRequest.parse({ query: q, citations_per_point: 2, ...extra });
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
    expect(body.visualization?.subtitle).toBe("12 trials on ClinicalTrials.gov. Each trial is counted once per phase. 1 trial without a phase is not shown. Data as of 2026-10-08.");
    expect(body.meta.source.requests[0]?.url).toContain("query.intr");
    expect(body.meta.timing.total_ms).toBeGreaterThanOrEqual(0);
    expect(events.map((e) => e.event)).toEqual(["judged", "interpretation", "progress", "title"]);
    expect(deps.ctgov.calls[0]).toEqual({ intr: '"pembrolizumab"' });
  });
  it("emits the judgment as soon as Jev answers, before the names are extracted", async () => {
    const deps = fakeDeps({ intent: { choice: "geographic" }, dimension: { choice: "none" }, chart: { choice: "bar" }, recruiting_only: { noul: 0.9 } }, { conditions: ["lupus"] });
    // Jev answers at 200 ms; the extractor waits for a gate and answers at 1,000 ms.
    let t = 0; deps.now = () => t;
    const ask = deps.judge.ask.bind(deps.judge);
    deps.judge.ask = (async (r: Parameters<typeof ask>[0]) => { const out = await ask(r); t = 200; return out; }) as typeof deps.judge.ask;
    let open!: () => void; const gate = new Promise<void>((resolve) => { open = resolve; });
    const extract = deps.extract; deps.extract = async (...args) => { await gate; t = 1000; return extract(...args); };
    const events: QueryEvent[] = [];
    const running = runQuery(req("Which countries have the most recruiting trials for lupus?"), deps, (e) => events.push(e));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    const judged = events[0]!;
    if (judged.event !== "judged") throw new Error(judged.event);
    expect(Judged.safeParse(judged.data).success).toBe(true);
    expect(judged.data).toMatchObject({ intent: { value: "geographic" }, dimension: { value: "country" }, secondary_dimension: null, chart: { chosen: "bar", provisional: "map" }, chart_named: false, recruiting_only: true, phase_filter: null, jev_ms: 0 });
    open();
    const body = okBody(await running);
    expect(events.map((e) => e.event)).toEqual(["judged", "interpretation", "progress", "title"]);
    expect(body.meta.timing).toMatchObject({ jev_ms: 0, judged_ms: 200, total_ms: 1000 });
    expect(body.meta.interpretation.chart.applied).toBe(judged.data.chart.provisional);
  });
  it("emits no judgment when Jev fails or no chart will answer", async () => {
    const failed = fakeDeps({}, {}); failed.judge.failWith("server_error");
    const out: QueryEvent[] = [];
    await runQuery(req("q"), failed, (e) => out.push(e));
    await runQuery(req("what is the weather"), fakeDeps({ in_scope: { noul: 0.1 } }, {}), (e) => out.push(e));
    await runQuery(req("write a poem"), fakeDeps({ intent: { choice: "other" } }, {}), (e) => out.push(e));
    expect(out).toEqual([]);
  });
  it("time trend: line, gap-filled", async () => {
    const deps = fakeDeps({ intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, chart: { choice: "line" } }, {}, SAMPLE.filter((s) => s.start_year !== 2020));
    const body = okBody(await runQuery(req("How many trials started each year?"), deps));
    expect(body.visualization?.type).toBe("line");
    if (body.visualization?.type !== "line") return;
    expect(body.visualization.data.map((r) => r.period)).toEqual(["2018", "2019", "2020", "2021", "2022", "2023", "2024"]);
  });
  it("a yearly trend over a truncated fetch counts each year exactly, from the oldest start date", async () => {
    // SAMPLE's eleven dated studies stand for 3,000 trials, 250 each: 2018 1, 2019 2, 2020 1, 2021 2, 2022 2, 2023 2, 2024 1.
    const trend = { intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, chart: { choice: "line" } };
    const deps = fakeDeps(trend, { conditions: ["melanoma"] }, SAMPLE, 3000);
    const body = okBody(await runQuery(req("Melanoma trials per year", { citations_per_point: 1 }), deps));
    if (body.visualization?.type !== "line") throw new Error(body.visualization?.type);
    expect(body.visualization.data.map((r) => [r.period, r.trial_count, r.study_count, r.citations.length])).toEqual([
      ["2018", 250, 250, 1], ["2019", 500, 500, 1], ["2020", 250, 250, 1], ["2021", 500, 500, 1], ["2022", 500, 500, 1], ["2023", 500, 500, 1], ["2024", 250, 250, 1],
    ]);
    expect(body.visualization.data[1]!.citations[0]).toMatchObject({ nct_id: "NCT00000005", excerpt: "2019-05-20" });
    const years = Array.from({ length: 11 }, (_, i) => 2018 + i);   // the oldest start year to this year + 2
    expect(deps.ctgov.sorts).toEqual(["StartDate:desc", "StartDate:asc", ...years.map(() => "StartDate:desc")]);
    expect(deps.ctgov.maxStudies).toEqual([3000, 1, ...years.map(() => 1)]);
    expect(deps.ctgov.calls.slice(1)).toEqual([{ cond: '"melanoma"' }, ...years.map((y) => ({ cond: '"melanoma"', advanced: `AREA[StartDate]RANGE[${y}-01-01,${y}-12-31]` }))]);
    expect(body.meta.coverage).toMatchObject({ total_count: 3000, fetched_count: 7, truncated: false, studies_without_value: 0 });
    expect(body.meta.source.requests).toHaveLength(13);
    expect(body.meta.source.requests[2]).toMatchObject({ total_count: 250, fetched: 1 });
    expect(body.meta.notes).toContain("Counts per year are exact (one registry count per year); citations show the 1 most recent trials of each year.");
    expect(body.meta.warnings).toEqual([]);
    expect(body.visualization.subtitle).toBe("3,000 trials on ClinicalTrials.gov. Data as of 2026-10-08.");
  });
  it("exact yearly counts start at the question's start year, and keep at most 40 years", async () => {
    const trend = { intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, chart: { choice: "bar" } };
    const since = fakeDeps(trend, { start_year: 2020 }, SAMPLE, 3000);
    const body = okBody(await runQuery(req("Trials per year since 2020"), since));
    if (body.visualization?.type !== "bar") throw new Error(body.visualization?.type);
    expect(body.visualization.data.map((r) => [r.period, r.trial_count])).toEqual([["2020", 250], ["2021", 500], ["2022", 500], ["2023", 500], ["2024", 250]]);
    expect(since.ctgov.sorts).not.toContain("StartDate:asc");
    expect(since.ctgov.calls[1]).toEqual({ advanced: "AREA[StartDate]RANGE[2020-01-01,MAX] AND AREA[StartDate]RANGE[2020-01-01,2020-12-31]" });
    expect(since.ctgov.calls).toHaveLength(1 + 9);
    const old = fakeDeps(trend, {}, [...SAMPLE, study({ nct_id: "NCT00000013", start_date: "1950-06-01" })], 3000);
    const capped = okBody(await runQuery(req("Trials per year"), old));
    expect(old.ctgov.calls).toHaveLength(2 + 40);
    expect(old.ctgov.calls[2]!.advanced).toBe("AREA[StartDate]RANGE[1989-01-01,1989-12-31]");
    expect(capped.meta.warnings).toEqual(["Years before 1989 are not shown."]);
  });
  it("other series over time from a truncated fetch drop the periods the sample may hold only in part", async () => {
    const deps = fakeDeps({ intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, granularity: { choice: "quarter" }, chart: { choice: "line" } }, {}, SAMPLE, 3000);
    const body = okBody(await runQuery(req("Trials per quarter"), deps));
    if (body.visualization?.type !== "line") throw new Error(body.visualization?.type);
    expect(deps.ctgov.calls).toHaveLength(1);
    expect(body.visualization.data[0]!.period).toBe("2018-Q4");   // the oldest trial read started in 2018-Q3
    expect(body.visualization.data.at(-1)!.period).toBe("2024-Q2");
    expect(body.meta.coverage.truncated).toBe(true);
    expect(body.meta.warnings).toContain("Periods before 2018-Q4 are incomplete because only the 12 most recently started trials were read; they are not shown.");
    const split = fakeDeps({ intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, secondary_dimension: { choice: "phase" }, chart: { choice: "line" } }, {}, SAMPLE, 3000);
    const bySeries = okBody(await runQuery(req("Trials per year by phase"), split));
    if (bySeries.visualization?.type !== "line") throw new Error(bySeries.visualization?.type);
    expect(split.ctgov.calls).toHaveLength(1);
    expect([...new Set(bySeries.visualization.data.map((r) => r.period))]).toEqual(["2019", "2020", "2021", "2022", "2023", "2024"]);
    expect(bySeries.meta.warnings).toContain("Periods before 2019 are incomplete because only the 12 most recently started trials were read; they are not shown.");
    const median = fakeDeps({ intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, metric: { choice: "enrollment_median" }, chart: { choice: "line" } }, {}, SAMPLE, 3000);
    expect(okBody(await runQuery(req("Median enrollment per year"), median)).meta.warnings.join(" ")).toMatch(/^Only the 12 .* Periods before 2019 are incomplete/);
    expect(median.ctgov.calls).toHaveLength(1);
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
  it("bubble: phase by sponsor class as a complete grid, each cell cited", async () => {
    const deps = fakeDeps({ dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" }, chart: { choice: "bubble" }, chart_named: { noul: 0.9 } }, { conditions: ["melanoma"] });
    const body = okBody(await runQuery(req("Show phase by sponsor class for melanoma trials as bubbles"), deps));
    if (body.visualization?.type !== "bubble") throw new Error(body.visualization?.type);
    expect(body.visualization.data).toHaveLength(5 * 3);
    expect(body.visualization.encoding.size).toEqual({ field: "trial_count", label: "Trials", unit: "trials" });
    expect(body.visualization.data.filter((r) => r.study_count === 0).length).toBeGreaterThan(0);
    expect(body.meta.interpretation.chart).toMatchObject({ chosen: "bubble", applied: "bubble", reason: null });
    expect(body.meta.notes).toContain("1 trial without a phase is not shown.");
    expect(body.visualization.subtitle).toBe("12 trials on ClinicalTrials.gov. Each trial is counted once per phase. 1 trial without a phase is not shown. Data as of 2026-10-08.");
  });
  it("heatmap over a comparison: one fetch per arm, the arms down, phases across, every cell present", async () => {
    const deps = fakeDeps({ intent: { choice: "comparison" }, dimension: { choice: "phase" }, chart: { choice: "heatmap" }, chart_named: { noul: 0.9 } }, { drugs: ["pembrolizumab", "nivolumab"] });
    const body = okBody(await runQuery(req("Show a heatmap of phases for pembrolizumab vs nivolumab trials"), deps));
    expect(deps.ctgov.calls).toEqual([{ intr: '"pembrolizumab"' }, { intr: '"nivolumab"' }]);
    if (body.visualization?.type !== "heatmap") throw new Error(body.visualization?.type);
    expect(body.visualization.encoding.y).toEqual({ field: "y", type: "nominal", label: "Drug", order: ["pembrolizumab", "nivolumab"] });
    expect(body.visualization.data).toHaveLength(5 * 2);
    expect(body.visualization.subtitle).toMatch(/^Pembrolizumab 12 and Nivolumab 12 trials on ClinicalTrials\.gov\. /);
  });
  it("comparison: one fetch per arm, grouped bar with two series, totals per arm", async () => {
    const deps = fakeDeps({ intent: { choice: "comparison" }, dimension: { choice: "phase" }, chart: { choice: "grouped_bar" } }, { drugs: ["pembrolizumab", "nivolumab"] });
    const body = okBody(await runQuery(req("Compare phases for pembrolizumab vs nivolumab"), deps));
    expect(deps.ctgov.calls).toEqual([{ intr: '"pembrolizumab"' }, { intr: '"nivolumab"' }]);
    if (body.visualization?.type !== "grouped_bar") throw new Error(body.visualization?.type);
    expect(body.visualization.encoding.series.values).toEqual(["pembrolizumab", "nivolumab"]);
    expect(body.visualization.subtitle).toMatch(/^Pembrolizumab 12 and Nivolumab 12 trials on ClinicalTrials\.gov\. /);
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
  it("a timeline fetches only its rows, like a table, and leaves out the trials without a start date", async () => {
    const deps = fakeDeps({ intent: { choice: "lookup" }, chart: { choice: "timeline" }, chart_named: { noul: 0.9 } }, {}, SAMPLE, 3000);
    const body = okBody(await runQuery(req("Timeline of the trials"), deps));
    if (body.visualization?.type !== "timeline") throw new Error(body.visualization?.type);
    expect(deps.ctgov.maxStudies).toEqual([25]);
    expect(body.visualization.data).toHaveLength(11);
    expect(body.visualization.data[0]).toMatchObject({ nct_id: "NCT00000007", start_date: "2018-09-09" });
    expect(body.meta.coverage).toMatchObject({ total_count: 3000, fetched_count: 12, truncated: false, studies_without_value: 1 });
    expect(body.meta.warnings).toEqual([]);
    expect(body.meta.notes).toContain("The timeline shows the 11 most recently started of 3,000 trials.");
    expect(body.meta.notes).toContain("1 trial without a start date is not shown.");
    const capped = fakeDeps({ intent: { choice: "lookup" }, chart: { choice: "timeline" } }, { limit: 200 });
    await runQuery(req("Timeline of the 200 latest trials"), capped);
    expect(capped.ctgov.maxStudies).toEqual([60]);
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
    const body = okBody(await runQuery(req("q", { drug_name: "given", start_year: 2015, trial_status: "COMPLETED" }), deps));
    expect(body.meta.interpretation.entities.drugs).toEqual(["given"]);
    expect(body.meta.interpretation.provided_fields).toEqual(["drug_name", "trial_status", "start_year"]);
    expect(deps.ctgov.calls[0]).toEqual({ intr: '"given"', overallStatus: "COMPLETED", advanced: "AREA[StartDate]RANGE[2015-01-01,MAX]" });
    expect(deps.judge.requests[0]!.state).toEqual({ question: "q", provided: { drugs: ["given"], trial_status: "COMPLETED", start_year: 2015 } });
  });
  it("a phase named in the question filters the fetch and shows in meta", async () => {
    const deps = fakeDeps({ intent: { choice: "count" }, chart: { choice: "single_value" }, recruiting_only: { noul: 0.95 }, phase_filter: { choice: "PHASE3" } }, { conditions: ["psoriasis"] }, SAMPLE, 41);
    const body = okBody(await runQuery(req("How many phase 3 psoriasis trials are recruiting?"), deps));
    expect(deps.ctgov.calls[0]).toEqual({ cond: '"psoriasis"', overallStatus: "RECRUITING", advanced: "AREA[Phase]PHASE3" });
    expect(body.meta.interpretation.phase_filter).toBe("PHASE3");
    expect(body.meta.arms[0]?.filters).toEqual({ "query.cond": '"psoriasis"', "filter.overallStatus": "RECRUITING", "filter.advanced": "AREA[Phase]PHASE3" });
    expect(body.visualization?.subtitle).toMatch(/\. Recruiting phase 3 trials only\. /);
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
