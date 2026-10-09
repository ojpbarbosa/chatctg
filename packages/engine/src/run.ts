import { asList, QueryResponse, VERSION, type ChartType, type ErrorBody, type Interpretation, type Meta, type QueryRequest } from "@cheiron/contracts";
import { FakeCtgovClient, type CtgovClient, type Study } from "@cheiron/ctgov";
import { FakeJudgmentClient, interpretationQuestions, interpretationState, type JudgmentClient, type ProvidedFields, type Scripted } from "@cheiron/judgment";
import { bucketize, mergeArms, type Bucketized } from "./aggregate/buckets";
import { buildGraph } from "./aggregate/graph";
import { scatterPoints } from "./aggregate/points";
import { tableRows } from "./aggregate/rows";
import { fakeExtractor, type Extractor } from "./extract";
import { armFilters, plan, type Entities, type Plan } from "./plan";
import { buildVisualization, METRIC_UNIT, planSummary, type Aggregate } from "./spec";
import { fakeTitler, type Titler } from "./title";
import { SAMPLE } from "./test-studies";

export interface Deps { judge: JudgmentClient; extract: Extractor; title: Titler; ctgov: CtgovClient; models?: { extractor: string; titler: string }; now?: () => number; today?: () => string }
export type QueryEvent =
  | { event: "interpretation"; data: { interpretation: Interpretation; chart: ChartType; arms: { label: string; filters: Record<string, string> }[] } }
  | { event: "progress"; data: { arm: string; fetched: number; total: number } }
  | { event: "title"; data: { title: string } };
export type RunResult = { ok: true; status: 200; body: QueryResponse } | { ok: false; status: 422 | 500 | 502 | 504; body: ErrorBody };
export const OVERALL_TIMEOUT_MS = 40_000;
const TITLE_CAP_MS = 4_000;
const COUNT_FETCH = 50;

const error = (status: 422 | 500 | 502 | 504, code: ErrorBody["error"]["code"], message: string, details?: unknown): RunResult => ({ ok: false, status, body: { error: { code, message, ...(details !== undefined ? { details } : {}) } } });
const upstream = (which: "jev" | "openai" | "ctgov", reason: string, detail?: string): RunResult =>
  error(502, "upstream_failed", `${which === "jev" ? "Jev" : which === "openai" ? "OpenAI" : "ClinicalTrials.gov"} did not answer (${reason})`, { upstream: which, reason, ...(detail ? { detail } : {}) });

/** The title never holds the response: after the cap it is the template title. */
async function cappedTitle(deps: Deps, summary: string, signal: AbortSignal): Promise<{ title: string | null; ms: number }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<{ title: null; ms: number }>((resolve) => { timer = setTimeout(() => resolve({ title: null, ms: TITLE_CAP_MS }), TITLE_CAP_MS); });
  try { return await Promise.race([deps.title(summary, signal), cap]); } finally { clearTimeout(timer); }
}

export async function runQuery(request: QueryRequest, deps: Deps, onEvent?: (e: QueryEvent) => void, outer?: AbortSignal): Promise<RunResult> {
  const now = deps.now ?? Date.now; const started = now();
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const timeout = AbortSignal.timeout(OVERALL_TIMEOUT_MS);
  const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
  if (signal.aborted) return error(504, "timeout", "The request was aborted before it started");
  const emit = (e: QueryEvent) => { try { onEvent?.(e); } catch { /* a listener must not break the pipeline */ } };

  // 1. Interpret: Jev and the extractor, in parallel.
  const provided: ProvidedFields = {
    ...(request.drug_name !== undefined ? { drugs: asList(request.drug_name) } : {}), ...(request.condition !== undefined ? { conditions: asList(request.condition) } : {}),
    ...(request.sponsor !== undefined ? { sponsors: asList(request.sponsor) } : {}), ...(request.country !== undefined ? { countries: asList(request.country) } : {}),
    ...(request.trial_phase !== undefined ? { trial_phase: request.trial_phase } : {}), ...(request.status !== undefined ? { status: request.status } : {}),
    ...(request.start_year !== undefined ? { start_year: request.start_year } : {}), ...(request.end_year !== undefined ? { end_year: request.end_year } : {}),
  };
  const [judged, extracted] = await Promise.all([
    deps.judge.ask({ state: interpretationState(request.query, provided), questions: interpretationQuestions(), signal }),
    deps.extract(request.query, today(), signal),
  ]);
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
  const maxStudies = p.chart === "single_value" ? Math.min(COUNT_FETCH, request.max_studies) : request.max_studies;
  const fetched = await Promise.all(p.arms.map((arm) => deps.ctgov.fetchStudies(arm.query, { maxStudies, signal, onPage: (f, t) => emit({ event: "progress", data: { arm: arm.label, fetched: f, total: t } }) })));
  const fetch_ms = now() - fetchStart;
  if (signal.aborted) return error(504, "timeout", "The request timed out while fetching from ClinicalTrials.gov");
  for (const f of fetched) if (!f.ok) return upstream("ctgov", f.reason, f.detail);
  const results = fetched.filter((f): f is Extract<typeof f, { ok: true }> => f.ok);

  // 4. Aggregate.
  const aggStart = now();
  const all = results.flatMap((r) => r.studies);
  const agg = aggregate(p, results.map((r, i) => ({ label: p.arms[i]!.label, studies: r.studies, total: r.totalCount })), all);
  const aggregate_ms = now() - aggStart;

  // 5. Spec and meta.
  const version = await deps.ctgov.version();
  const title = await titleP;
  const total_count = results.reduce((n, r) => n + r.totalCount, 0);
  const fetched_count = results.reduce((n, r) => n + r.fetched, 0);
  const truncated = results.some((r) => r.truncated);
  const ctx = { total_count, fetched: fetched_count, truncated, data_timestamp: version.dataTimestamp, citations_per_datum: request.citations_per_datum };
  const visualization = buildVisualization(p, agg, ctx, title.title);
  const notes = [...p.notes];
  const warnings: string[] = [];
  let studies_without_value = 0, omitted_categories = 0;
  if (agg.kind === "buckets") {
    studies_without_value = agg.result.withoutValue; omitted_categories = agg.result.omitted;
    if (agg.result.multiValued && p.dimension) notes.push(`A trial with several ${p.dimension === "phase" ? "phases" : p.dimension.replace("_", " ") + " values"} is counted once per value (once per phase for a Phase 1/2 trial).`);
    if (p.dimension === "drug" || p.dimension === "condition") notes.push("Drugs and conditions are identified by their MeSH terms when the registry mapped any, else by the names as registered.");
    if (p.chart === "map" && visualization.type === "map") { const unmapped = visualization.data.filter((r) => r.iso3 === null).length; if (unmapped) warnings.push(`${unmapped} countries could not be mapped to an ISO code and are listed without a location.`); }
  }
  if (agg.kind === "points") { studies_without_value = agg.withoutValue; if (agg.dropped) warnings.push(`${agg.dropped} trials beyond the 500 most recent are not plotted.`); }
  if (agg.kind === "graph") notes.push("Nodes are identified by MeSH terms (drugs, conditions) or registered names (sponsors, collaborators); edge weight is the number of trials where both co-occur.");
  if (truncated) warnings.push(`Only the ${fetched_count.toLocaleString("en-US")} most recently started of ${total_count.toLocaleString("en-US")} trials were read; counts are over that sample, the total is exact.`);
  if (p.interpretation.chart.reason) notes.push(p.interpretation.chart.reason);
  if (p.interpretation.intent.alternatives.length) notes.push("The intent was uncertain; alternatives are listed in meta.interpretation.intent.alternatives.");

  const meta: Meta = {
    query: request.query,
    interpretation: p.interpretation,
    arms: p.arms.map((a) => ({ label: a.label, filters: armFilters(a) })),
    source: { name: "clinicaltrials.gov", api_version: version.apiVersion, data_timestamp: version.dataTimestamp, requests: results.flatMap((r) => r.requests) },
    coverage: { total_count, fetched_count, truncated, sorted_by: "StartDate:desc", studies_without_value, omitted_categories },
    units: { y: METRIC_UNIT[p.metric] }, granularity: p.granularity,
    timing: { jev_ms: judged.ms, extract_ms: extracted.ms, fetch_ms, title_ms: title.ms, aggregate_ms, total_ms: now() - started },
    notes, warnings, version: VERSION,
  };
  const body = QueryResponse.safeParse({ visualization, meta });
  if (!body.success) return error(500, "internal", "The response did not match its own contract", { issues: body.error.issues.slice(0, 5) });
  return { ok: true, status: 200, body: body.data };
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
  const base: Record<string, Scripted> = { in_scope: { noul: 0.95 }, intent: { choice: "distribution" }, dimension: { choice: "phase" }, secondary_dimension: { choice: "none" }, chart: { choice: "bar" }, chart_named: { noul: 0.1 }, granularity: { choice: "year" }, metric: { choice: "trial_count" }, edge_kind: { choice: "sponsor_drug" }, recruiting_only: { noul: 0.1 }, combination: { noul: 0.1 } };
  return { judge: new FakeJudgmentClient({ ...base, ...script }), extract: fakeExtractor(entities), title: fakeTitler("Fake title"), ctgov: new FakeCtgovClient(studies, total), today: () => "2026-10-09" };
}
