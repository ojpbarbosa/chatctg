import type { Citation, DataRow, Dimension, EdgeKind, Metric, Visualization } from "@chatctg/contracts";
import { iso3, type Study } from "@chatctg/ctgov";
import type { Bucketized } from "./aggregate/buckets";
import { KIND_FIELD, type GraphEdge, type GraphNode } from "./aggregate/graph";
import type { Point } from "./aggregate/points";
import { citeBucket, citeEdge, citeSelf, mostRecent } from "./cite";
import { bucketLabel, conditionIdentity, DIMENSION_LABEL, DIMENSION_LABEL_PLURAL, ENROLLMENT_BINS, fixedOrder, PHASE_PHRASE } from "./dimensions";
import { entityLabel, type Plan } from "./plan";

export type Aggregate =
  | { kind: "buckets"; result: Bucketized }
  | { kind: "points"; points: Point[]; dropped: number; withoutValue: number }
  | { kind: "graph"; nodes: GraphNode[]; edges: GraphEdge[]; kinds: { kind: string; label: string }[]; prunedEdges: number }
  | { kind: "rows"; studies: Study[] }
  | { kind: "value"; total: number; studies: Study[] };
export interface SpecContext {
  total_count: number; fetched: number; truncated: boolean; data_timestamp: string; citations_per_point: number;
  /** The registry's total per arm; a comparison states each, since the arms can share trials. */
  arm_totals: { label: string; total: number }[];
}

export const METRIC_LABEL: Record<Metric, string> = { trial_count: "Trials", enrollment_total: "Participants enrolled", enrollment_median: "Median enrollment" };
export const METRIC_UNIT: Record<Metric, "trials" | "participants"> = { trial_count: "trials", enrollment_total: "participants", enrollment_median: "participants" };
export const EDGE_LABEL: Record<EdgeKind, string> = { sponsor_drug: "Sponsor to drug", drug_drug: "Drug with drug", condition_drug: "Condition to drug", sponsor_condition: "Sponsor to condition", sponsor_collaborator: "Sponsor to collaborator" };
/** A relationship in words, for the titler: "which sponsors test which drugs" titles better than "sponsor to drug pairs". */
const EDGE_PHRASE: Record<EdgeKind, string> = {
  sponsor_drug: "which sponsors test which drugs", drug_drug: "which drugs are tested together in the same trials", condition_drug: "which drugs are tested for which conditions",
  sponsor_condition: "which sponsors study which conditions", sponsor_collaborator: "which lead sponsors work with which collaborators",
};
const METRIC_PHRASE: Record<Metric, string> = { trial_count: "the number of trials", enrollment_total: "the total enrollment", enrollment_median: "the median enrollment" };
const fmt = (n: number) => n.toLocaleString("en-US");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const trials = (n: number) => `${fmt(n)} ${n === 1 ? "trial" : "trials"}`;
/** "a", "a and b", "a, b and c". */
const listed = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? ""));
/** What a study lacks when it has no value for a dimension: "1 trial without a phase". */
const WITHOUT: Record<Dimension, string> = {
  phase: "a phase", status: "a status", sponsor_class: "a sponsor class", sponsor: "a lead sponsor", intervention_type: "an intervention",
  drug: "a drug", condition: "a condition", country: "a location country", start_year: "a start date", enrollment: "an enrollment count",
  study_type: "a study type", sex: "a sex", age_group: "an age group", none: "a value",
};
const SINGULAR_ENDINGS: [string, string][] = [["ies", "y"], ["uses", "us"], ["sses", "ss"], ["xes", "x"], ["s", ""]];
/** "countries" to "country", "statuses" to "status", "sponsor classes" to "sponsor class", "sexes" to "sex", "phases" to "phase": the first ending that matches. */
export const singular = (plural: string): string => {
  const hit = SINGULAR_ENDINGS.find(([end]) => plural.endsWith(end));
  return hit ? plural.slice(0, -hit[0].length) + hit[1] : plural;
};
/** The one place a row is assembled: cells plus the two fields every row carries (the contract's index signature cannot express the mix). */
const row = (cells: Record<string, string | number | null>, study_count: number, citations: Citation[]): DataRow => ({ ...cells, study_count, citations }) as DataRow;

export function templateTitle(p: Plan): string {
  const named = entityLabel(p.entities) !== "All trials";
  const e = named ? entityLabel(p.entities) : "All";          // "All trials by phase", not "All trials trials by phase"
  const forE = named ? ` for ${e} trials` : "";
  const dim = p.dimension ? DIMENSION_LABEL[p.dimension].toLowerCase() : "";
  const sec = p.secondary ? ` and ${DIMENSION_LABEL[p.secondary].toLowerCase()}` : "";
  const measure = p.metric === "trial_count" ? "trials" : METRIC_LABEL[p.metric].toLowerCase();
  if (p.chart === "scatter") return `${e} trials: enrollment by start date`;
  switch (p.intent) {
    case "time_trend": return `${e} ${measure} per ${p.granularity ?? "year"}${p.secondary ? ` by ${DIMENSION_LABEL[p.secondary].toLowerCase()}` : ""}`;
    case "distribution": return `${e} ${measure} by ${dim}${sec}`;
    case "comparison": return `${p.arms.map((a) => a.label).join(" vs ")}: ${measure} by ${dim}`;
    case "ranking": return `Top ${p.limit ?? 10} ${p.dimension ? DIMENSION_LABEL_PLURAL[p.dimension] : "categories"}${forE}`;
    case "geographic": return `${e} ${measure} by country`;
    case "network": return `${p.edge_kind ? EDGE_LABEL[p.edge_kind] : "Relationship"} network${forE}`;
    case "count": case "lookup": case "other": return `${e} trials`;
  }
}

/** The trials a plan covers, filters first: "recruiting phase 3 psoriasis trials", "pembrolizumab or nivolumab trials in Canada", or just "trials". */
function trialsPhrase(p: Plan, withEntities: boolean): string {
  const e = p.entities;
  const drugs = e.drugs.join(p.arms[0]?.query.intr?.includes(" AND ") ? " plus " : " or ");
  const names = withEntities ? [drugs, e.conditions.join(" or "), e.sponsors.join(" or ")] : [];
  const where = withEntities && e.countries.length ? ` in ${e.countries.join(" or ")}` : "";
  return [p.recruiting_only ? "recruiting" : "", p.phase ? PHASE_PHRASE[p.phase] : "", ...names, "trials"].filter(Boolean).join(" ") + where;
}

/**
 * One sentence the titler can work from: the measure, the split, the trials covered and the window.
 * A count is the total number of some trials, so it is described as those trials, not as a chart of one value.
 */
export function planSummary(p: Plan): string {
  const e = p.entities;
  const window = e.start_year !== null && e.end_year !== null ? [`started ${e.start_year} to ${e.end_year}`]
    : e.start_year !== null ? [`started from ${e.start_year}`] : e.end_year !== null ? [`started up to ${e.end_year}`] : [];
  if (p.intent === "count") return `${[`The total number of ${trialsPhrase(p, true)}`, ...window].join(", ")}.`;
  const chart = p.chart.replace("_", " ");
  const measure = METRIC_PHRASE[p.metric];
  const parts: string[] = [];
  if (p.chart === "scatter") parts.push("enrollment against start date, one point per trial");
  else if (p.intent === "time_trend") parts.push(`${measure} per ${p.granularity ?? "year"}`);
  else if (p.intent === "network") parts.push(p.edge_kind ? EDGE_PHRASE[p.edge_kind] : "which entities appear together in trials");
  else if (p.intent === "lookup") parts.push("a list of trials");
  else parts.push(`${measure} by ${p.dimension ? DIMENSION_LABEL[p.dimension].toLowerCase() : "category"}`);
  if (p.secondary) parts.push(`split by ${DIMENSION_LABEL[p.secondary].toLowerCase()}`);
  // A comparison's arms are its named things, so only the filters are added; elsewhere the trials are named in full.
  const covered = trialsPhrase(p, p.intent !== "comparison");
  if (p.intent === "comparison") parts.push(`comparing ${p.arms.map((a) => a.label).join(" and ")}`, ...(covered !== "trials" ? [`counting only ${covered}`] : []));
  else if (covered !== "trials") parts.push(`for ${covered}`);
  parts.push(...window);
  return `A ${chart} chart of ${parts.join(", ")}.`;
}

/** The trials left out for lack of a value ("1 trial without a phase is not shown."), for the notes and the subtitle; null when none were. */
export function notShown(p: Plan, agg: Aggregate): string | null {
  const parts: { n: number; what: string }[] = [];
  if (agg.kind === "buckets") {
    const m = agg.result.missing;
    if (m.enrollment) parts.push({ n: m.enrollment, what: "an enrollment count" });
    if (m.dimension) parts.push({ n: m.dimension, what: WITHOUT[p.dimension ?? "phase"] });
    if (m.secondary && p.secondary) parts.push({ n: m.secondary, what: WITHOUT[p.secondary] });
  } else if (agg.kind === "points" && agg.withoutValue) {
    parts.push({ n: agg.withoutValue, what: "a start date or an enrollment count" });
  }
  if (!parts.length) return null;
  const phrase = parts.map((x) => `${trials(x.n)} without ${x.what}`).join(" and ");
  const one = parts.length === 1 && parts[0]!.n === 1;
  return `${phrase} ${one ? "is" : "are"} not shown.`;
}

/** "The 25 most recently started are shown.", or the one trial or link when there is one. */
const shownCut = (n: number, one: string, many: string) => (n === 1 ? `The ${one} is shown.` : `The ${fmt(n)} ${many} are shown.`);

/**
 * The counts and caveats as sentences: the registry's total (per arm for a comparison) and how much of it was read, the filters, the
 * counting rule, what is left out, and the data date. Never generated.
 */
export function subtitle(p: Plan, ctx: SpecContext, agg: Aggregate): string {
  const perArm = ctx.arm_totals.length > 1 ? listed(ctx.arm_totals.map((a) => `${cap(a.label)} ${fmt(a.total)}`)) : null;
  const read = ctx.truncated ? `; the ${fmt(ctx.fetched)} most recently started were read` : "";
  const sentences = [`${perArm ?? fmt(ctx.total_count)} trials on ClinicalTrials.gov${read}.`];
  const only = [p.recruiting_only ? "recruiting" : "", p.phase ? PHASE_PHRASE[p.phase] : ""].filter(Boolean).join(" ");
  if (only) sentences.push(`${cap(only)} trials only.`);
  if (agg.kind === "buckets" && p.dimension) {
    const r = agg.result; const plural = DIMENSION_LABEL_PLURAL[p.dimension];
    if (r.multiValued) sentences.push(`Each trial is counted once per ${singular(plural)}.`);
    if (r.omitted > 0) sentences.push(r.omitted === 1 ? `1 more ${singular(plural)} is not shown.` : `${fmt(r.omitted)} more ${plural} are not shown.`);
  }
  const missing = notShown(p, agg);
  if (missing) sentences.push(missing);
  if (agg.kind === "points" && agg.dropped > 0) sentences.push(shownCut(agg.points.length, "most recent trial", "most recent trials"));
  if (agg.kind === "rows" && agg.studies.length < ctx.total_count) sentences.push(shownCut(agg.studies.length, "most recently started trial", "most recently started"));
  if (agg.kind === "graph" && agg.prunedEdges > 0) sentences.push(shownCut(agg.edges.length, "strongest link", "strongest links"));
  sentences.push(`Data as of ${ctx.data_timestamp.slice(0, 10)}.`);
  return sentences.join(" ");
}

const yAxis = (m: Metric) => ({ field: m, type: "quantitative" as const, label: METRIC_LABEL[m], unit: METRIC_UNIT[m] });
const seriesLabel = (p: Plan): string => p.secondary ? DIMENSION_LABEL[p.secondary] : p.intent === "comparison" ? comparisonAxisLabel(p) : "Series";
function comparisonAxisLabel(p: Plan): string {
  const q = p.arms.flatMap((a) => Object.keys(a.query));
  if (q.includes("intr")) return "Drug"; if (q.includes("cond")) return "Condition"; if (q.includes("spons")) return "Sponsor"; if (q.includes("locn")) return "Country";
  const e = p.entities;
  if (e.drugs.length >= 2) return "Drug"; if (e.conditions.length >= 2) return "Condition"; if (e.sponsors.length >= 2) return "Sponsor"; if (e.countries.length >= 2) return "Country";
  return "Arm";
}
const seriesValueLabel = (p: Plan, v: string) => (p.secondary ? bucketLabel(p.secondary, v) : v);

/** Category keys by their value summed over series, highest first; ties keep the given order. */
function byValue(r: Bucketized): string[] {
  const total = new Map<string, number>();
  for (const b of r.buckets) total.set(b.key, (total.get(b.key) ?? 0) + b.value);
  return [...r.order].sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0));
}

export function buildVisualization(p: Plan, agg: Aggregate, ctx: SpecContext, title: string | null): Visualization {
  const head = { title: title?.trim() || templateTitle(p), subtitle: subtitle(p, ctx, agg) };
  const k = ctx.citations_per_point;

  if (agg.kind === "buckets") {
    const r = agg.result; const dim = p.dimension ?? "phase"; const m = p.metric;
    const rowOf = (b: typeof r.buckets[number], extra: Record<string, string | number | null> = {}): DataRow =>
      row({ ...extra, ...(b.series !== null ? { series: seriesValueLabel(p, b.series) } : {}), [m]: b.value }, b.count ?? b.studies.length, citeBucket(b.studies, dim, b.key, k));
    const series = r.seriesValues.length ? { field: "series", label: seriesLabel(p), values: r.seriesValues.map((v) => seriesValueLabel(p, v)) } : undefined;
    if (p.chart === "line") {
      return { type: "line", ...head, encoding: { x: { field: "period", type: "temporal", granularity: p.granularity ?? "year", label: "Start date" }, y: yAxis(m), ...(series ? { series } : {}) }, data: r.buckets.map((b) => rowOf(b, { period: b.key })) };
    }
    if (p.chart === "histogram") {
      const bins = dim === "enrollment" ? ENROLLMENT_BINS.filter((bin) => r.order.includes(bin.label)) : r.order.map((key) => ({ label: key, min: Number(key), max: Number(key) }));
      return { type: "histogram", ...head, encoding: { x: { field: dim, type: "ordinal", label: DIMENSION_LABEL[dim], bins }, y: yAxis(m) }, data: r.buckets.map((b) => rowOf(b, { [dim]: b.label, [`${dim}_key`]: b.key })) };
    }
    if (p.chart === "map") {
      return { type: "map", ...head, encoding: { geo: { field: "country", code_field: "iso3", level: "country" }, value: { field: m, label: METRIC_LABEL[m], unit: METRIC_UNIT[m] } }, data: r.buckets.map((b) => rowOf(b, { country: b.key, iso3: iso3(b.key) })) };
    }
    const xField = dim === "start_year" ? "period" : dim;
    const ordinal = dim === "start_year" || fixedOrder(dim) !== null;
    const ranked = p.intent === "ranking" || (!ordinal && p.intent !== "comparison");
    // An open dimension arrives ranked by value; a ranking over a closed or temporal one arrives in its fixed order, so it is re-sorted
    // here (stable, so ties keep that order) to match `sort: "value_desc"`.
    const order = ranked && ordinal ? byValue(r) : r.order;
    const position = new Map(order.map((key, i) => [key, i]));
    const buckets = [...r.buckets].sort((a, b) => position.get(a.key)! - position.get(b.key)!);
    const x = { field: xField, type: ordinal ? ("ordinal" as const) : ("nominal" as const), label: DIMENSION_LABEL[dim], order: order.map((key) => bucketLabel(dim, key)) };
    const encoding = { x, y: yAxis(m), orientation: ranked ? ("horizontal" as const) : ("vertical" as const), sort: ranked ? ("value_desc" as const) : ("x_order" as const) };
    const data = buckets.map((b) => rowOf(b, { [xField]: b.label, [`${xField}_key`]: b.key, ...(dim === "country" ? { iso3: iso3(b.key) } : {}) }));
    if (p.chart === "grouped_bar" && series) return { type: "grouped_bar", ...head, encoding: { ...encoding, series }, data };
    if (p.chart === "stacked_bar" && series) return { type: "stacked_bar", ...head, encoding: { ...encoding, series }, data };
    return { type: "bar", ...head, encoding, data };
  }

  if (agg.kind === "points") {
    const phases = fixedOrder("phase")!.filter((ph) => agg.points.some((pt) => pt.phase === ph)).map((ph) => bucketLabel("phase", ph));
    const multi = p.arms.length > 1;
    return {
      type: "scatter", ...head,
      encoding: {
        x: { field: "start_date", type: "temporal", label: "Start date" }, y: { field: "enrollment", type: "quantitative", label: "Enrollment", unit: "participants" },
        color: { field: "phase", label: "Phase", values: phases }, ...(multi ? { series: { field: "series", label: comparisonAxisLabel(p), values: p.arms.map((a) => a.label) } } : {}), point_id: "nct_id",
      },
      data: agg.points.map((pt) => row({ nct_id: pt.nct_id, title: pt.title, start_date: pt.start_date, enrollment: pt.enrollment, phase: bucketLabel("phase", pt.phase), ...(multi ? { series: pt.series ?? "" } : {}) }, 1, [citeSelf(pt.study)])),
    };
  }

  if (agg.kind === "graph") {
    return {
      type: "network_graph", ...head,
      encoding: { nodes: { id_field: "id", label_field: "label", kind_field: "kind", size_field: "size", kinds: agg.kinds }, edges: { source_field: "source", target_field: "target", weight_field: "weight" }, layout: "force" },
      data: {
        nodes: agg.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, size: n.size, study_count: n.study_count })),
        edges: agg.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight, study_count: e.weight, citations: citeEdge(e.studies, { field: KIND_FIELD[e.a.kind]!, value: e.a.value }, { field: KIND_FIELD[e.b.kind]!, value: e.b.value }, k) })),
      },
    };
  }

  if (agg.kind === "rows") {
    return {
      type: "table", ...head,
      encoding: {
        columns: [
          { field: "nct_id", label: "NCT ID", type: "string" }, { field: "title", label: "Title", type: "string" }, { field: "status", label: "Status", type: "string" },
          { field: "phases", label: "Phases", type: "list" }, { field: "start_date", label: "Start", type: "date" }, { field: "sponsor", label: "Lead sponsor", type: "string" },
          { field: "conditions", label: "Conditions", type: "list" }, { field: "enrollment", label: "Enrollment", type: "number" },
        ],
        sort: { field: "start_date", direction: "desc" },
      },
      data: agg.studies.map((s) => row({
        nct_id: s.nct_id, title: s.title || s.nct_id, status: bucketLabel("status", s.status), phases: s.phases.map((ph) => bucketLabel("phase", ph)).join(", "),
        start_date: s.start_date, sponsor: s.lead_sponsor.name, conditions: conditionIdentity(s).join(", "), enrollment: s.enrollment,
      }, 1, [citeSelf(s)])),
    };
  }

  const citations: Citation[] = mostRecent(agg.studies, k).map(citeSelf);
  return { type: "single_value", ...head, encoding: { value: { field: "value", label: METRIC_LABEL[p.metric], unit: METRIC_UNIT[p.metric] } }, data: [row({ value: agg.total, label: "trials" }, agg.total, citations)] };
}
