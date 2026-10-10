import { asList, QueryResponse, VERSION, type ChartType, type ErrorBody, type Interpretation, type Judged, type Meta, type QueryRequest } from "@chatctg/contracts";
import { FakeCtgovClient, type CtgovClient, type CtgovFailureReason, type CtgovRequestLog, type Study } from "@chatctg/ctgov";
import { FakeJudgmentClient, interpretationQuestions, interpretationState, type JudgmentClient, type ProvidedFields, type Scripted } from "@chatctg/judgment";
import { bucketize, mergeArms, type Bucketized } from "./aggregate/buckets";
import { buildGraph } from "./aggregate/graph";
import { boundaryPeriod, MAX_YEARS, trimThrough, withinYear, yearBuckets, yearRange, type YearCount } from "./aggregate/periods";
import { scatterPoints } from "./aggregate/points";
import { tableRows } from "./aggregate/rows";
import { fakeExtractor, type Extractor } from "./extract";
import { judgedEvent } from "./judged";
import { DIMENSION_LABEL_PLURAL } from "./dimensions";
import { armFilters, DEFAULT_LIMITS, plan, type Entities, type Plan } from "./plan";
import { buildVisualization, METRIC_UNIT, notShown, planSummary, type Aggregate } from "./spec";
import { fakeTitler, type Titler } from "./title";
import { SAMPLE } from "./test-studies";

export interface Deps { judge: JudgmentClient; extract: Extractor; title: Titler; ctgov: CtgovClient; models?: { extractor: string; titler: string }; now?: () => number; today?: () => string }
export type QueryEvent =
  | { event: "judged"; data: Judged }
  | { event: "interpretation"; data: { interpretation: Interpretation; chart: ChartType; arms: { label: string; filters: Record<string, string> }[] } }
  | { event: "progress"; data: { arm: string; fetched: number; total: number } }
  | { event: "title"; data: { title: string } };
export type RunResult = { ok: true; status: 200; body: QueryResponse } | { ok: false; status: 422 | 500 | 502 | 504; body: ErrorBody };
export const OVERALL_TIMEOUT_MS = 40_000;
const TITLE_CAP_MS = 4_000;
const COUNT_FETCH = 50;
const fmt = (n: number) => n.toLocaleString("en-US");

const error = (status: 422 | 500 | 502 | 504, code: ErrorBody["error"]["code"], message: string, details?: unknown): RunResult => ({ ok: false, status, body: { error: { code, message, ...(details !== undefined ? { details } : {}) } } });
const upstream = (which: "jev" | "openai" | "ctgov", reason: string, detail?: string): RunResult =>
  error(502, "upstream_failed", `${which === "jev" ? "Classifier" : which === "openai" ? "LLM" : "ClinicalTrials.gov"} did not answer (${reason})`, { upstream: which, reason, ...(detail ? { detail } : {}) });

/** The title never holds the response: after the cap it is the template title. */
async function cappedTitle(deps: Deps, summary: string, signal: AbortSignal): Promise<{ title: string | null; ms: number }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t0 = Date.now();
  const cap = new Promise<{ title: null; ms: number }>((resolve) => { timer = setTimeout(() => resolve({ title: null, ms: TITLE_CAP_MS }), TITLE_CAP_MS); timer.unref?.(); });
  const titled = (async () => { try { return await deps.title(summary, signal); } catch { return { title: null, ms: Date.now() - t0 }; } })();
  try { return await Promise.race([titled, cap]); } finally { clearTimeout(timer); }
}

export async function runQuery(request: QueryRequest, deps: Deps, onEvent?: (e: QueryEvent) => void, outer?: AbortSignal): Promise<RunResult> {
  const now = deps.now ?? Date.now; const started = now();
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const timeout = AbortSignal.timeout(OVERALL_TIMEOUT_MS);
  const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
  if (signal.aborted) return error(504, "timeout", "The request was aborted before it started");
  let done = false;
  const emit = (e: QueryEvent) => { if (done) return; try { onEvent?.(e); } catch { /* a listener must not break the pipeline */ } };

  try {
  // 1. Interpret: Jev and the extractor, in parallel. Jev answers in about 200 ms and the extractor in about a second, so the
  // judgment is sent as soon as it lands, with the chart it implies, while the names are still being read.
  const provided: ProvidedFields = {
    ...(request.drug_name !== undefined ? { drugs: asList(request.drug_name) } : {}), ...(request.condition !== undefined ? { conditions: asList(request.condition) } : {}),
    ...(request.sponsor !== undefined ? { sponsors: asList(request.sponsor) } : {}), ...(request.country !== undefined ? { countries: asList(request.country) } : {}),
    ...(request.trial_phase !== undefined ? { trial_phase: request.trial_phase } : {}), ...(request.trial_status !== undefined ? { trial_status: request.trial_status } : {}),
    ...(request.start_year !== undefined ? { start_year: request.start_year } : {}), ...(request.end_year !== undefined ? { end_year: request.end_year } : {}),
  };
  let judged_ms = 0;
  const judging = deps.judge.ask({ state: interpretationState(request.query, provided), questions: interpretationQuestions(), signal }).then((r) => {
    judged_ms = now() - started;
    const early = r.ok && !signal.aborted ? judgedEvent(r.answers, request, r.ms) : null;
    if (early) emit({ event: "judged", data: early });
    return r;
  });
  const [judged, extracted] = await Promise.all([judging, deps.extract(request.query, today(), signal)]);
  if (signal.aborted) return error(504, "timeout", "The request timed out while interpreting the question");
  if (!judged.ok) return upstream("jev", judged.reason, judged.detail);
  if (!extracted.ok) return upstream("openai", extracted.reason, extracted.detail);

  // 2. Plan.
  const planned = plan({ answers: judged.answers, entities: extracted.entities, request, models: { judge: judged.model, extractor: deps.models?.extractor ?? "extractor", titler: deps.models?.titler ?? "titler" } });
  if (!planned.ok) return error(422, "not_answerable", planned.message, { interpretation: planned.interpretation });
  const p = planned.plan;
  emit({ event: "interpretation", data: { interpretation: p.interpretation, chart: p.chart, arms: p.arms.map((a) => ({ label: a.label, filters: armFilters(a) })) } });

  // 3. Fetch every arm, with the title written meanwhile.
  const titleP = cappedTitle(deps, planSummary(p), signal).then((t) => { if (t.title) emit({ event: "title", data: { title: t.title } }); return t; });
  const fetchStart = now();
  // A count reads a page for its citations and a table reads only its rows (the registry returns the most recently started first);
  // every other chart aggregates up to max_studies.
  const maxStudies = p.chart === "single_value" ? Math.min(COUNT_FETCH, request.max_studies)
    : p.chart === "table" ? Math.min(p.limit ?? DEFAULT_LIMITS.table, request.max_studies)
    : request.max_studies;
  const fetched = await Promise.all(p.arms.map((arm) => deps.ctgov.fetchStudies(arm.query, { maxStudies, signal, onPage: (f, t) => emit({ event: "progress", data: { arm: arm.label, fetched: f, total: t } }) })));
  if (signal.aborted) return error(504, "timeout", "The request timed out while fetching from ClinicalTrials.gov");
  for (const f of fetched) if (!f.ok) return upstream("ctgov", f.reason, f.detail);
  const results = fetched.filter((f): f is Extract<typeof f, { ok: true }> => f.ok);
  // A sample of the most recently started trials holds only the last few years of a long series, so a yearly trial count over a
  // truncated fetch asks the registry for each year's exact count instead.
  const anyTruncated = results.some((r) => r.truncated);
  const overTime = p.dimension === "start_year" && p.chart !== "scatter";
  let yearly: YearCounts | null = null;
  if (overTime && anyTruncated && p.granularity === "year" && p.secondary === null && p.metric === "trial_count") {
    const counted = await countPerYear(p, deps.ctgov, request.citations_per_point, Number(today().slice(0, 4)), signal);
    if (signal.aborted) return error(504, "timeout", "The request timed out while fetching from ClinicalTrials.gov");
    if (!counted.ok) return upstream("ctgov", counted.reason, counted.detail);
    yearly = counted;
  }
  const fetch_ms = now() - fetchStart;

  // 4. Aggregate.
  const aggStart = now();
  const all = results.flatMap((r) => r.studies);
  let agg: Aggregate;
  if (yearly) {
    const opts = { dimension: "start_year" as const, secondary: null, metric: p.metric, granularity: "year" as const, limit: null };
    const parts = yearly.arms.map((counts, i) => ({ label: p.arms[i]!.label, result: yearBuckets(counts) }));
    agg = { kind: "buckets", result: parts.length > 1 ? mergeArms(parts, opts) : parts[0]!.result };
  } else {
    agg = aggregate(p, results.map((r, i) => ({ label: p.arms[i]!.label, studies: r.studies, total: r.totalCount })), all);
  }
  // Any other series over time from a truncated fetch keeps the sample, cut after the period of the oldest trial read: that period
  // and those before it are incomplete, the later ones complete.
  let incomplete: { from: string; read: number } | null = null;
  if (!yearly && overTime && anyTruncated && agg.kind === "buckets") {
    const cuts = results.filter((r) => r.truncated).map((r) => ({ at: boundaryPeriod(r.studies, p.granularity ?? "year"), read: r.fetched })).filter((c): c is { at: string; read: number } => c.at !== null);
    const cut = cuts.reduce<{ at: string; read: number } | null>((a, c) => (a === null || c.at > a.at ? c : a), null);
    const trimmed = cut ? trimThrough(agg.result, cut.at) : null;
    if (cut && trimmed) { agg = { kind: "buckets", result: trimmed.result }; incomplete = { from: trimmed.from, read: cut.read }; }
  }
  const aggregate_ms = now() - aggStart;

  // 5. Spec and meta.
  const version = await deps.ctgov.version();
  const title = await titleP;
  const total_count = results.reduce((n, r) => n + r.totalCount, 0);
  // Exact yearly counts read only the citations of each year.
  const fetched_count = yearly ? yearly.fetched : results.reduce((n, r) => n + r.fetched, 0);
  // A count is the registry's exact total, a table is exactly the most recently started rows, and exact yearly counts are exact:
  // none is a sample.
  const isCount = p.chart === "single_value"; const isTable = p.chart === "table";
  const truncated = !isCount && !isTable && !yearly && anyTruncated;
  const arm_totals = results.map((r, i) => ({ label: p.arms[i]!.label, total: r.totalCount }));
  const ctx = { total_count, fetched: fetched_count, truncated, data_timestamp: version.dataTimestamp, citations_per_point: request.citations_per_point, arm_totals };
  const visualization = buildVisualization(p, agg, ctx, title.title);
  const notes = [...p.notes];
  const warnings: string[] = [];
  let studies_without_value = 0, omitted_categories = 0;
  if (agg.kind === "buckets") {
    studies_without_value = agg.result.withoutValue; omitted_categories = agg.result.omitted;
    if (agg.result.multiValued && p.dimension) notes.push(p.dimension === "phase" ? "A trial with several phases is counted once per value (once per phase for a Phase 1/2 trial)." : `A trial with several ${DIMENSION_LABEL_PLURAL[p.dimension]} is counted once per value.`);
    if (p.dimension === "drug" || p.dimension === "condition") notes.push("Drugs and conditions are identified by their MeSH terms when the registry mapped any, else by the names as registered.");
    if (p.chart === "map" && visualization.type === "map") { const unmapped = visualization.data.filter((r) => r.iso3 === null).length; if (unmapped) warnings.push(`${unmapped} countries could not be mapped to an ISO code and are listed without a location.`); }
  }
  if (agg.kind === "points") { studies_without_value = agg.withoutValue; if (agg.dropped) warnings.push(`${agg.dropped} trials beyond the 500 most recent are not plotted.`); }
  const missing = notShown(p, agg);
  if (missing) notes.push(missing.note);
  if (agg.kind === "graph") {
    notes.push("Nodes are identified by MeSH terms (drugs, conditions) or registered names (sponsors, collaborators); edge weight is the number of trials where both co-occur.");
    const kept = agg.edges.length, all = kept + agg.prunedEdges;
    if (agg.prunedEdges > 0) warnings.push(kept === 1 ? `Only the strongest link of ${fmt(all)} is shown.` : `Only the ${fmt(kept)} strongest links of ${fmt(all)} are shown.`);
  }
  if (p.arms.length > 1) notes.push("A trial can match more than one arm, so coverage.total_count, the sum of the arms' totals, can count it more than once.");
  if (isCount) notes.push(`The count is the registry's total; the ${fmt(fetched_count)} most recently started trials were read for citations.`);
  if (isTable && agg.kind === "rows" && agg.studies.length < total_count) notes.push(`The table lists the ${fmt(agg.studies.length)} most recently started of ${fmt(total_count)} trials.`);
  if (truncated) warnings.push(`Only the ${fmt(fetched_count)} most recently started of ${fmt(total_count)} trials were read; counts are over that sample, the total is exact.`);
  if (incomplete) warnings.push(`Periods before ${incomplete.from} are incomplete because only the ${fmt(incomplete.read)} most recently started trials were read; they are not shown.`);
  if (yearly) {
    notes.push(`Counts per year are exact (one registry count per year); citations show the ${fmt(request.citations_per_point)} most recent trials of each year.`);
    if (yearly.cutBefore !== null) warnings.push(`Years before ${yearly.cutBefore} are not shown.`);
  }
  if (p.interpretation.chart.reason) notes.push(p.interpretation.chart.reason);
  if (p.interpretation.intent.alternatives.length) notes.push("The intent was uncertain; alternatives are listed in meta.interpretation.intent.alternatives.");

  const meta: Meta = {
    query: request.query,
    interpretation: p.interpretation,
    arms: p.arms.map((a) => ({ label: a.label, filters: armFilters(a) })),
    source: { name: "clinicaltrials.gov", api_version: version.apiVersion, data_timestamp: version.dataTimestamp, requests: [...results.flatMap((r) => r.requests), ...(yearly?.requests ?? [])] },
    coverage: { total_count, fetched_count, truncated, sorted_by: "StartDate:desc", studies_without_value, omitted_categories },
    units: { y: METRIC_UNIT[p.metric] }, granularity: p.granularity,
    timing: { jev_ms: judged.ms, judged_ms, extract_ms: extracted.ms, fetch_ms, title_ms: title.ms, aggregate_ms, total_ms: now() - started },
    notes, warnings, version: VERSION,
  };
  const body = QueryResponse.safeParse({ visualization, meta });
  if (!body.success) return error(500, "internal", "The response did not match its own contract", { issues: body.error.issues.slice(0, 5) });
  return { ok: true, status: 200, body: body.data };
  } catch (e) {
    return error(500, "internal", "Unexpected failure while answering the question", { detail: String(e).slice(0, 300) });
  } finally {
    done = true;
  }
}

type YearCounts =
  | { ok: true; arms: YearCount[][]; requests: CtgovRequestLog[]; fetched: number; cutBefore: number | null }
  | { ok: false; reason: CtgovFailureReason; detail?: string };

/**
 * Each arm's exact trial count per start year: one registry request per year and arm, in parallel, each reading the `k` most recently
 * started trials of its year for citations. The years run from the question's start year, else the arm's oldest start date (one request
 * sorted ascending), to its end year, else two years ahead (registered start dates can be planned ones), keeping the latest MAX_YEARS.
 */
async function countPerYear(p: Plan, ctgov: CtgovClient, k: number, thisYear: number, signal: AbortSignal): Promise<YearCounts> {
  const requests: CtgovRequestLog[] = [];
  const to = p.entities.end_year ?? thisYear + 2;
  let from = p.entities.start_year;
  if (from === null) {
    const oldest = await Promise.all(p.arms.map((arm) => ctgov.fetchStudies(arm.query, { maxStudies: 1, sort: "StartDate:asc", signal })));
    const years: number[] = [];
    for (const r of oldest) {
      if (!r.ok) return { ok: false, reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) };
      requests.push(...r.requests);
      for (const s of r.studies) if (s.start_year !== null) years.push(s.start_year);
    }
    from = years.length ? Math.min(...years) : to - MAX_YEARS + 1;
  }
  const { years, cutBefore } = yearRange(from, to);
  const calls = await Promise.all(p.arms.flatMap((arm) => years.map((y) => ctgov.fetchStudies({ ...arm.query, advanced: withinYear(arm.query.advanced, y) }, { maxStudies: k, signal }))));
  const arms: YearCount[][] = p.arms.map(() => []);
  let fetched = 0;
  for (const [i, r] of calls.entries()) {
    if (!r.ok) return { ok: false, reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) };
    requests.push(...r.requests); fetched += r.fetched;
    arms[Math.floor(i / years.length)]!.push({ year: years[i % years.length]!, total: r.totalCount, studies: r.studies });
  }
  return { ok: true, arms, requests, fetched, cutBefore };
}

function aggregate(p: Plan, arms: { label: string; studies: Study[]; total: number }[], all: Study[]): Aggregate {
  switch (p.chart) {
    case "network_graph": return { kind: "graph", ...buildGraph(all, p.edge_kind ?? "sponsor_drug", p.limit ?? 40) };
    case "scatter": {
      const parts = arms.length > 1 ? arms.map((a) => scatterPoints(a.studies, a.label)) : [scatterPoints(all, null)];
      return { kind: "points", points: parts.flatMap((x) => x.points), dropped: parts.reduce((n, x) => n + x.dropped, 0), withoutValue: parts.reduce((n, x) => n + x.withoutValue, 0) };
    }
    case "table": return { kind: "rows", studies: tableRows(all, p.limit ?? 25) };
    case "single_value": return { kind: "value", total: arms.reduce((n, a) => n + a.total, 0), studies: all };
    default: {
      const opts = { dimension: p.dimension ?? "phase", secondary: p.secondary, metric: p.metric, granularity: p.granularity, limit: p.limit };
      const result: Bucketized = arms.length > 1 ? mergeArms(arms.map((a) => ({ label: a.label, result: bucketize(a.studies, { ...opts, limit: null }) })), opts) : bucketize(all, opts);
      return { kind: "buckets", result };
    }
  }
}

/** Everything offline: a scripted judge, canned entities, sample studies, a fixed title. */
export function fakeDeps(script: Record<string, Scripted>, entities: Partial<Entities>, studies: Study[] = SAMPLE, total = studies.length): Deps & { judge: FakeJudgmentClient; ctgov: FakeCtgovClient } {
  const base: Record<string, Scripted> = { in_scope: { noul: 0.95 }, intent: { choice: "distribution" }, dimension: { choice: "phase" }, secondary_dimension: { choice: "none" }, chart: { choice: "bar" }, chart_named: { noul: 0.1 }, granularity: { choice: "year" }, metric: { choice: "trial_count" }, edge_kind: { choice: "sponsor_drug" }, recruiting_only: { noul: 0.1 }, combination: { noul: 0.1 }, phase_filter: { choice: "none" } };
  return { judge: new FakeJudgmentClient({ ...base, ...script }), extract: fakeExtractor(entities), title: fakeTitler("Fake title"), ctgov: new FakeCtgovClient(studies, total), today: () => "2026-10-09" };
}
