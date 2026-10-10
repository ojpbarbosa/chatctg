import { describe, expect, it } from "vitest";
import { QueryResponse, Visualization, ErrorBody } from "./response";
import { CHART_TYPES } from "./enums";
import { Judged } from "./events";
import { jsonSchemas } from "./json-schema";

const citation = { nct_id: "NCT01234567", title: "A study", field: "protocolSection.designModule.phases", excerpt: "PHASE3" };
const row = (extra: Record<string, unknown>) => ({ study_count: 1, citations: [citation], ...extra });

const meta = {
  query: "q",
  interpretation: {
    intent: { value: "distribution", p: 0.8, confidence: 0.7, alternatives: [{ value: "distribution", p: 0.8 }] },
    dimension: { value: "phase", p: 0.9 },
    secondary_dimension: null,
    chart: { chosen: "bar", applied: "bar", explicit: false, reason: null },
    metric: "trial_count", granularity: null, edge_kind: null,
    entities: { drugs: ["pembrolizumab"], conditions: [], sponsors: [], countries: [] },
    time_window: { start_year: null, end_year: null },
    limit: null, recruiting_only: false, combination: null, phase_filter: null,
    provided_fields: [],
    question_set: { id: "query-interpretation", version: 2 },
    models: { judge: "jev-latest", extractor: "gpt-5.4-nano", titler: "gpt-5.4-nano" },
  },
  arms: [{ label: "pembrolizumab", filters: { "query.intr": "\"pembrolizumab\"" } }],
  source: { name: "clinicaltrials.gov", api_version: "2.0.5", data_timestamp: "2026-10-08T09:00:05", requests: [{ url: "https://x", total_count: 10, fetched: 10 }] },
  coverage: { total_count: 10, fetched_count: 10, truncated: false, sorted_by: "StartDate:desc", studies_without_value: 0, omitted_categories: 0 },
  units: { y: "trials" }, granularity: null,
  timing: { jev_ms: 1, judged_ms: 1, extract_ms: 1, fetch_ms: 1, title_ms: 1, aggregate_ms: 1, total_ms: 5 },
  notes: [], warnings: [], version: "chatctg/0.1.0",
};

describe("Visualization", () => {
  it("accepts a bar spec", () => {
    const v = {
      type: "bar", title: "t", subtitle: "s",
      encoding: { x: { field: "phase", type: "ordinal", label: "Phase", order: ["PHASE1"] }, y: { field: "trial_count", type: "quantitative", label: "Trials", unit: "trials" }, orientation: "vertical", sort: "x_order" },
      data: [row({ phase: "PHASE1", trial_count: 3 })],
    };
    expect(Visualization.safeParse(v).success).toBe(true);
  });

  it("accepts a network spec", () => {
    const v = {
      type: "network_graph", title: "t", subtitle: "s",
      encoding: { nodes: { id_field: "id", label_field: "label", kind_field: "kind", size_field: "size", kinds: [{ kind: "sponsor", label: "Sponsor" }] }, edges: { source_field: "source", target_field: "target", weight_field: "weight" }, layout: "force" },
      data: { nodes: [{ id: "sponsor:merck", label: "Merck", kind: "sponsor", size: 3, study_count: 3 }], edges: [{ source: "sponsor:merck", target: "drug:x", weight: 2, study_count: 2, citations: [citation] }] },
    };
    expect(Visualization.safeParse(v).success).toBe(true);
  });

  it("lists the ten first chart types, then the grid, timeline and flow types", () => {
    expect(CHART_TYPES).toEqual(["bar", "grouped_bar", "stacked_bar", "line", "histogram", "scatter", "network_graph", "map", "table", "single_value", "bubble"]);
  });

  it("accepts a bubble spec over two categorical axes, and requires its size channel", () => {
    const v = {
      type: "bubble", title: "t", subtitle: "s",
      encoding: { x: { field: "x", type: "ordinal", label: "Phase", order: ["Phase 1"] }, y: { field: "y", type: "ordinal", label: "Sponsor class", order: ["Industry"] }, size: { field: "trial_count", label: "Trials", unit: "trials" } },
      data: [row({ x: "Phase 1", x_key: "PHASE1", y: "Industry", y_key: "INDUSTRY", trial_count: 3 })],
    };
    expect(Visualization.safeParse(v).success).toBe(true);
    const { size: _, ...unsized } = v.encoding;
    expect(Visualization.safeParse({ ...v, encoding: unsized }).success).toBe(false);
  });

  it("rejects a single_value with two rows", () => {
    const v = { type: "single_value", title: "t", subtitle: "s", encoding: { value: { field: "value", label: "Trials", unit: "trials" } }, data: [row({ value: 1, label: "a" }), row({ value: 2, label: "b" })] };
    expect(Visualization.safeParse(v).success).toBe(false);
  });
});

describe("Judged", () => {
  const judged = {
    intent: { value: "geographic", p: 0.9 }, dimension: { value: "country", p: 0.5 }, secondary_dimension: null,
    chart: { chosen: "bar", provisional: "map" }, chart_named: false, recruiting_only: true, phase_filter: null, jev_ms: 180,
  };
  it("accepts the early judgment", () => expect(Judged.safeParse(judged).success).toBe(true));
  it("rejects a provisional chart outside the chart types", () => expect(Judged.safeParse({ ...judged, chart: { chosen: "bar", provisional: "pie" } }).success).toBe(false));
});

describe("QueryResponse", () => {
  it("accepts a null visualization with meta", () => {
    expect(QueryResponse.safeParse({ visualization: null, meta }).success).toBe(true);
  });
  it("exports JSON Schema for request and response", () => {
    const s = jsonSchemas();
    expect(s.request).toHaveProperty("properties.query");
    expect(s.response).toHaveProperty("properties.visualization");
  });
  it("requires the moment the judgment landed in the timing", () => {
    const { judged_ms: _, ...timing } = meta.timing;
    expect(QueryResponse.safeParse({ visualization: null, meta: { ...meta, timing } }).success).toBe(false);
  });
  it("shapes errors", () => {
    expect(ErrorBody.safeParse({ error: { code: "not_answerable", message: "m" } }).success).toBe(true);
    expect(ErrorBody.safeParse({ error: { code: "nope", message: "m" } }).success).toBe(false);
  });
});
