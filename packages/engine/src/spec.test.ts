import { describe, expect, it } from "vitest";
import { Visualization } from "@chatctg/contracts";
import { bucketize, mergeArms } from "./aggregate/buckets";
import { buildGraph } from "./aggregate/graph";
import { scatterPoints } from "./aggregate/points";
import { buildVisualization, notShown, planSummary, subtitle, templateTitle, type Aggregate } from "./spec";
import type { Plan } from "./plan";
import { SAMPLE } from "./test-studies";

const ctx = { total_count: 12, fetched: 12, truncated: false, data_timestamp: "2026-10-08T09:00:05", citations_per_point: 2, arm_totals: [{ label: "Pembrolizumab", total: 12 }] };
const base = (over: Partial<Plan>): Plan => ({
  intent: "distribution", chart: "bar", dimension: "phase", secondary: null, metric: "trial_count", granularity: null, edge_kind: null,
  arms: [{ label: "Pembrolizumab", query: { intr: '"pembrolizumab"' } }], limit: null, recruiting_only: false, phase: null, notes: [],
  entities: { drugs: ["pembrolizumab"], conditions: [], sponsors: [], countries: [], start_year: null, end_year: null, limit: null },
  interpretation: null as never,
  ...over,
});
const valid = (v: unknown) => { const r = Visualization.safeParse(v); if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 1)); return r.data; };

describe("titles", () => {
  it("templates by intent", () => {
    expect(templateTitle(base({}))).toBe("Pembrolizumab trials by phase");
    expect(templateTitle(base({ intent: "time_trend", dimension: "start_year", granularity: "year", chart: "line" }))).toBe("Pembrolizumab trials per year");
    expect(templateTitle(base({ intent: "ranking", dimension: "sponsor", limit: 10, entities: { drugs: [], conditions: ["melanoma"], sponsors: [], countries: [], start_year: null, end_year: null, limit: null } }))).toBe("Top 10 sponsors for Melanoma trials");
    expect(templateTitle(base({ intent: "network", dimension: null, edge_kind: "sponsor_drug", chart: "network_graph" }))).toBe("Sponsor–drug network for Pembrolizumab trials");
    expect(templateTitle(base({ intent: "comparison", arms: [{ label: "a", query: {} }, { label: "b", query: {} }] }))).toBe("a vs b: trials by phase");
    expect(templateTitle(base({ intent: "count", chart: "single_value", dimension: null }))).toBe("Pembrolizumab trials");
    expect(templateTitle(base({ intent: "lookup", chart: "scatter", dimension: null }))).toBe("Pembrolizumab trials: enrollment by start date");
  });
  it("summarises the plan for the titler", () => {
    expect(planSummary(base({ intent: "time_trend", dimension: "start_year", secondary: "phase", granularity: "year", chart: "line", entities: { drugs: ["pembrolizumab"], conditions: [], sponsors: [], countries: [], start_year: 2015, end_year: null, limit: null } })))
      .toBe("A line chart of the number of trials per year, split by phase, for pembrolizumab trials, started from 2015.");
    expect(planSummary(base({ intent: "lookup", chart: "scatter", dimension: null }))).toBe("A scatter chart of enrollment against start date, one point per trial, for pembrolizumab trials.");
    const psoriasis = { drugs: [], conditions: ["psoriasis"], sponsors: [], countries: [], start_year: null, end_year: null, limit: null };
    expect(planSummary(base({ intent: "count", chart: "single_value", dimension: null, recruiting_only: true, phase: "PHASE3", entities: psoriasis })))
      .toBe("The total number of recruiting phase 3 psoriasis trials.");
    expect(planSummary(base({ intent: "count", chart: "single_value", dimension: null, entities: { ...psoriasis, conditions: [], drugs: ["pembrolizumab", "nivolumab"], countries: ["Canada"], start_year: 2015 } })))
      .toBe("The total number of pembrolizumab or nivolumab trials in Canada, started from 2015.");
    expect(planSummary(base({ intent: "count", chart: "single_value", dimension: null, entities: { ...psoriasis, conditions: [] } }))).toBe("The total number of trials.");
    expect(planSummary(base({ dimension: "sponsor_class", metric: "enrollment_median", phase: "PHASE3", entities: { ...psoriasis, conditions: ["oncology"] } })))
      .toBe("A bar chart of the median enrollment by sponsor class, for phase 3 oncology trials.");
    expect(planSummary(base({ intent: "network", chart: "network_graph", dimension: null, edge_kind: "sponsor_drug", entities: { ...psoriasis, conditions: ["melanoma"] } })))
      .toBe("A network graph chart of which sponsors test which drugs, for melanoma trials.");
    expect(planSummary(base({ intent: "geographic", chart: "map", dimension: "country", recruiting_only: true, entities: { ...psoriasis, conditions: ["lupus"] } })))
      .toBe("A map chart of the number of trials by country, for recruiting lupus trials.");
    expect(planSummary(base({ intent: "comparison", chart: "grouped_bar", recruiting_only: true, entities: { ...psoriasis, conditions: [], countries: ["Germany", "France"] }, arms: [{ label: "Germany", query: {} }, { label: "France", query: {} }] })))
      .toBe("A grouped bar chart of the number of trials by phase, comparing Germany and France, counting only recruiting trials.");
  });
  it("subtitle states counts, truncation, counting rule and the data date", () => {
    const agg: Aggregate = { kind: "buckets", result: bucketize(SAMPLE, { dimension: "phase", metric: "trial_count" }) };
    expect(subtitle(base({}), ctx, agg)).toBe("12 trials on ClinicalTrials.gov · counted once per phase · 1 trial without a phase not shown · data as of 2026-10-08");
    expect(subtitle(base({ recruiting_only: true }), { ...ctx, total_count: 12480, fetched: 3000, truncated: true }, agg)).toBe("12,480 trials on ClinicalTrials.gov · based on the 3,000 most recently started · recruiting only · counted once per phase · 1 trial without a phase not shown · data as of 2026-10-08");
    const bySponsor: Aggregate = { kind: "buckets", result: bucketize(SAMPLE, { dimension: "sponsor_class", metric: "trial_count" }) };
    expect(subtitle(base({ dimension: "sponsor_class", phase: "PHASE3" }), ctx, bySponsor)).toBe("12 trials on ClinicalTrials.gov · phase 3 only · data as of 2026-10-08");
  });
  it("a comparison states each arm's total, since arms can share trials", () => {
    const agg: Aggregate = { kind: "buckets", result: bucketize(SAMPLE.filter((s) => s.phases.length), { dimension: "phase", metric: "trial_count" }) };
    const p = base({ intent: "comparison", chart: "grouped_bar", arms: [{ label: "pembrolizumab", query: {} }, { label: "nivolumab", query: {} }] });
    expect(subtitle(p, { ...ctx, total_count: 4707, arm_totals: [{ label: "pembrolizumab", total: 2973 }, { label: "nivolumab", total: 1734 }] }, agg))
      .toBe("Pembrolizumab 2,973 · Nivolumab 1,734 trials on ClinicalTrials.gov · counted once per phase · data as of 2026-10-08");
  });
  it("says which trials are left out for lack of a value", () => {
    const phase = bucketize(SAMPLE, { dimension: "phase", metric: "trial_count" });
    expect(notShown(base({}), { kind: "buckets", result: phase })).toEqual({ note: "1 trial without a phase is not shown.", subtitle: "1 trial without a phase not shown" });
    const median = bucketize(SAMPLE, { dimension: "phase", metric: "enrollment_median" });
    expect(notShown(base({ metric: "enrollment_median" }), { kind: "buckets", result: median })?.note).toBe("1 trial without an enrollment count and 1 trial without a phase are not shown.");
    const years = bucketize(SAMPLE, { dimension: "start_year", secondary: "phase", metric: "trial_count", granularity: "year" });
    expect(notShown(base({ intent: "time_trend", dimension: "start_year", secondary: "phase" }), { kind: "buckets", result: years })?.note).toBe("1 trial without a start date is not shown.");
    expect(notShown(base({ chart: "scatter" }), { kind: "points", ...scatterPoints(SAMPLE, null) })?.note).toBe("2 trials without a start date or an enrollment count are not shown.");
    expect(notShown(base({}), { kind: "buckets", result: bucketize(SAMPLE.filter((s) => s.phases.length), { dimension: "phase", metric: "trial_count" }) })).toBeNull();
  });
});

describe("buildVisualization", () => {
  it("bar over phases, with labels, keys and citations", () => {
    const v = valid(buildVisualization(base({}), { kind: "buckets", result: bucketize(SAMPLE, { dimension: "phase", metric: "trial_count" }) }, ctx, "Custom title"));
    expect(v.type).toBe("bar"); expect(v.title).toBe("Custom title");
    if (v.type !== "bar") return;
    expect(v.encoding.x).toEqual({ field: "phase", type: "ordinal", label: "Phase", order: ["Early Phase 1", "Phase 1", "Phase 2", "Phase 3", "Not applicable"] });
    expect(v.encoding.y).toEqual({ field: "trial_count", type: "quantitative", label: "Trials", unit: "trials" });
    expect(v.data[2]).toMatchObject({ phase: "Phase 2", phase_key: "PHASE2", trial_count: 4, study_count: 4 });
    expect(v.data[2]!.citations).toHaveLength(2);
  });
  it("ranking is a horizontal, value-sorted bar", () => {
    const v = valid(buildVisualization(base({ intent: "ranking", dimension: "sponsor", limit: 2 }), { kind: "buckets", result: bucketize(SAMPLE, { dimension: "sponsor", metric: "trial_count", limit: 2 }) }, ctx, null));
    if (v.type !== "bar") throw new Error(v.type);
    expect(v.encoding.orientation).toBe("horizontal"); expect(v.encoding.sort).toBe("value_desc"); expect(v.data.map((r) => r.sponsor)).toEqual(["Acme", "Merck"]);
  });
  it("a ranking over a closed dimension is sorted by value, ties in the dimension's order", () => {
    const v = valid(buildVisualization(base({ intent: "ranking", dimension: "phase" }), { kind: "buckets", result: bucketize(SAMPLE, { dimension: "phase", metric: "trial_count" }) }, ctx, null));
    if (v.type !== "bar") throw new Error(v.type);
    expect(v.encoding.sort).toBe("value_desc");
    expect(v.data.map((r) => [r.phase, r.trial_count])).toEqual([["Phase 2", 4], ["Phase 3", 4], ["Phase 1", 2], ["Early Phase 1", 1], ["Not applicable", 1]]);
    expect(v.encoding.x.order).toEqual(["Phase 2", "Phase 3", "Phase 1", "Early Phase 1", "Not applicable"]);
  });
  it("line over periods with a secondary series", () => {
    const r = bucketize(SAMPLE, { dimension: "start_year", secondary: "phase", metric: "trial_count", granularity: "year" });
    const v = valid(buildVisualization(base({ intent: "time_trend", chart: "line", dimension: "start_year", secondary: "phase", granularity: "year" }), { kind: "buckets", result: r }, ctx, null));
    if (v.type !== "line") throw new Error(v.type);
    expect(v.encoding.x).toEqual({ field: "period", type: "temporal", granularity: "year", label: "Start date" });
    expect(v.encoding.series).toEqual({ field: "series", label: "Phase", values: ["Early Phase 1", "Phase 1", "Phase 2", "Phase 3", "Not applicable"] });
    expect(v.data[0]).toMatchObject({ period: "2018", series: "Early Phase 1", trial_count: 0, study_count: 0, citations: [] });
  });
  it("grouped bar from merged arms", () => {
    const a = bucketize(SAMPLE.filter((s) => s.lead_sponsor.name === "Merck"), { dimension: "phase", metric: "trial_count" });
    const b = bucketize(SAMPLE.filter((s) => s.lead_sponsor.name === "Acme"), { dimension: "phase", metric: "trial_count" });
    const m = mergeArms([{ label: "Merck", result: a }, { label: "Acme", result: b }], { dimension: "phase", metric: "trial_count" });
    const v = valid(buildVisualization(base({ intent: "comparison", chart: "grouped_bar", arms: [{ label: "Merck", query: { spons: '"Merck"' } }, { label: "Acme", query: { spons: '"Acme"' } }] }), { kind: "buckets", result: m }, ctx, null));
    if (v.type !== "grouped_bar") throw new Error(v.type);
    expect(v.encoding.series).toEqual({ field: "series", label: "Sponsor", values: ["Merck", "Acme"] });
    const plain = valid(buildVisualization(base({ intent: "comparison", chart: "grouped_bar", arms: [{ label: "Merck", query: {} }, { label: "Acme", query: {} }] }), { kind: "buckets", result: m }, ctx, null));
    if (plain.type !== "grouped_bar") throw new Error(plain.type);
    expect(plain.encoding.series.label).toBe("Arm");
  });
  it("histogram over enrollment bins", () => {
    const v = valid(buildVisualization(base({ chart: "histogram", dimension: "enrollment" }), { kind: "buckets", result: bucketize(SAMPLE, { dimension: "enrollment", metric: "trial_count" }) }, ctx, null));
    if (v.type !== "histogram") throw new Error(v.type);
    expect(v.encoding.x.bins[0]).toEqual({ label: "1–50", min: 1, max: 50 }); expect(v.encoding.x.bins.at(-1)).toEqual({ label: "1001+", min: 1001, max: null });
  });
  it("map rows carry iso3", () => {
    const v = valid(buildVisualization(base({ intent: "geographic", chart: "map", dimension: "country" }), { kind: "buckets", result: bucketize(SAMPLE, { dimension: "country", metric: "trial_count" }) }, ctx, null));
    if (v.type !== "map") throw new Error(v.type);
    expect(v.data.find((r) => r.country === "Germany")).toMatchObject({ iso3: "DEU", trial_count: 2 });
  });
  it("scatter: one row per trial, citing itself", () => {
    const p = scatterPoints(SAMPLE, null);
    const v = valid(buildVisualization(base({ chart: "scatter" }), { kind: "points", ...p }, ctx, null));
    if (v.type !== "scatter") throw new Error(v.type);
    expect(v.encoding.color).toEqual({ field: "phase", label: "Phase", values: ["Early Phase 1", "Phase 1", "Phase 2", "Phase 3", "Not applicable"] });
    expect(v.data[0]).toMatchObject({ nct_id: "NCT00000012", enrollment: 900, phase: "Phase 3", study_count: 1 });
    expect(v.data[0]!.citations[0]).toMatchObject({ nct_id: "NCT00000012", field: "protocolSection.identificationModule.nctId" });
  });
  it("network: nodes, weighted edges with two-ended citations", () => {
    const g = buildGraph(SAMPLE, "sponsor_drug", 40);
    const v = valid(buildVisualization(base({ intent: "network", chart: "network_graph", dimension: null, edge_kind: "sponsor_drug" }), { kind: "graph", ...g }, ctx, null));
    if (v.type !== "network_graph") throw new Error(v.type);
    const e = v.data.edges.find((x) => x.source === "sponsor:merck" && x.target === "drug:pembrolizumab")!;
    expect(e.weight).toBe(4); expect(e.study_count).toBe(4); expect(e.citations).toHaveLength(2);
    expect(e.citations[0]!.excerpt).toBe('leadSponsor.name: "Merck" · meshes[].term: "pembrolizumab"');
    expect(v.encoding.nodes.kinds).toEqual([{ kind: "sponsor", label: "Sponsor" }, { kind: "drug", label: "Drug" }]);
  });
  it("table and single value", () => {
    const t = valid(buildVisualization(base({ intent: "lookup", chart: "table", dimension: null, limit: 3 }), { kind: "rows", studies: SAMPLE.slice(0, 3) }, ctx, null));
    if (t.type !== "table") throw new Error(t.type);
    expect(t.encoding.columns.map((c) => c.field)).toEqual(["nct_id", "title", "status", "phases", "start_date", "sponsor", "conditions", "enrollment"]);
    expect(t.data[0]).toMatchObject({ nct_id: "NCT00000001", phases: "Phase 3", study_count: 1 });
    expect(t.subtitle).toBe("12 trials on ClinicalTrials.gov · 3 most recently started shown · data as of 2026-10-08");
    const s = valid(buildVisualization(base({ intent: "count", chart: "single_value", dimension: null }), { kind: "value", total: 2973, studies: SAMPLE }, ctx, null));
    if (s.type !== "single_value") throw new Error(s.type);
    expect(s.data[0]).toMatchObject({ value: 2973, label: "trials", study_count: 2973 }); expect(s.data[0]!.citations).toHaveLength(2);
  });
});
