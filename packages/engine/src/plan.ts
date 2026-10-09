import type { ChartType, Dimension, EdgeKind, Granularity, Intent, Interpretation, Metric, QueryRequest } from "@cheiron/contracts";
import { essieAdvanced, essieTerms, type FetchQuery } from "@cheiron/ctgov";
import { asList } from "@cheiron/contracts";
import { QUESTION_SET, topK, type InterpretationAnswers } from "@cheiron/judgment";
import { DIMENSION_LABEL } from "./dimensions";

export interface Entities { drugs: string[]; conditions: string[]; sponsors: string[]; countries: string[]; start_year: number | null; end_year: number | null; limit: number | null }
export interface Arm { label: string; query: FetchQuery }
export interface Plan {
  intent: Intent; chart: ChartType; dimension: Dimension | null; secondary: Dimension | null;
  metric: Metric; granularity: Granularity | null; edge_kind: EdgeKind | null;
  arms: Arm[]; limit: number | null; entities: Entities; recruiting_only: boolean; notes: string[];
  interpretation: Interpretation;
}
export type PlanResult = { ok: true; plan: Plan } | { ok: false; reason: "not_answerable"; message: string; interpretation: Interpretation };
export interface PlanInput { answers: InterpretationAnswers; entities: Entities; request: QueryRequest; models: { judge: string; extractor: string; titler: string } }

export const THRESHOLDS = { in_scope: 0.5, intent_alternatives: 0.4, chart_named: 0.6, recruiting_only: 0.7, combination: 0.6 } as const;
export const DEFAULT_LIMITS = { ranking: 10, country_bar: 15, table: 25, network: 40, open_distribution: 10 } as const;
const OPEN_DIMENSIONS: Dimension[] = ["sponsor", "drug", "condition", "country"];

export function defaultChart(intent: Intent, dimension: Dimension | null, secondary: Dimension | null): ChartType {
  switch (intent) {
    case "time_trend": return "line";
    case "distribution":
      if (dimension === "enrollment") return "histogram";
      if (dimension === "start_year") return "line";
      return secondary ? "stacked_bar" : "bar";
    case "comparison": return dimension === "start_year" ? "line" : "grouped_bar";
    case "ranking": return "bar";
    case "geographic": return "map";
    case "network": return "network_graph";
    case "count": return "single_value";
    case "lookup": return "table";
    case "other": return "table";
  }
}

/** The matrix from the spec: what the data shape of an intent can render. */
export function allowedCharts(intent: Intent, dimension: Dimension | null, secondary: Dimension | null, explicit: boolean): ChartType[] {
  const set = new Set<ChartType>([defaultChart(intent, dimension, secondary)]);
  switch (intent) {
    case "time_trend":
      set.add("bar"); if (secondary) set.add("stacked_bar"); if (explicit) set.add("scatter"); break;
    case "distribution":
      set.add("bar");
      if (dimension === "enrollment" || dimension === "start_year") set.add("histogram");
      if (dimension === "start_year") set.add("line");
      if (secondary) { set.add("stacked_bar"); set.add("grouped_bar"); }
      if (explicit) set.add("scatter"); break;
    case "comparison":
      set.add("grouped_bar"); set.add("stacked_bar"); if (dimension === "start_year") set.add("line"); if (explicit) set.add("scatter"); break;
    case "ranking":
      set.add("bar"); if (dimension === "country") set.add("map"); break;
    case "geographic":
      set.add("map"); set.add("bar"); break;
    default: break;
  }
  return [...set];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function plan(input: PlanInput): PlanResult {
  const { answers: a, request, models } = input;
  const notes: string[] = [];
  // Request fields are decisions already taken: they replace what was extracted, field by field.
  const provided_fields = (["drug_name", "condition", "sponsor", "country", "trial_phase", "status", "start_year", "end_year", "intent", "chart"] as const).filter((k) => request[k] !== undefined) as string[];
  const entities: Entities = {
    ...input.entities,
    ...(request.drug_name !== undefined ? { drugs: asList(request.drug_name) } : {}),
    ...(request.condition !== undefined ? { conditions: asList(request.condition) } : {}),
    ...(request.sponsor !== undefined ? { sponsors: asList(request.sponsor) } : {}),
    ...(request.country !== undefined ? { countries: asList(request.country) } : {}),
    ...(request.start_year !== undefined ? { start_year: request.start_year } : {}),
    ...(request.end_year !== undefined ? { end_year: request.end_year } : {}),
  };

  // 1. Scope and intent. A caller-supplied intent is a decision already taken.
  let intent: Intent = request.intent ?? a.intent.choice;
  const intentP = request.intent ? 1 : (a.intent.probabilities[intent] ?? 0);
  const intentConfidence = request.intent ? 1 : a.intent.confidence;

  // 2. Dimensions, normalized by intent.
  let dimension: Dimension | null = a.dimension.choice === "none" ? null : a.dimension.choice;
  let secondary: Dimension | null = a.secondary_dimension.choice === "none" ? null : a.secondary_dimension.choice;
  if (intent === "distribution" && dimension === "start_year") { intent = "time_trend"; notes.push("A split by start year is a time trend; shown as one."); }
  if (intent === "time_trend") { if (dimension && dimension !== "start_year" && !secondary) secondary = dimension; dimension = "start_year"; }
  if (intent === "geographic") dimension = "country";
  if (intent === "network" || intent === "count" || intent === "lookup") { dimension = null; secondary = null; }
  if ((intent === "distribution" || intent === "ranking" || intent === "comparison") && !dimension) { dimension = "phase"; notes.push("No attribute was named; grouped by phase."); }
  if (secondary === "start_year" && intent !== "time_trend") secondary = null;
  if (secondary === dimension) secondary = null;
  if (secondary && (intent === "comparison" || intent === "ranking" || intent === "geographic")) {
    notes.push(`A second grouping (${DIMENSION_LABEL[secondary].toLowerCase()}) is not shown for a ${intent}.`);
    secondary = null;
  }

  const metric: Metric = intent === "network" || intent === "lookup" || intent === "count" ? "trial_count" : a.metric.choice;
  const granularity: Granularity | null = dimension === "start_year" ? a.granularity.choice : null;
  const edge_kind: EdgeKind | null = intent === "network" ? a.edge_kind.choice : null;
  const recruiting_only = request.status === "RECRUITING" || (request.status === undefined && a.recruiting_only.noul >= THRESHOLDS.recruiting_only);
  const combination: boolean | null = entities.drugs.length >= 2 && intent !== "comparison" ? a.combination.noul >= THRESHOLDS.combination : null;

  // 3. Arms.
  const common = (over: Partial<Entities>): FetchQuery => {
    const e = { ...entities, ...over };
    const q: FetchQuery = {};
    if (e.drugs.length) q.intr = essieTerms(e.drugs, combination ? "AND" : "OR");
    if (e.conditions.length) q.cond = essieTerms(e.conditions, "OR");
    if (e.sponsors.length) q.spons = essieTerms(e.sponsors, "OR");
    if (e.countries.length) q.locn = essieTerms(e.countries, "OR");
    const status = request.status ?? (recruiting_only ? "RECRUITING" : undefined);
    if (status) q.overallStatus = status;
    const advanced = essieAdvanced({ ...(request.trial_phase ? { phase: request.trial_phase } : {}), ...(e.start_year !== null ? { startYear: e.start_year } : {}), ...(e.end_year !== null ? { endYear: e.end_year } : {}) });
    if (advanced) q.advanced = advanced;
    return q;
  };
  let arms: Arm[];
  if (intent === "comparison") {
    const axis = (["drugs", "conditions", "sponsors", "countries"] as const).find((k) => entities[k].length >= 2);
    if (!axis) { intent = "distribution"; notes.push("A comparison needs two named things; one was found, so this is shown as a distribution."); arms = [{ label: entityLabel(entities), query: common({}) }]; }
    else arms = entities[axis].map((member) => ({ label: member, query: common({ [axis]: [member] }) }));
  } else {
    arms = [{ label: entityLabel(entities), query: common({}) }];
  }

  // 4. Limit.
  let limit: number | null = entities.limit;
  if (limit === null) {
    if (intent === "ranking") limit = dimension === "country" ? DEFAULT_LIMITS.country_bar : DEFAULT_LIMITS.ranking;
    else if (intent === "network") limit = DEFAULT_LIMITS.network;
    else if (intent === "lookup") limit = DEFAULT_LIMITS.table;
    else if ((intent === "distribution" || intent === "comparison") && dimension && OPEN_DIMENSIONS.includes(dimension)) limit = DEFAULT_LIMITS.open_distribution;
  }

  // 5. Chart: Jev's choice, validated against the shape.
  const chosen: ChartType = request.chart ?? a.chart.choice;
  const explicit = request.chart !== undefined || a.chart_named.noul >= THRESHOLDS.chart_named;
  const allowed = allowedCharts(intent, dimension, secondary, explicit);
  let applied = chosen; let reason: string | null = null;
  if (!allowed.includes(chosen)) {
    applied = defaultChart(intent, dimension, secondary);
    reason = `${chosen} cannot render a ${intent.replace("_", " ")}${dimension ? ` over ${DIMENSION_LABEL[dimension].toLowerCase()}` : ""}; using ${applied}`;
  } else if (chosen === "scatter" && !explicit) {
    applied = defaultChart(intent, dimension, secondary);
    reason = "scatter plots one point per trial and is only used when asked for; using " + applied;
  }

  if (intent === "geographic" && applied === "bar" && limit === null) limit = DEFAULT_LIMITS.country_bar;

  const p = (d: Dimension | null, ans: { probabilities: Record<string, number> }) => (d ? { value: d, p: ans.probabilities[d] ?? 1 } : null);
  const interpretation: Interpretation = {
    intent: { value: intent, p: intentP, confidence: intentConfidence, alternatives: intentConfidence < THRESHOLDS.intent_alternatives ? (topK(a.intent.probabilities, 3) as { value: Intent; p: number }[]) : [] },
    dimension: p(dimension, a.dimension), secondary_dimension: p(secondary, a.secondary_dimension),
    chart: { chosen, applied, explicit, reason },
    metric, granularity, edge_kind,
    entities: { drugs: entities.drugs, conditions: entities.conditions, sponsors: entities.sponsors, countries: entities.countries },
    time_window: { start_year: entities.start_year, end_year: entities.end_year },
    limit: entities.limit, recruiting_only, combination, provided_fields,
    question_set: { id: QUESTION_SET.id, version: QUESTION_SET.version }, models,
  };

  if (!request.intent && a.in_scope.noul < THRESHOLDS.in_scope) {
    return { ok: false, reason: "not_answerable", message: "This does not look like a question the clinical-trials registry can answer.", interpretation: { ...interpretation, chart: { ...interpretation.chart, applied: null } } };
  }
  if (intent === "other") {
    return { ok: false, reason: "not_answerable", message: "No chart answers this question; try asking for a trend, a split, a comparison, a ranking, a map, a network, a count or a list.", interpretation: { ...interpretation, chart: { ...interpretation.chart, applied: null } } };
  }

  return { ok: true, plan: { intent, chart: applied, dimension, secondary, metric, granularity, edge_kind, arms, limit, entities, recruiting_only, notes, interpretation } };
}

/** "Pembrolizumab", "Pembrolizumab · Melanoma", or "All trials". */
export function entityLabel(e: Entities): string {
  const parts = [...e.drugs, ...e.conditions, ...e.sponsors, ...e.countries];
  return parts.length ? parts.map(cap).join(" · ") : "All trials";
}

export function armFilters(arm: Arm): Record<string, string> {
  const out: Record<string, string> = {};
  const q = arm.query;
  if (q.intr) out["query.intr"] = q.intr; if (q.cond) out["query.cond"] = q.cond; if (q.spons) out["query.spons"] = q.spons; if (q.locn) out["query.locn"] = q.locn;
  if (q.overallStatus) out["filter.overallStatus"] = q.overallStatus; if (q.advanced) out["filter.advanced"] = q.advanced;
  return out;
}
