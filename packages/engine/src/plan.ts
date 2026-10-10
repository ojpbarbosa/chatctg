import type { ChartType, Dimension, EdgeKind, Granularity, Intent, Interpretation, Metric, Phase, QueryRequest } from "@chatctg/contracts";
import { essieAdvanced, essieTerms, type FetchQuery } from "@chatctg/ctgov";
import { asList } from "@chatctg/contracts";
import { QUESTION_SET, topK, type InterpretationAnswers } from "@chatctg/judgment";
import { DIMENSION_LABEL, PHASE_PHRASE } from "./dimensions";

export interface Entities { drugs: string[]; conditions: string[]; sponsors: string[]; countries: string[]; start_year: number | null; end_year: number | null; limit: number | null }
export interface Arm { label: string; query: FetchQuery }
export interface Plan {
  intent: Intent; chart: ChartType; dimension: Dimension | null; secondary: Dimension | null;
  metric: Metric; granularity: Granularity | null; edge_kind: EdgeKind | null;
  arms: Arm[]; limit: number | null; entities: Entities; recruiting_only: boolean;
  /** The phase every arm is restricted to, from the request or from Jev; null when none applied. */
  phase: Phase | null;
  notes: string[];
  interpretation: Interpretation;
}
export type PlanResult = { ok: true; plan: Plan } | { ok: false; reason: "not_answerable"; message: string; interpretation: Interpretation };
export interface PlanInput { answers: InterpretationAnswers; entities: Entities; request: QueryRequest; models: { judge: string; extractor: string; titler: string } }

export const THRESHOLDS = { in_scope: 0.5, intent_alternatives: 0.4, chart_named: 0.6, recruiting_only: 0.7, combination: 0.6, phase_filter: 0.5 } as const;
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

/**
 * The matrix from the spec: what the data shape of an intent can render. `scatter`, and `bar` for a geographic question, are in the set
 * only when the chart was asked for explicitly.
 * With a secondary dimension, `bar` stays allowed and the planner draws it as `stacked_bar`, and `histogram` stays allowed and the planner drops the secondary.
 */
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
      if (explicit) set.add("bar"); break;
    case "lookup":
      if (explicit) set.add("scatter"); break;
    default: break;
  }
  return [...set];
}

/** The allowed chart Jev gave the most probability to; null on a tie for the top, or when none of them has any. */
export function likeliestAllowed(allowed: ChartType[], probabilities: Partial<Record<ChartType, number>>): ChartType | null {
  const ranked = allowed.map((chart) => ({ chart, p: probabilities[chart] ?? 0 })).sort((x, y) => y.p - x.p);
  const [first, second] = ranked;
  if (!first || first.p <= 0 || (second && second.p === first.p)) return null;
  return first.chart;
}

/**
 * Jev's chart (or the request's) when the shape can draw it. Otherwise the allowed chart Jev rates most likely, else the intent's
 * default. The fallback is drawn from the charts allowed without an explicit ask, so it is never a scatter or a geographic bar: the
 * question asked for the chart it named, not for those.
 */
export function chooseChart(intent: Intent, dimension: Dimension | null, secondary: Dimension | null, chosen: ChartType, explicit: boolean, probabilities: Partial<Record<ChartType, number>>): { applied: ChartType; reason: string | null } {
  const drawable = allowedCharts(intent, dimension, secondary, true).includes(chosen);
  const unasked = allowedCharts(intent, dimension, secondary, false);
  if (drawable && (explicit || unasked.includes(chosen))) return { applied: chosen, reason: null };
  const likeliest = likeliestAllowed(unasked, probabilities);
  const applied = likeliest ?? defaultChart(intent, dimension, secondary);
  const question = intent.replace("_", " ");
  if (drawable) {
    return { applied, reason: chosen === "scatter" ? `scatter plots one point per trial and is only used when asked for; using ${applied}` : `${chosen} is only used for a ${question} question when asked for; using ${applied}` };
  }
  const what = `${question}${dimension ? ` over ${DIMENSION_LABEL[dimension].toLowerCase()}` : ""}`;
  return { applied, reason: likeliest ? `${chosen} cannot render a ${what}; the next most likely chart that can, ${applied}, is used` : `${chosen} cannot render a ${what}; using ${applied}` };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A judged value with Jev's probability for it, or null. */
export const judgedValue = <T extends string>(value: T | null, answer: { probabilities: Record<string, number> }): { value: T; p: number } | null =>
  value ? { value, p: answer.probabilities[value] ?? 1 } : null;

/** The intent to answer, Jev's probability for it and Jev's confidence. A caller-supplied intent is a decision already taken. */
export function judgedIntent(a: InterpretationAnswers, request: Pick<QueryRequest, "intent">): { value: Intent; p: number; confidence: number } {
  if (request.intent) return { value: request.intent, p: 1, confidence: 1 };
  return { value: a.intent.choice, p: a.intent.probabilities[a.intent.choice] ?? 0, confidence: a.intent.confidence };
}

export const inScope = (a: InterpretationAnswers, request: Pick<QueryRequest, "intent">): boolean => request.intent !== undefined || a.in_scope.noul >= THRESHOLDS.in_scope;
export const chartNamed = (a: InterpretationAnswers, request: Pick<QueryRequest, "chart">): boolean => request.chart !== undefined || a.chart_named.noul >= THRESHOLDS.chart_named;
export const recruitingOnly = (a: InterpretationAnswers, request: Pick<QueryRequest, "trial_status">): boolean =>
  request.trial_status === "RECRUITING" || (request.trial_status === undefined && a.recruiting_only.noul >= THRESHOLDS.recruiting_only);

/** What the chart is drawn over: the intent, the dimension and an optional second grouping. */
export interface Shape { intent: Intent; dimension: Dimension | null; secondary: Dimension | null }

/** Jev's dimensions made consistent with the intent; the notes say what changed. */
export function normalizeShape(intent: Intent, a: InterpretationAnswers): { shape: Shape; notes: string[] } {
  const notes: string[] = [];
  let dimension: Dimension | null = a.dimension.choice === "none" ? null : a.dimension.choice;
  let secondary: Dimension | null = a.secondary_dimension.choice === "none" ? null : a.secondary_dimension.choice;
  if (intent === "distribution" && dimension === "start_year") { intent = "time_trend"; notes.push("A split by start year is a time trend; shown as one."); }
  if (intent === "time_trend") { if (dimension && dimension !== "start_year" && !secondary) secondary = dimension; dimension = "start_year"; }
  if (intent === "geographic") dimension = "country";
  if (intent === "network" || intent === "count" || intent === "lookup") { dimension = null; secondary = null; }
  if ((intent === "distribution" || intent === "ranking" || intent === "comparison") && !dimension) { dimension = "phase"; notes.push("No attribute was named; grouped by phase."); }
  if (secondary === "start_year" && intent !== "time_trend") secondary = null;
  if (secondary === dimension) secondary = null;
  return { shape: { intent, dimension, secondary }, notes };
}

/** A second grouping only fits a time trend or a distribution. */
export function dropForeignSecondary(shape: Shape): { shape: Shape; note: string | null } {
  const { intent, secondary } = shape;
  if (!secondary || (intent !== "comparison" && intent !== "ranking" && intent !== "geographic")) return { shape, note: null };
  const what = intent === "geographic" ? "map" : intent;
  return { shape: { ...shape, secondary: null }, note: `A second grouping (${DIMENSION_LABEL[secondary].toLowerCase()}) is not shown for a ${what}.` };
}

/** The chart for a shape, and the shape it is drawn with: a bar holds one value per category, so a second grouping is stacked; a histogram has no series, so the second grouping goes. */
export function applyChart(shape: Shape, chosen: ChartType, explicit: boolean, probabilities: Partial<Record<ChartType, number>>): { applied: ChartType; reason: string | null; shape: Shape; note: string | null } {
  const { applied, reason } = chooseChart(shape.intent, shape.dimension, shape.secondary, chosen, explicit, probabilities);
  const { secondary } = shape;
  if (secondary && applied === "bar") {
    return { applied: "stacked_bar", reason: `a bar chart has one bar per category, so the split by ${DIMENSION_LABEL[secondary].toLowerCase()} is stacked; using stacked_bar`, shape, note: null };
  }
  if (secondary && applied === "histogram") {
    return { applied, reason, shape: { ...shape, secondary: null }, note: `A second grouping (${DIMENSION_LABEL[secondary].toLowerCase()}) is not shown in a histogram.` };
  }
  return { applied, reason, shape, note: null };
}

/**
 * The phase every arm is restricted to. The request's trial_phase wins. A phase Jev found named applies when its probability reaches
 * the threshold, unless the chart splits by phase, which this checks on the final shape: a split by phase filtered to one phase would
 * be a single bar.
 */
export function phaseFilter(a: InterpretationAnswers, request: Pick<QueryRequest, "trial_phase">, shape: Shape): { phase: Phase | null; note: string | null } {
  if (request.trial_phase) return { phase: request.trial_phase, note: null };
  const named: Phase | null = a.phase_filter.choice === "none" ? null : a.phase_filter.choice;
  if (named === null) return { phase: null, note: null };
  const pNamed = a.phase_filter.probabilities[named] ?? 0;
  if (pNamed < THRESHOLDS.phase_filter) return { phase: null, note: `A phase was mentioned but not clearly enough to filter on (p=${pNamed.toFixed(2)}).` };
  if (shape.dimension === "phase" || shape.secondary === "phase") return { phase: null, note: `${cap(PHASE_PHRASE[named])} was named, but phases are what the chart splits by, so no phase filter was applied.` };
  return { phase: named, note: null };
}

/** What the planner decides from the judgment alone, before the names are read; a comparison is assumed to find its arms. */
export function provisionalPlan(a: InterpretationAnswers, request: Pick<QueryRequest, "intent" | "chart" | "trial_phase"> = {}): { shape: Shape; chosen: ChartType; chart: ChartType; phase: Phase | null } {
  const shape = dropForeignSecondary(normalizeShape(judgedIntent(a, request).value, a).shape).shape;
  const chosen = request.chart ?? a.chart.choice;
  const drawn = applyChart(shape, chosen, chartNamed(a, request), a.chart.probabilities);
  return { shape: drawn.shape, chosen, chart: drawn.applied, phase: phaseFilter(a, request, drawn.shape).phase };
}

/** The chart the planner would apply to this judgment before the names in the question are read. */
export const provisionalChart = (a: InterpretationAnswers, request: Pick<QueryRequest, "intent" | "chart"> = {}): ChartType => provisionalPlan(a, request).chart;

export function plan(input: PlanInput): PlanResult {
  const { answers: a, request, models } = input;
  // Request fields are decisions already taken: they replace what was extracted, field by field.
  const provided_fields = (["drug_name", "condition", "sponsor", "country", "trial_phase", "trial_status", "start_year", "end_year", "intent", "chart"] as const).filter((k) => request[k] !== undefined) as string[];
  const entities: Entities = {
    ...input.entities,
    ...(request.drug_name !== undefined ? { drugs: asList(request.drug_name) } : {}),
    ...(request.condition !== undefined ? { conditions: asList(request.condition) } : {}),
    ...(request.sponsor !== undefined ? { sponsors: asList(request.sponsor) } : {}),
    ...(request.country !== undefined ? { countries: asList(request.country) } : {}),
    ...(request.start_year !== undefined ? { start_year: request.start_year } : {}),
    ...(request.end_year !== undefined ? { end_year: request.end_year } : {}),
  };

  // 1. Scope and intent, then 2. dimensions, normalized by intent.
  const judged = judgedIntent(a, request);
  const normalized = normalizeShape(judged.value, a);
  const notes = normalized.notes;
  const { dimension } = normalized.shape;
  let { intent, secondary } = normalized.shape;

  const metric: Metric = intent === "network" || intent === "lookup" || intent === "count" ? "trial_count" : a.metric.choice;
  const granularity: Granularity | null = dimension === "start_year" ? a.granularity.choice : null;
  const edge_kind: EdgeKind | null = intent === "network" ? a.edge_kind.choice : null;
  const recruiting_only = recruitingOnly(a, request);
  const combination: boolean | null = entities.drugs.length >= 2 && intent !== "comparison" ? a.combination.noul >= THRESHOLDS.combination : null;

  // 3. Arms: who each arm is about. Their registry queries are built in step 6, once the phase filter is known.
  let armEntities: { label: string; over: Partial<Entities> }[];
  if (intent === "comparison") {
    const axis = (["drugs", "conditions", "sponsors", "countries"] as const).find((k) => entities[k].length >= 2);
    if (!axis) { intent = "distribution"; notes.push("A comparison needs two named things; one was found, so this is shown as a distribution."); armEntities = [{ label: entityLabel(entities), over: {} }]; }
    else armEntities = entities[axis].map((member) => ({ label: member, over: { [axis]: [member] } }));
  } else {
    armEntities = [{ label: entityLabel(entities), over: {} }];
  }

  // The foreign second grouping goes after the comparison fallback, so a comparison that became a distribution keeps it.
  const kept = dropForeignSecondary({ intent, dimension, secondary });
  secondary = kept.shape.secondary;
  if (kept.note) notes.push(kept.note);

  // 4. Limit.
  let limit: number | null = entities.limit;
  if (limit === null) {
    if (intent === "ranking") limit = dimension === "country" ? DEFAULT_LIMITS.country_bar : DEFAULT_LIMITS.ranking;
    else if (intent === "network") limit = DEFAULT_LIMITS.network;
    else if (intent === "lookup") limit = DEFAULT_LIMITS.table;
    else if ((intent === "distribution" || intent === "comparison") && dimension && OPEN_DIMENSIONS.includes(dimension)) limit = DEFAULT_LIMITS.open_distribution;
  }

  // 5. Chart: Jev's choice, validated against the shape, with Jev's next most likely allowed chart as the fallback.
  const chosen: ChartType = request.chart ?? a.chart.choice;
  const explicit = chartNamed(a, request);
  const drawn = applyChart({ intent, dimension, secondary }, chosen, explicit, a.chart.probabilities);
  const { applied, reason } = drawn;
  secondary = drawn.shape.secondary;
  if (drawn.note) notes.push(drawn.note);
  if (intent === "geographic" && applied === "bar" && limit === null) limit = DEFAULT_LIMITS.country_bar;

  // 6. Phase filter and queries.
  const { phase, note: phaseNote } = phaseFilter(a, request, drawn.shape);
  if (phaseNote) notes.push(phaseNote);
  const common = (over: Partial<Entities>): FetchQuery => {
    const e = { ...entities, ...over };
    const q: FetchQuery = {};
    if (e.drugs.length) q.intr = essieTerms(e.drugs, combination ? "AND" : "OR");
    if (e.conditions.length) q.cond = essieTerms(e.conditions, "OR");
    if (e.sponsors.length) q.spons = essieTerms(e.sponsors, "OR");
    if (e.countries.length) q.locn = essieTerms(e.countries, "OR");
    const status = request.trial_status ?? (recruiting_only ? "RECRUITING" : undefined);
    if (status) q.overallStatus = status;
    const advanced = essieAdvanced({ ...(phase ? { phase } : {}), ...(e.start_year !== null ? { startYear: e.start_year } : {}), ...(e.end_year !== null ? { endYear: e.end_year } : {}) });
    if (advanced) q.advanced = advanced;
    return q;
  };
  const arms: Arm[] = armEntities.map((x) => ({ label: x.label, query: common(x.over) }));

  const interpretation: Interpretation = {
    intent: { value: intent, p: judged.p, confidence: judged.confidence, alternatives: judged.confidence < THRESHOLDS.intent_alternatives ? (topK(a.intent.probabilities, 3) as { value: Intent; p: number }[]) : [] },
    dimension: judgedValue(dimension, a.dimension), secondary_dimension: judgedValue(secondary, a.secondary_dimension),
    chart: { chosen, applied, explicit, reason },
    metric, granularity, edge_kind,
    entities: { drugs: entities.drugs, conditions: entities.conditions, sponsors: entities.sponsors, countries: entities.countries },
    time_window: { start_year: entities.start_year, end_year: entities.end_year },
    limit: entities.limit, recruiting_only, combination, phase_filter: phase, provided_fields,
    question_set: { id: QUESTION_SET.id, version: QUESTION_SET.version }, models,
  };

  if (!inScope(a, request)) {
    return { ok: false, reason: "not_answerable", message: "This does not look like a question the clinical-trials registry can answer.", interpretation: { ...interpretation, chart: { ...interpretation.chart, applied: null } } };
  }
  if (intent === "other") {
    return { ok: false, reason: "not_answerable", message: "No chart answers this question; try asking for a trend, a split, a comparison, a ranking, a map, a network, a count or a list.", interpretation: { ...interpretation, chart: { ...interpretation.chart, applied: null } } };
  }

  return { ok: true, plan: { intent, chart: applied, dimension, secondary, metric, granularity, edge_kind, arms, limit, entities, recruiting_only, phase, notes, interpretation } };
}

/** "Pembrolizumab", "Pembrolizumab, Melanoma", or "All trials". */
export function entityLabel(e: Entities): string {
  const parts = [...e.drugs, ...e.conditions, ...e.sponsors, ...e.countries];
  return parts.length ? parts.map(cap).join(", ") : "All trials";
}

export function armFilters(arm: Arm): Record<string, string> {
  const out: Record<string, string> = {};
  const q = arm.query;
  if (q.intr) out["query.intr"] = q.intr; if (q.cond) out["query.cond"] = q.cond; if (q.spons) out["query.spons"] = q.spons; if (q.locn) out["query.locn"] = q.locn;
  if (q.overallStatus) out["filter.overallStatus"] = q.overallStatus; if (q.advanced) out["filter.advanced"] = q.advanced;
  return out;
}
