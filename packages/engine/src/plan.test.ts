import { describe, expect, it } from "vitest";
import { CHART_TYPES, QueryRequest, type ChartType } from "@chatctg/contracts";
import { FakeJudgmentClient, interpretationQuestions, type InterpretationAnswers, type Scripted } from "@chatctg/judgment";
import { allowedCharts, armFilters, defaultChart, plan, provisionalChart, type Entities } from "./plan";

const models = { judge: "fake", extractor: "fake", titler: "fake" };
const none: Entities = { drugs: [], conditions: [], sponsors: [], countries: [], start_year: null, end_year: null, limit: null };

async function answers(script: Record<string, Scripted>): Promise<InterpretationAnswers> {
  const base: Record<string, Scripted> = { in_scope: { noul: 0.95 }, intent: { choice: "distribution" }, dimension: { choice: "phase" }, secondary_dimension: { choice: "none" }, chart: { choice: "bar" }, chart_named: { noul: 0.1 }, granularity: { choice: "year" }, metric: { choice: "trial_count" }, edge_kind: { choice: "sponsor_drug" }, recruiting_only: { noul: 0.1 }, combination: { noul: 0.1 }, phase_filter: { choice: "none" } };
  const r = await new FakeJudgmentClient({ ...base, ...script }).ask({ state: "s", questions: interpretationQuestions() });
  if (!r.ok) throw new Error("fake failed");
  return r.answers;
}
const req = (extra: Record<string, unknown> = {}) => QueryRequest.parse({ query: "q", ...extra });
/** Jev's chart distribution: the named masses, the rest spread evenly over the other charts. */
const chartMass = (mass: Partial<Record<ChartType, number>>): Record<ChartType, number> => {
  const named = Object.values(mass).reduce((x, y) => x + y, 0); const others = CHART_TYPES.filter((c) => !(c in mass));
  return Object.fromEntries(CHART_TYPES.map((c) => [c, mass[c] ?? (1 - named) / others.length])) as Record<ChartType, number>;
};
async function withChartMass(script: Record<string, Scripted>, mass: Partial<Record<ChartType, number>>): Promise<InterpretationAnswers> {
  const a = await answers(script);
  return { ...a, chart: { ...a.chart, probabilities: chartMass(mass) } };
}
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
    const b = okPlan(plan({ answers: await answers({ intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, chart: { choice: "bar" } }), entities: none, request: req(), models }));
    expect(b.chart).toBe("bar"); expect(b.secondary).toBeNull();
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
    const p = okPlan(plan({ answers: await answers({}), entities: none, request: req({ trial_phase: "PHASE3", trial_status: "COMPLETED", end_year: 2020 }), models }));
    expect(p.arms[0]!.query).toEqual({ overallStatus: "COMPLETED", advanced: "AREA[Phase]PHASE3 AND AREA[StartDate]RANGE[MIN,2020-12-31]" });
    expect(p.interpretation.provided_fields).toEqual(["trial_phase", "trial_status", "end_year"]);
  });
  it("a phase Jev found named becomes an AREA[Phase] filter on every arm", async () => {
    const p = okPlan(plan({ answers: await answers({ intent: { choice: "count" }, phase_filter: { choice: "PHASE3" }, recruiting_only: { noul: 0.9 } }), entities: { ...none, conditions: ["psoriasis"] }, request: req(), models }));
    expect(p.arms[0]!.query).toEqual({ cond: '"psoriasis"', overallStatus: "RECRUITING", advanced: "AREA[Phase]PHASE3" });
    expect(p.phase).toBe("PHASE3"); expect(p.interpretation.phase_filter).toBe("PHASE3");
    expect(armFilters(p.arms[0]!)).toMatchObject({ "filter.advanced": "AREA[Phase]PHASE3" });
    const c = okPlan(plan({ answers: await answers({ intent: { choice: "comparison" }, dimension: { choice: "sponsor_class" }, phase_filter: { choice: "PHASE2" } }), entities: { ...none, drugs: ["a", "b"], start_year: 2015 }, request: req(), models }));
    expect(c.arms.map((x) => x.query.advanced)).toEqual(["AREA[Phase]PHASE2 AND AREA[StartDate]RANGE[2015-01-01,MAX]", "AREA[Phase]PHASE2 AND AREA[StartDate]RANGE[2015-01-01,MAX]"]);
    const n = okPlan(plan({ answers: await answers({}), entities: none, request: req(), models }));
    expect(n.phase).toBeNull(); expect(n.interpretation.phase_filter).toBeNull(); expect(n.arms[0]!.query.advanced).toBeUndefined();
  });
  it("a phase is filtered on only when Jev's probability for it reaches 0.5", async () => {
    // A choice's top probability is confidence × (1 − 1/n) + 1/n, with n = 7 phase options.
    const at = (p: number) => ({ choice: "PHASE3", confidence: (p - 1 / 7) / (1 - 1 / 7) });
    const low = okPlan(plan({ answers: await answers({ intent: { choice: "count" }, phase_filter: at(0.42) }), entities: none, request: req(), models }));
    expect(low.phase).toBeNull(); expect(low.interpretation.phase_filter).toBeNull(); expect(low.arms[0]!.query.advanced).toBeUndefined();
    expect(low.notes).toContain("A phase was mentioned but not clearly enough to filter on (p=0.42).");
    const clear = okPlan(plan({ answers: await answers({ intent: { choice: "count" }, phase_filter: at(0.5) }), entities: none, request: req(), models }));
    expect(clear.phase).toBe("PHASE3"); expect(clear.arms[0]!.query.advanced).toBe("AREA[Phase]PHASE3"); expect(clear.notes.join(" ")).not.toMatch(/not clearly/);
    const given = okPlan(plan({ answers: await answers({ intent: { choice: "count" }, phase_filter: at(0.42) }), entities: none, request: req({ trial_phase: "PHASE2" }), models }));
    expect(given.phase).toBe("PHASE2"); expect(given.notes.join(" ")).not.toMatch(/not clearly/);
  });
  it("the request's trial_phase overrides the phase Jev found", async () => {
    const p = okPlan(plan({ answers: await answers({ intent: { choice: "count" }, phase_filter: { choice: "PHASE3" } }), entities: none, request: req({ trial_phase: "PHASE2" }), models }));
    expect(p.arms[0]!.query.advanced).toBe("AREA[Phase]PHASE2"); expect(p.interpretation.phase_filter).toBe("PHASE2");
    expect(p.notes.join(" ")).not.toMatch(/was named/);
  });
  it("a split by phase is not also filtered to one phase, and says so", async () => {
    const note = "Phase 3 was named, but phases are what the chart splits by, so no phase filter was applied.";
    const d = okPlan(plan({ answers: await answers({ dimension: { choice: "phase" }, phase_filter: { choice: "PHASE3" } }), entities: none, request: req(), models }));
    expect(d.arms[0]!.query).toEqual({}); expect(d.phase).toBeNull(); expect(d.interpretation.phase_filter).toBeNull(); expect(d.notes).toContain(note);
    const t = okPlan(plan({ answers: await answers({ intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, secondary_dimension: { choice: "phase" }, chart: { choice: "line" }, phase_filter: { choice: "PHASE3" } }), entities: none, request: req(), models }));
    expect(t.secondary).toBe("phase"); expect(t.arms[0]!.query.advanced).toBeUndefined(); expect(t.notes).toContain(note);
    // The check runs on the final dimensions: a histogram drops its split by phase, so the filter applies.
    const h = okPlan(plan({ answers: await answers({ dimension: { choice: "enrollment" }, secondary_dimension: { choice: "phase" }, chart: { choice: "histogram" }, phase_filter: { choice: "PHASE3" } }), entities: none, request: req(), models }));
    expect(h.secondary).toBeNull(); expect(h.arms[0]!.query.advanced).toBe("AREA[Phase]PHASE3"); expect(h.notes).not.toContain(note);
  });
  it("limits default by intent and follow the extracted number", async () => {
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "ranking" }, dimension: { choice: "sponsor" } }), entities: none, request: req(), models })).limit).toBe(10);
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "ranking" }, dimension: { choice: "sponsor" } }), entities: { ...none, limit: 5 }, request: req(), models })).limit).toBe(5);
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, chart: { choice: "map" } }), entities: none, request: req(), models })).limit).toBeNull();
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, chart: { choice: "bar" }, chart_named: { noul: 0.9 } }), entities: none, request: req(), models })).limit).toBe(15);
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
    expect(allowedCharts("geographic", "country", null, false)).toEqual(["map"]);
    expect(allowedCharts("geographic", "country", null, true).sort()).toEqual(["bar", "map"]);
    expect(allowedCharts("network", null, null, true)).toEqual(["network_graph"]);
  });

  it("applies Jev's chart when compatible and falls back with a reason otherwise", async () => {
    const ok = okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, chart: { choice: "bar" }, chart_named: { noul: 0.9 } }), entities: none, request: req(), models }));
    expect(ok.chart).toBe("bar"); expect(ok.interpretation.chart).toEqual({ chosen: "bar", applied: "bar", explicit: true, reason: null });
    const trendBar = okPlan(plan({ answers: await answers({ intent: { choice: "time_trend" }, dimension: { choice: "start_year" }, chart: { choice: "bar" } }), entities: none, request: req(), models }));
    expect(trendBar.interpretation.chart).toEqual({ chosen: "bar", applied: "bar", explicit: false, reason: null });
    const bad = okPlan(plan({ answers: await answers({ chart: { choice: "line" } }), entities: none, request: req(), models }));
    expect(bad.chart).toBe("bar"); expect(bad.interpretation.chart.chosen).toBe("line"); expect(bad.interpretation.chart.reason).toMatch(/line/);
  });
  it("a geographic question is a map unless a bar is asked for", async () => {
    const unasked = okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, chart: { choice: "bar" }, chart_named: { noul: 0.3 } }), entities: none, request: req(), models }));
    expect(unasked.chart).toBe("map"); expect(unasked.limit).toBeNull();
    expect(unasked.interpretation.chart).toEqual({ chosen: "bar", applied: "map", explicit: false, reason: "bar is only used for a geographic question when asked for; using map" });
    const requested = okPlan(plan({ answers: await answers({ intent: { choice: "geographic" }, chart: { choice: "map" } }), entities: none, request: req({ chart: "bar" }), models }));
    expect(requested.chart).toBe("bar"); expect(requested.limit).toBe(15);
  });
  it("scatter needs an explicit ask, and says so when it was not", async () => {
    const unasked = okPlan(plan({ answers: await answers({ chart: { choice: "scatter" }, chart_named: { noul: 0.2 } }), entities: none, request: req(), models }));
    expect(unasked.chart).toBe("bar");
    expect(unasked.interpretation.chart).toEqual({ chosen: "scatter", applied: "bar", explicit: false, reason: "scatter plots one point per trial and is only used when asked for; using bar" });
    const named = okPlan(plan({ answers: await answers({ chart: { choice: "scatter" }, chart_named: { noul: 0.9 } }), entities: none, request: req(), models }));
    expect(named.chart).toBe("scatter"); expect(named.interpretation.chart.explicit).toBe(true);
    const ranking = okPlan(plan({ answers: await answers({ intent: { choice: "ranking" }, dimension: { choice: "sponsor" }, chart: { choice: "scatter" }, chart_named: { noul: 0.2 } }), entities: none, request: req(), models }));
    expect(ranking.interpretation.chart.reason).toBe("scatter cannot render a ranking over sponsor; the next most likely chart that can, bar, is used");
  });
  it("a lookup is a table unless a scatter is asked for", async () => {
    const asked = okPlan(plan({ answers: await answers({ intent: { choice: "lookup" }, chart: { choice: "scatter" }, chart_named: { noul: 0.9 } }), entities: none, request: req(), models }));
    expect(asked.chart).toBe("scatter"); expect(asked.interpretation.chart).toMatchObject({ applied: "scatter", explicit: true, reason: null });
    const unasked = okPlan(plan({ answers: await answers({ intent: { choice: "lookup" }, chart: { choice: "scatter" }, chart_named: { noul: 0.2 } }), entities: none, request: req(), models }));
    expect(unasked.chart).toBe("table"); expect(unasked.interpretation.chart.reason).toMatch(/only used when asked for; using table$/);
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "lookup" }, chart: { choice: "bar" } }), entities: none, request: req({ chart: "scatter" }), models })).chart).toBe("scatter");
    expect(okPlan(plan({ answers: await answers({ intent: { choice: "lookup" }, chart: { choice: "table" } }), entities: none, request: req(), models })).chart).toBe("table");
    expect(allowedCharts("lookup", null, null, false)).toEqual(["table"]);
    expect(allowedCharts("lookup", null, null, true).sort()).toEqual(["scatter", "table"]);
  });
  it("falls back to the allowed chart Jev rates next most likely", async () => {
    // A distribution over enrollment defaults to a histogram and may be a bar; a line cannot render it.
    const a = await withChartMass({ dimension: { choice: "enrollment" }, chart: { choice: "line" } }, { line: 0.6, bar: 0.25, histogram: 0.1 });
    const p = okPlan(plan({ answers: a, entities: none, request: req(), models }));
    expect(p.chart).toBe("bar");
    expect(p.interpretation.chart).toEqual({ chosen: "line", applied: "bar", explicit: false, reason: "line cannot render a distribution over enrollment; the next most likely chart that can, bar, is used" });
  });
  it("falls back to the default when the allowed charts tie or have no mass", async () => {
    const reason = "line cannot render a distribution over enrollment; using histogram";
    const flat = okPlan(plan({ answers: await answers({ dimension: { choice: "enrollment" }, chart: { choice: "line", confidence: 0 } }), entities: none, request: req(), models }));
    expect(flat.chart).toBe("histogram"); expect(flat.interpretation.chart.reason).toBe(reason);
    const tie = okPlan(plan({ answers: await withChartMass({ dimension: { choice: "enrollment" }, chart: { choice: "line" } }, { line: 0.6, bar: 0.2, histogram: 0.2 }), entities: none, request: req(), models }));
    expect(tie.chart).toBe("histogram"); expect(tie.interpretation.chart.reason).toBe(reason);
    const zero = okPlan(plan({ answers: await withChartMass({ dimension: { choice: "enrollment" }, chart: { choice: "line" } }, { line: 1, bar: 0, histogram: 0 }), entities: none, request: req(), models }));
    expect(zero.chart).toBe("histogram"); expect(zero.interpretation.chart.reason).toBe(reason);
  });
  it("never falls back to a chart that needs an explicit ask", async () => {
    // A line was named, so the question is explicit, but it asked for a line, not a scatter.
    const named = okPlan(plan({ answers: await withChartMass({ chart: { choice: "line" }, chart_named: { noul: 0.9 } }, { line: 0.6, scatter: 0.3, bar: 0.05 }), entities: none, request: req(), models }));
    expect(named.chart).toBe("bar");
    const geo = okPlan(plan({ answers: await withChartMass({ intent: { choice: "geographic" }, chart: { choice: "line" } }, { line: 0.6, bar: 0.3, map: 0.05 }), entities: none, request: req(), models }));
    expect(geo.chart).toBe("map");
    // An unasked scatter falls back the same way, keeping its own reason.
    const split = okPlan(plan({ answers: await withChartMass({ dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" }, chart: { choice: "scatter" } }, { scatter: 0.5, grouped_bar: 0.3, stacked_bar: 0.1 }), entities: none, request: req(), models }));
    expect(split.interpretation.chart).toEqual({ chosen: "scatter", applied: "grouped_bar", explicit: false, reason: "scatter plots one point per trial and is only used when asked for; using grouped_bar" });
  });
  it("a request chart counts as explicit", async () => {
    expect(okPlan(plan({ answers: await answers({}), entities: none, request: req({ chart: "scatter" }), models })).chart).toBe("scatter");
  });
});

describe("provisionalChart", () => {
  it("is the chart the planner applies to the judgment alone", async () => {
    const scripts: Record<string, Scripted>[] = [
      {}, { chart: { choice: "line" } }, { intent: { choice: "time_trend" }, dimension: { choice: "phase" }, chart: { choice: "bar" } },
      { intent: { choice: "geographic" }, chart: { choice: "bar" } }, { intent: { choice: "geographic" }, chart: { choice: "bar" }, chart_named: { noul: 0.9 } },
      { dimension: { choice: "enrollment" }, secondary_dimension: { choice: "phase" }, chart: { choice: "histogram" } },
      { intent: { choice: "ranking" }, dimension: { choice: "sponsor" }, secondary_dimension: { choice: "phase" }, chart: { choice: "bar" } },
      { intent: { choice: "lookup" }, chart: { choice: "scatter" }, chart_named: { noul: 0.9 } }, { intent: { choice: "network" }, chart: { choice: "bar" } },
    ];
    for (const s of scripts) {
      const a = await answers(s);
      expect(provisionalChart(a), JSON.stringify(s)).toBe(okPlan(plan({ answers: a, entities: none, request: req(), models })).chart);
    }
    const mass = await withChartMass({ dimension: { choice: "enrollment" }, chart: { choice: "line" } }, { line: 0.6, bar: 0.25, histogram: 0.1 });
    expect(provisionalChart(mass)).toBe("bar");
  });
  it("assumes a comparison finds its arms, and follows the request's intent and chart", async () => {
    const compare = await answers({ intent: { choice: "comparison" }, dimension: { choice: "phase" }, chart: { choice: "grouped_bar" } });
    expect(provisionalChart(compare)).toBe("grouped_bar");
    expect(okPlan(plan({ answers: compare, entities: { ...none, drugs: ["one"] }, request: req(), models })).chart).toBe("bar");
    expect(provisionalChart(await answers({ intent: { choice: "other" } }), { intent: "count" })).toBe("single_value");
    expect(provisionalChart(await answers({}), { chart: "scatter" })).toBe("scatter");
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
  it("a bar over a second grouping is drawn stacked, with the reason", async () => {
    const d = okPlan(plan({ answers: await answers({ dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" }, chart: { choice: "bar" } }), entities: none, request: req(), models }));
    expect(d.chart).toBe("stacked_bar"); expect(d.secondary).toBe("sponsor_class");
    expect(d.interpretation.chart).toEqual({ chosen: "bar", applied: "stacked_bar", explicit: false, reason: "a bar chart has one bar per category, so the split by sponsor class is stacked; using stacked_bar" });
    const t = okPlan(plan({ answers: await answers({ intent: { choice: "time_trend" }, dimension: { choice: "phase" }, chart: { choice: "bar" } }), entities: none, request: req(), models }));
    expect(t.secondary).toBe("phase"); expect(t.chart).toBe("stacked_bar");
    const r = okPlan(plan({ answers: await answers({ dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" } }), entities: none, request: req({ chart: "bar" }), models }));
    expect(r.chart).toBe("stacked_bar"); expect(r.interpretation.chart).toMatchObject({ chosen: "bar", applied: "stacked_bar", explicit: true });
    const g = okPlan(plan({ answers: await answers({ dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" }, chart: { choice: "grouped_bar" } }), entities: none, request: req(), models }));
    expect(g.chart).toBe("grouped_bar"); expect(g.interpretation.chart.reason).toBeNull();
  });
  it("a histogram drops the second grouping with a note", async () => {
    const h = okPlan(plan({ answers: await answers({ dimension: { choice: "enrollment" }, secondary_dimension: { choice: "phase" }, chart: { choice: "histogram" } }), entities: none, request: req(), models }));
    expect(h.chart).toBe("histogram"); expect(h.secondary).toBeNull(); expect(h.interpretation.secondary_dimension).toBeNull();
    expect(h.notes).toContain("A second grouping (phase) is not shown in a histogram.");
    const plain = okPlan(plan({ answers: await answers({ dimension: { choice: "enrollment" }, chart: { choice: "histogram" } }), entities: none, request: req(), models }));
    expect(plain.chart).toBe("histogram"); expect(plain.notes.join(" ")).not.toMatch(/histogram/);
  });
  it("a one-entity comparison becomes a distribution and keeps its secondary grouping", async () => {
    const p = okPlan(plan({ answers: await answers({ intent: { choice: "comparison" }, dimension: { choice: "phase" }, secondary_dimension: { choice: "sponsor_class" } }), entities: { ...none, drugs: ["pembrolizumab"] }, request: req(), models }));
    expect(p.intent).toBe("distribution"); expect(p.secondary).toBe("sponsor_class"); expect(p.notes.join(" ")).not.toMatch(/second grouping/);
  });
});
