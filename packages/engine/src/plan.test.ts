import { describe, expect, it } from "vitest";
import { QueryRequest } from "@cheiron/contracts";
import { FakeJudgmentClient, interpretationQuestions, type InterpretationAnswers, type Scripted } from "@cheiron/judgment";
import { allowedCharts, defaultChart, plan, type Entities } from "./plan";

const models = { judge: "fake", extractor: "fake", titler: "fake" };
const none: Entities = { drugs: [], conditions: [], sponsors: [], countries: [], start_year: null, end_year: null, limit: null };

async function answers(script: Record<string, Scripted>): Promise<InterpretationAnswers> {
  const base: Record<string, Scripted> = { in_scope: { noul: 0.95 }, intent: { choice: "distribution" }, dimension: { choice: "phase" }, secondary_dimension: { choice: "none" }, chart: { choice: "bar" }, chart_named: { noul: 0.1 }, granularity: { choice: "year" }, metric: { choice: "trial_count" }, edge_kind: { choice: "sponsor_drug" }, recruiting_only: { noul: 0.1 }, combination: { noul: 0.1 } };
  const r = await new FakeJudgmentClient({ ...base, ...script }).ask({ state: "s", questions: interpretationQuestions() });
  if (!r.ok) throw new Error("fake failed");
  return r.answers;
}
const req = (extra: Record<string, unknown> = {}) => QueryRequest.parse({ query: "q", ...extra });
const okPlan = (r: ReturnType<typeof plan>) => { if (!r.ok) throw new Error(r.message); return r.plan; };

describe("plan: scope and intent", () => {
  it("refuses out-of-scope questions", async () => {
    const r = plan({ answers: await answers({ in_scope: { noul: 0.2 } }), entities: none, request: req(), models });
    expect(r).toMatchObject({ ok: false, reason: "not_answerable" });
  });
  it("refuses intent other", async () => {
    expect(plan({ answers: await answers({ intent: { choice: "other" } }), entities: none, request: req(), models }).ok).toBe(false);
  });
  it("a request intent overrides Jev and skips the scope check", async () => {
    const p = okPlan(plan({ answers: await answers({ in_scope: { noul: 0.2 }, intent: { choice: "other" } }), entities: none, request: req({ intent: "count" }), models }));
    expect(p.intent).toBe("count"); expect(p.chart).toBe("single_value"); expect(p.interpretation.intent.p).toBe(1);
  });
  it("keeps alternatives only when the intent is uncertain", async () => {
    const sure = okPlan(plan({ answers: await answers({ intent: { choice: "ranking", confidence: 0.9 } }), entities: none, request: req(), models }));
    expect(sure.interpretation.intent.alternatives).toEqual([]);
    const unsure = okPlan(plan({ answers: await answers({ intent: { choice: "ranking", confidence: 0.2 } }), entities: none, request: req(), models }));
    expect(unsure.interpretation.intent.alternatives).toHaveLength(3);
    expect(unsure.interpretation.intent.alternatives[0]).toMatchObject({ value: "ranking" });
  });
});

describe("plan: dimensions", () => {
  it("time trends always run over start_year with the granularity", async () => {
    const p = okPlan(plan({ answers: await answers({ intent: { choice: "time_trend" }, dimension: { choice: "phase" }, granularity: { choice: "quarter" }, chart: { choice: "line" } }), entities: none, request: req(), models }));
    expect(p.dimension).toBe("start_year"); expect(p.secondary).toBe("phase"); expect(p.granularity).toBe("quarter"); expect(p.chart).toBe("line");
    const b = okPlan(plan({ answers: await answers({ intent: { choice: "time_trend" }, chart: { choice: "bar" } }), entities: none, request: req(), models }));
    expect(b.chart).toBe("bar");
  });
  it("a distribution over start_year becomes a time trend", async () => {
    const p = okPlan(plan({ answers: await answers({ dimension: { choice: "start_year" } }), entities: none, request: req(), models }));
    expect(p.intent).toBe("time_trend"); expect(p.notes.join(" ")).toMatch(/time trend/);
  });
  it("a distribution with no dimension falls back to phase with a note", async () => {
    const p = okPlan(plan({ answers: await answers({ dimension: { choice: "none" } }), entities: none, request: req(), models }));
    expect(p.dimension).toBe("phase"); expect(p.notes.length).toBeGreaterThan(0);
  });
  it("geographic runs over country; network and count have no dimension", async () => {
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, dimension: { choice: "none" } }), entities: none, request: req(), models })).dimension).toBe("country");
    const n = okPlan(plan({ answers: await answers({ intent: { choice: "network" }, edge_kind: { choice: "drug_drug" } }), entities: none, request: req(), models }));
    expect(n.dimension).toBeNull(); expect(n.edge_kind).toBe("drug_drug"); expect(n.limit).toBe(40);
  });
  it("drops a secondary equal to the primary", async () => {
    const p = okPlan(plan({ answers: await answers({ secondary_dimension: { choice: "phase" } }), entities: none, request: req(), models }));
    expect(p.secondary).toBeNull();
  });
});

describe("plan: arms and filters", () => {
  it("builds one arm with no query parameters when nothing is named", async () => {
    const p = okPlan(plan({ answers: await answers({}), entities: none, request: req(), models }));
    expect(p.arms).toEqual([{ label: "All trials", query: {} }]);
  });
  it("joins several drugs with OR, or AND for a combination", async () => {
    const e = { ...none, drugs: ["pembrolizumab", "chemotherapy"] };
    expect(okPlan(plan({ answers: await answers({}), entities: e, request: req(), models })).arms[0]!.query.intr).toBe('"pembrolizumab" OR "chemotherapy"');
    const c = okPlan(plan({ answers: await answers({ combination: { noul: 0.8 } }), entities: e, request: req(), models }));
    expect(c.arms[0]!.query.intr).toBe('"pembrolizumab" AND "chemotherapy"'); expect(c.interpretation.combination).toBe(true);
  });
  it("a comparison makes one arm per compared drug, carrying the common filters", async () => {
    const e = { ...none, drugs: ["pembrolizumab", "nivolumab"], conditions: ["melanoma"], start_year: 2015 };
    const p = okPlan(plan({ answers: await answers({ intent: { choice: "comparison" }, recruiting_only: { noul: 0.9 } }), entities: e, request: req(), models }));
    expect(p.arms.map((a) => a.label)).toEqual(["pembrolizumab", "nivolumab"]);
    expect(p.arms[0]!.query).toEqual({ intr: '"pembrolizumab"', cond: '"melanoma"', overallStatus: "RECRUITING", advanced: "AREA[StartDate]RANGE[2015-01-01,MAX]" });
    expect(p.chart).toBe("grouped_bar");
  });
  it("a comparison with one entity becomes a distribution with a note", async () => {
    const p = okPlan(plan({ answers: await answers({ intent: { choice: "comparison" } }), entities: { ...none, drugs: ["a"] }, request: req(), models }));
    expect(p.intent).toBe("distribution"); expect(p.arms).toHaveLength(1);
  });
  it("request fields become filters", async () => {
    const p = okPlan(plan({ answers: await answers({}), entities: none, request: req({ trial_phase: "PHASE3", status: "COMPLETED", end_year: 2020 }), models }));
    expect(p.arms[0]!.query).toEqual({ overallStatus: "COMPLETED", advanced: "AREA[Phase]PHASE3 AND AREA[StartDate]RANGE[MIN,2020-12-31]" });
    expect(p.interpretation.provided_fields).toEqual(["trial_phase", "status", "end_year"]);
  });
  it("limits default by intent and follow the extracted number", async () => {
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "ranking" }, dimension: { choice: "sponsor" } }), entities: none, request: req(), models })).limit).toBe(10);
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "ranking" }, dimension: { choice: "sponsor" } }), entities: { ...none, limit: 5 }, request: req(), models })).limit).toBe(5);
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, chart: { choice: "map" } }), entities: none, request: req(), models })).limit).toBeNull();
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, chart: { choice: "bar" } }), entities: none, request: req(), models })).limit).toBe(15);
  });
});

describe("chart matrix", () => {
  it.each<[Parameters<typeof defaultChart>[0], Parameters<typeof defaultChart>[1], Parameters<typeof defaultChart>[2], string]>([
    ["time_trend", "start_year", null, "line"], ["time_trend", "start_year", "phase", "line"],
    ["distribution", "phase", null, "bar"], ["distribution", "phase", "sponsor_class", "stacked_bar"], ["distribution", "enrollment", null, "histogram"],
    ["comparison", "phase", null, "grouped_bar"], ["comparison", "start_year", null, "line"],
    ["ranking", "sponsor", null, "bar"], ["geographic", "country", null, "map"], ["network", null, null, "network_graph"],
    ["count", null, null, "single_value"], ["lookup", null, null, "table"],
  ])("%s over %s by %s defaults to %s", (intent, dim, sec, chart) => expect(defaultChart(intent, dim, sec)).toBe(chart));

  it("allows only what the shape can render", () => {
    expect(allowedCharts("distribution", "phase", null, false)).toEqual(["bar"]);
    expect(allowedCharts("distribution", "phase", "status", false).sort()).toEqual(["bar", "grouped_bar", "stacked_bar"]);
    expect(allowedCharts("distribution", "enrollment", null, false).sort()).toEqual(["bar", "histogram"]);
    expect(allowedCharts("time_trend", "start_year", null, false).sort()).toEqual(["bar", "line"]);
    expect(allowedCharts("time_trend", "start_year", null, true)).toContain("scatter");
    expect(allowedCharts("ranking", "country", null, false).sort()).toEqual(["bar", "map"]);
    expect(allowedCharts("geographic", "country", null, false).sort()).toEqual(["bar", "map"]);
    expect(allowedCharts("network", null, null, true)).toEqual(["network_graph"]);
  });

  it("applies Jev's chart when compatible and falls back with a reason otherwise", async () => {
    const ok = okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, chart: { choice: "bar" } }), entities: none, request: req(), models }));
    expect(ok.chart).toBe("bar"); expect(ok.interpretation.chart).toEqual({ chosen: "bar", applied: "bar", explicit: false, reason: null });
    const bad = okPlan(plan({ answers: await answers({ chart: { choice: "line" } }), entities: none, request: req(), models }));
    expect(bad.chart).toBe("bar"); expect(bad.interpretation.chart.chosen).toBe("line"); expect(bad.interpretation.chart.reason).toMatch(/line/);
  });
  it("scatter needs an explicit ask", async () => {
    expect(okPlan(plan({ answers: await answers({ chart: { choice: "scatter" }, chart_named: { noul: 0.2 } }), entities: none, request: req(), models })).chart).toBe("bar");
    const named = okPlan(plan({ answers: await answers({ chart: { choice: "scatter" }, chart_named: { noul: 0.9 } }), entities: none, request: req(), models }));
    expect(named.chart).toBe("scatter"); expect(named.interpretation.chart.explicit).toBe(true);
  });
  it("a request chart counts as explicit", async () => {
    expect(okPlan(plan({ answers: await answers({}), entities: none, request: req({ chart: "scatter" }), models })).chart).toBe("scatter");
  });
});

describe("plan: secondary grouping", () => {
  it("a secondary grouping is dropped for comparisons, rankings and maps", async () => {
    const c = okPlan(plan({ answers: await answers({ intent: { choice: "comparison" }, dimension: { choice: "status" }, secondary_dimension: { choice: "phase" } }), entities: { ...none, drugs: ["pembrolizumab", "nivolumab"] }, request: req(), models }));
    expect(c.secondary).toBeNull(); expect(c.notes.join(" ")).toMatch(/second grouping/);
    const r = okPlan(plan({ answers: await answers({ intent: { choice: "ranking" }, dimension: { choice: "sponsor" }, secondary_dimension: { choice: "phase" } }), entities: none, request: req(), models }));
    expect(r.secondary).toBeNull();
    const g = okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, secondary_dimension: { choice: "sponsor_class" } }), entities: none, request: req(), models }));
    expect(g.secondary).toBeNull();
    const d = okPlan(plan({ answers: await answers({ intent: { choice: "distribution" }, secondary_dimension: { choice: "sponsor_class" } }), entities: none, request: req(), models }));
    expect(d.secondary).toBe("sponsor_class"); expect(d.notes.join(" ")).not.toMatch(/second grouping/);
    expect(g.notes.join(" ")).toMatch(/for a map/); expect(r.notes.join(" ")).toMatch(/for a ranking/); expect(c.notes.join(" ")).toMatch(/for a comparison/);
    const d2 = okPlan(plan({ answers: await answers({ intent: { choice: "distribution" }, dimension: { choice: "status" }, secondary_dimension: { choice: "phase" } }), entities: none, request: req(), models }));
    expect(d2.secondary).toBe("phase"); expect(d2.notes.join(" ")).not.toMatch(/second grouping/);
  });
  it("a one-entity comparison becomes a distribution and keeps its secondary grouping", async () => {
    const p = okPlan(plan({ answers: await answers({ intent: { choice: "comparison" }, dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" } }), entities: { ...none, drugs: ["pembrolizumab"] }, request: req(), models }));
    expect(p.intent).toBe("distribution"); expect(p.secondary).toBe("sponsor_class"); expect(p.notes.join(" ")).not.toMatch(/second grouping/);
  });
});
