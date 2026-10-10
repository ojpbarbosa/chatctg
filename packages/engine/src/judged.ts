import type { Judged, QueryRequest } from "@chatctg/contracts";
import type { InterpretationAnswers } from "@chatctg/judgment";
import { chartNamed, inScope, judgedIntent, judgedValue, provisionalPlan, recruitingOnly } from "./plan";

/**
 * The judgment as the planner applies it before the names in the question are read, for the `judged` event that the stream sends as
 * soon as Jev answers. Null when no chart will answer (out of scope, or intent `other`), so the stream never promises a chart it
 * then refuses.
 */
export function judgedEvent(a: InterpretationAnswers, request: QueryRequest, jevMs: number): Judged | null {
  if (!inScope(a, request)) return null;
  const p = provisionalPlan(a, request);
  if (p.shape.intent === "other") return null;
  return {
    intent: { value: p.shape.intent, p: judgedIntent(a, request).p },
    dimension: judgedValue(p.shape.dimension, a.dimension),
    secondary_dimension: judgedValue(p.shape.secondary, a.secondary_dimension),
    chart: { chosen: p.chosen, provisional: p.chart },
    chart_named: chartNamed(a, request),
    recruiting_only: recruitingOnly(a, request),
    phase_filter: p.phase,
    jev_ms: jevMs,
  };
}
